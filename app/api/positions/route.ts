import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getVehiclePositionSummaries } from "@/lib/positions";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can view vehicle positions." },
      { status: 403 }
    );
  }

  const vehicles = await getVehiclePositionSummaries();
  return NextResponse.json({ vehicles });
}
