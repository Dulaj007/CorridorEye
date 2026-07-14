import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { listVehicleUsers } from "@/lib/users";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can view vehicles." },
      { status: 403 }
    );
  }

  const vehicles = await listVehicleUsers();
  return NextResponse.json({ vehicles });
}
