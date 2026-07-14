import { sql } from "./db";

export interface AssignmentRecord {
  id: number;
  routeId: number;
  vehicleUserId: number;
  vehicleUsername: string;
  active: boolean;
  createdAt: string;
}

interface AssignmentRow {
  id: number;
  route_id: number;
  vehicle_user_id: number;
  vehicle_username: string;
  active: boolean;
  created_at: string;
}

function toAssignmentRecord(row: AssignmentRow): AssignmentRecord {
  return {
    id: row.id,
    routeId: row.route_id,
    vehicleUserId: row.vehicle_user_id,
    vehicleUsername: row.vehicle_username,
    active: row.active,
    createdAt: row.created_at,
  };
}

// Only active assignments are ever shown in the dashboard (as "assigned to
// veh1" on a route), so this only selects those rather than the full
// history of every assignment a vehicle has ever had.
export async function listActiveAssignments(): Promise<AssignmentRecord[]> {
  const rows = (await sql`
    SELECT a.id, a.route_id, a.vehicle_user_id, u.username AS vehicle_username, a.active, a.created_at
    FROM assignments a
    JOIN users u ON u.id = a.vehicle_user_id
    WHERE a.active = true
    ORDER BY a.created_at DESC
  `) as unknown as AssignmentRow[];

  return rows.map(toAssignmentRecord);
}

export interface NewAssignment {
  routeId: number;
  vehicleUserId: number;
}

// Thrown for problems the caller (the API route) should report as a 400,
// as opposed to unexpected errors that should bubble up as a 500.
export class AssignmentValidationError extends Error {}

export async function createAssignment(
  assignment: NewAssignment
): Promise<AssignmentRecord> {
  const routeRows = await sql`SELECT id FROM routes WHERE id = ${assignment.routeId}`;
  if (routeRows.length === 0) {
    throw new AssignmentValidationError("Route not found.");
  }

  const vehicleRows = await sql`
    SELECT id FROM users WHERE id = ${assignment.vehicleUserId} AND role = 'vehicle'
  `;
  if (vehicleRows.length === 0) {
    throw new AssignmentValidationError("Vehicle account not found.");
  }

  // A vehicle can only have one active assignment at a time. Deactivating
  // the old one and inserting the new one run as a single transaction so a
  // request that fails partway through can never leave a vehicle with two
  // active assignments.
  const results = await sql.transaction([
    sql`
      UPDATE assignments SET active = false
      WHERE vehicle_user_id = ${assignment.vehicleUserId} AND active = true
    `,
    sql`
      INSERT INTO assignments (route_id, vehicle_user_id, active)
      VALUES (${assignment.routeId}, ${assignment.vehicleUserId}, true)
      RETURNING id
    `,
  ]);

  const inserted = results[1] as unknown as { id: number }[];

  const rows = (await sql`
    SELECT a.id, a.route_id, a.vehicle_user_id, u.username AS vehicle_username, a.active, a.created_at
    FROM assignments a
    JOIN users u ON u.id = a.vehicle_user_id
    WHERE a.id = ${inserted[0].id}
  `) as unknown as AssignmentRow[];

  return toAssignmentRecord(rows[0]);
}

// "Unassigning" deactivates the row rather than deleting it, keeping a
// history of past assignments in the table for potential future use (trip
// history is listed as a later roadmap item) instead of losing that record.
export async function deactivateAssignment(id: number): Promise<void> {
  await sql`UPDATE assignments SET active = false WHERE id = ${id}`;
}
