import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { createRoute, listRoutes } from "@/lib/routes";

function isValidPoint(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= -90 &&
    value[0] <= 90 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[1] >= -180 &&
    value[1] <= 180
  );
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can view routes." },
      { status: 403 }
    );
  }

  const routes = await listRoutes();
  return NextResponse.json({ routes });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can create routes." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const points = body?.points;
  const corridorM = body?.corridor_m ?? 150;

  if (!name) {
    return NextResponse.json(
      { error: "Route name is required." },
      { status: 400 }
    );
  }

  if (!Array.isArray(points) || points.length < 2 || !points.every(isValidPoint)) {
    return NextResponse.json(
      { error: "A route needs at least 2 valid [lat, lng] points." },
      { status: 400 }
    );
  }

  if (typeof corridorM !== "number" || !Number.isFinite(corridorM) || corridorM <= 0) {
    return NextResponse.json(
      { error: "Corridor width must be a positive number of meters." },
      { status: 400 }
    );
  }

  const route = await createRoute({ name, points, corridorM });
  return NextResponse.json({ route }, { status: 201 });
}
