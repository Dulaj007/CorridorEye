import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import {
  createAssignment,
  listActiveAssignments,
  AssignmentValidationError,
} from "@/lib/assignments";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can view assignments." },
      { status: 403 }
    );
  }

  const assignments = await listActiveAssignments();
  return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can create assignments." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const routeId = Number(body?.route_id);
  const vehicleUserId = Number(body?.vehicle_user_id);

  if (!Number.isInteger(routeId) || !Number.isInteger(vehicleUserId)) {
    return NextResponse.json(
      { error: "route_id and vehicle_user_id are required." },
      { status: 400 }
    );
  }

  try {
    const assignment = await createAssignment({ routeId, vehicleUserId });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    if (err instanceof AssignmentValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
