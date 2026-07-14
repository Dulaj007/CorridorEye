import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { deactivateAssignment } from "@/lib/assignments";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (session.role !== "system") {
    return NextResponse.json(
      { error: "Only system accounts can unassign routes." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const assignmentId = Number(id);

  if (!Number.isInteger(assignmentId)) {
    return NextResponse.json({ error: "Invalid assignment id." }, { status: 400 });
  }

  await deactivateAssignment(assignmentId);
  return NextResponse.json({ success: true });
}
