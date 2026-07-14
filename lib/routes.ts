import { sql } from "./db";

export interface RouteRecord {
  id: number;
  name: string;
  points: [number, number][];
  corridorM: number;
  createdAt: string;
}

interface RouteRow {
  id: number;
  name: string;
  points: unknown; // JSONB column; the driver already parses this into JS values
  corridor_m: number;
  created_at: string;
}

function toRouteRecord(row: RouteRow): RouteRecord {
  return {
    id: row.id,
    name: row.name,
    points: row.points as [number, number][],
    corridorM: row.corridor_m,
    createdAt: row.created_at,
  };
}

export async function listRoutes(): Promise<RouteRecord[]> {
  const rows = (await sql`
    SELECT id, name, points, corridor_m, created_at
    FROM routes
    ORDER BY created_at DESC
  `) as unknown as RouteRow[];

  return rows.map(toRouteRecord);
}

export interface NewRoute {
  name: string;
  points: [number, number][];
  corridorM: number;
}

export async function createRoute(route: NewRoute): Promise<RouteRecord> {
  // The points column is JSONB. Stringifying here and casting with ::jsonb
  // in the query avoids relying on the driver to guess how a plain JS
  // array should be sent -- without the cast it could be encoded as a
  // Postgres array literal instead of JSON, which the column would reject.
  const pointsJson = JSON.stringify(route.points);

  const rows = (await sql`
    INSERT INTO routes (name, points, corridor_m)
    VALUES (${route.name}, ${pointsJson}::jsonb, ${route.corridorM})
    RETURNING id, name, points, corridor_m, created_at
  `) as unknown as RouteRow[];

  return toRouteRecord(rows[0]);
}

export async function deleteRoute(id: number): Promise<void> {
  await sql`DELETE FROM routes WHERE id = ${id}`;
}
