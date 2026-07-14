import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import {
  listRecentAcknowledgedAlerts,
  listUnacknowledgedAlerts,
} from "@/lib/alerts";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can view alerts." },
      { status: 403 }
    );
  }

  const [unacknowledged, acknowledged] = await Promise.all([
    listUnacknowledgedAlerts(),
    listRecentAcknowledgedAlerts(),
  ]);

  return NextResponse.json({ unacknowledged, acknowledged });
}
