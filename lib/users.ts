import { sql } from "./db";
import type { SessionRole } from "./auth";

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  role: SessionRole;
}

export async function findUserByUsername(
  username: string
): Promise<UserRecord | null> {
  const rows = await sql`
    SELECT id, username, password_hash, role
    FROM users
    WHERE username = ${username}
  `;

  return (rows[0] as UserRecord | undefined) ?? null;
}

export interface VehicleUser {
  id: number;
  username: string;
}

export async function listVehicleUsers(): Promise<VehicleUser[]> {
  const rows = await sql`
    SELECT id, username
    FROM users
    WHERE role = 'vehicle'
    ORDER BY username
  `;

  return rows as unknown as VehicleUser[];
}
