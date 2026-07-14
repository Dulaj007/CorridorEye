import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { deleteRoute } from "@/lib/routes";

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
      { error: "Only system accounts can delete routes." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const routeId = Number(id);

  if (!Number.isInteger(routeId)) {
    return NextResponse.json({ error: "Invalid route id." }, { status: 400 });
  }

  await deleteRoute(routeId);
  return NextResponse.json({ success: true });
}
