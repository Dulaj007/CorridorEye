import { sql } from "./db";

export interface AlertRecord {
  id: number;
  vehicleUserId: number;
  vehicleUsername: string;
  routeId: number;
  routeName: string;
  lat: number;
  lng: number;
  distanceM: number;
  acknowledged: boolean;
  createdAt: string;
}

interface AlertRow {
  id: number;
  vehicle_user_id: number;
  vehicle_username: string;
  route_id: number;
  route_name: string;
  lat: number;
  lng: number;
  distance_m: number;
  acknowledged: boolean;
  created_at: string;
}

function toAlertRecord(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    vehicleUserId: row.vehicle_user_id,
    vehicleUsername: row.vehicle_username,
    routeId: row.route_id,
    routeName: row.route_name,
    lat: row.lat,
    lng: row.lng,
    distanceM: row.distance_m,
    acknowledged: row.acknowledged,
    createdAt: row.created_at,
  };
}

const ACKNOWLEDGED_HISTORY_LIMIT = 20;

export async function listUnacknowledgedAlerts(): Promise<AlertRecord[]> {
  const rows = (await sql`
    SELECT al.id, al.vehicle_user_id, u.username AS vehicle_username,
           al.route_id, r.name AS route_name,
           al.lat, al.lng, al.distance_m, al.acknowledged, al.created_at
    FROM alerts al
    JOIN users u ON u.id = al.vehicle_user_id
    JOIN routes r ON r.id = al.route_id
    WHERE al.acknowledged = false
    ORDER BY al.created_at DESC
  `) as unknown as AlertRow[];

  return rows.map(toAlertRecord);
}

export async function listRecentAcknowledgedAlerts(): Promise<AlertRecord[]> {
  const rows = (await sql`
    SELECT al.id, al.vehicle_user_id, u.username AS vehicle_username,
           al.route_id, r.name AS route_name,
           al.lat, al.lng, al.distance_m, al.acknowledged, al.created_at
    FROM alerts al
    JOIN users u ON u.id = al.vehicle_user_id
    JOIN routes r ON r.id = al.route_id
    WHERE al.acknowledged = true
    ORDER BY al.created_at DESC
    LIMIT ${ACKNOWLEDGED_HISTORY_LIMIT}
  `) as unknown as AlertRow[];

  return rows.map(toAlertRecord);
}

export async function acknowledgeAlert(id: number): Promise<void> {
  await sql`UPDATE alerts SET acknowledged = true WHERE id = ${id}`;
}
