import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { insertPosition } from "@/lib/positions";
import { checkDeviation } from "@/lib/deviation";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (session.role !== "vehicle") {
    return NextResponse.json(
      { error: "Only vehicle accounts can report positions." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const lat = body?.lat;
  const lng = body?.lng;
  const accuracy = body?.accuracy;

  const validLat = isFiniteNumber(lat) && lat >= -90 && lat <= 90;
  const validLng = isFiniteNumber(lng) && lng >= -180 && lng <= 180;
  const validAccuracy =
    accuracy === undefined ||
    accuracy === null ||
    (isFiniteNumber(accuracy) && accuracy >= 0);

  if (!validLat || !validLng || !validAccuracy) {
    return NextResponse.json(
      { error: "lat, lng, and accuracy must be valid numbers." },
      { status: 400 }
    );
  }

  const vehicleUserId = Number(session.sub);

  await insertPosition({
    vehicleUserId,
    lat,
    lng,
    accuracy: accuracy ?? null,
  });

  // A fix this coarse is still recorded (so the map trail is unbroken) but
  // is not reliable enough to use for route-deviation alerting.
  const ignored = validAccuracy && accuracy != null && accuracy > 50;

  if (!ignored) {
    await checkDeviation(vehicleUserId, lat, lng);
  }

  return NextResponse.json({ ignored });
}
