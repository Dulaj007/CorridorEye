import { sql } from "./db";

export interface NewPosition {
  vehicleUserId: number;
  lat: number;
  lng: number;
  accuracy: number | null;
}

export async function insertPosition(position: NewPosition): Promise<void> {
  await sql`
    INSERT INTO positions (vehicle_user_id, lat, lng, accuracy)
    VALUES (${position.vehicleUserId}, ${position.lat}, ${position.lng}, ${position.accuracy})
  `;
}

const LIVE_THRESHOLD_SECONDS = 60;
const TRAIL_LENGTH = 20;

export interface VehiclePositionSummary {
  id: number;
  username: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  lastUpdate: string; // ISO timestamp
  isLive: boolean;
  trail: [number, number][]; // oldest to newest, only populated for live vehicles
}

interface LatestPositionRow {
  id: number;
  username: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  created_at: string;
}

interface TrailRow {
  lat: number;
  lng: number;
}

// One row per vehicle that has ever reported a position: its most recent
// fix, whether that fix is recent enough to count as "live" (updated
// within the last 60 seconds), and -- for live vehicles only -- a short
// trail of recent points to draw as a polyline. Offline vehicles keep
// their last known marker on the map but do not need a trail.
export async function getVehiclePositionSummaries(): Promise<
  VehiclePositionSummary[]
> {
  const latestRows = (await sql`
    SELECT DISTINCT ON (p.vehicle_user_id)
      u.id, u.username, p.lat, p.lng, p.accuracy, p.created_at
    FROM positions p
    JOIN users u ON u.id = p.vehicle_user_id
    WHERE u.role = 'vehicle'
    ORDER BY p.vehicle_user_id, p.created_at DESC
  `) as unknown as LatestPositionRow[];

  const summaries: VehiclePositionSummary[] = [];

  for (const row of latestRows) {
    const lastUpdate = new Date(row.created_at);
    const ageSeconds = (Date.now() - lastUpdate.getTime()) / 1000;
    const isLive = ageSeconds <= LIVE_THRESHOLD_SECONDS;

    let trail: [number, number][] = [];
    if (isLive) {
      const trailRows = (await sql`
        SELECT lat, lng
        FROM positions
        WHERE vehicle_user_id = ${row.id}
        ORDER BY created_at DESC
        LIMIT ${TRAIL_LENGTH}
      `) as unknown as TrailRow[];
      trail = trailRows.map((r) => [r.lat, r.lng] as [number, number]).reverse();
    }

    summaries.push({
      id: row.id,
      username: row.username,
      lat: row.lat,
      lng: row.lng,
      accuracy: row.accuracy,
      lastUpdate: lastUpdate.toISOString(),
      isLive,
      trail,
    });
  }

  return summaries;
}
