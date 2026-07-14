import { point, lineString } from "@turf/helpers";
import { pointToLineDistance } from "@turf/point-to-line-distance";
import { sql } from "./db";

// A single deviation event is not enough to raise an alert -- a momentary
// bad GPS fix could put a vehicle briefly outside its corridor even while
// following the route correctly. Requiring several fixes in a row in the
// same off-route state filters that noise out.
const CONSECUTIVE_FIXES_REQUIRED = 3;

interface AssignedRoute {
  routeId: number;
  points: [number, number][];
  corridorM: number;
}

async function getActiveAssignedRoute(
  vehicleUserId: number
): Promise<AssignedRoute | null> {
  const rows = await sql`
    SELECT r.id AS route_id, r.points, r.corridor_m
    FROM assignments a
    JOIN routes r ON r.id = a.route_id
    WHERE a.vehicle_user_id = ${vehicleUserId} AND a.active = true
    ORDER BY a.created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0] as {
    route_id: number;
    points: unknown;
    corridor_m: number;
  };

  return {
    routeId: row.route_id,
    points: row.points as [number, number][],
    corridorM: row.corridor_m,
  };
}

// Route points are stored as [lat, lng], but Turf's GeoJSON helpers expect
// [lng, lat] -- reversing each pair here is required, not stylistic.
function distanceToRouteMeters(
  lat: number,
  lng: number,
  routePoints: [number, number][]
): number {
  const line = lineString(routePoints.map(([la, ln]) => [ln, la]));
  return pointToLineDistance(point([lng, lat]), line, { units: "meters" });
}

interface RecentFix {
  lat: number;
  lng: number;
}

async function getRecentValidFixes(
  vehicleUserId: number,
  count: number
): Promise<RecentFix[]> {
  // Fixes with accuracy worse than 50m are excluded from the streak, the
  // same way they are excluded from triggering an alert on their own --
  // one imprecise fix should not either start or break a deviation streak.
  const rows = await sql`
    SELECT lat, lng
    FROM positions
    WHERE vehicle_user_id = ${vehicleUserId}
      AND (accuracy IS NULL OR accuracy <= 50)
    ORDER BY created_at DESC
    LIMIT ${count}
  `;
  return rows as unknown as RecentFix[];
}

async function hasUnacknowledgedAlert(
  vehicleUserId: number,
  routeId: number
): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM alerts
    WHERE vehicle_user_id = ${vehicleUserId}
      AND route_id = ${routeId}
      AND acknowledged = false
    LIMIT 1
  `;
  return rows.length > 0;
}

// Called after a new position has been inserted (and only for fixes
// accurate enough to trust). Creates an alert row if the vehicle has an
// active route assignment, its last several fixes are all outside the
// corridor, and there is not already an unacknowledged alert for this
// vehicle+route pairing.
export async function checkDeviation(
  vehicleUserId: number,
  lat: number,
  lng: number
): Promise<void> {
  const assignedRoute = await getActiveAssignedRoute(vehicleUserId);
  if (!assignedRoute) {
    return;
  }

  const recentFixes = await getRecentValidFixes(
    vehicleUserId,
    CONSECUTIVE_FIXES_REQUIRED
  );
  if (recentFixes.length < CONSECUTIVE_FIXES_REQUIRED) {
    return;
  }

  const distances = recentFixes.map((fix) =>
    distanceToRouteMeters(fix.lat, fix.lng, assignedRoute.points)
  );
  const allOutsideCorridor = distances.every(
    (distance) => distance > assignedRoute.corridorM
  );
  if (!allOutsideCorridor) {
    return;
  }

  if (await hasUnacknowledgedAlert(vehicleUserId, assignedRoute.routeId)) {
    return;
  }

  // recentFixes[0] is the fix just inserted by the caller (most recent
  // first), so its distance is already the first entry in `distances`.
  const currentDistance = distances[0];

  await sql`
    INSERT INTO alerts (vehicle_user_id, route_id, lat, lng, distance_m)
    VALUES (${vehicleUserId}, ${assignedRoute.routeId}, ${lat}, ${lng}, ${currentDistance})
  `;
}
