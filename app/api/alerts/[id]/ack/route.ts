import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { acknowledgeAlert } from "@/lib/alerts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can acknowledge alerts." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const alertId = Number(id);

  if (!Number.isInteger(alertId)) {
    return NextResponse.json({ error: "Invalid alert id." }, { status: 400 });
  }

  await acknowledgeAlert(alertId);
  return NextResponse.json({ success: true });
}
