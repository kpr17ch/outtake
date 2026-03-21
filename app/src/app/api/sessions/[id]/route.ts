import { getSession, updateSession, deleteSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json(session);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updated = await updateSession(id, body);
  if (!updated) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteSession(id);
  if (!deleted) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
