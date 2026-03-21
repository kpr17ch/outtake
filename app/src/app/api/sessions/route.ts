import { createSession, listSessions } from "@/lib/sessions";

export const runtime = "nodejs";

export async function GET() {
  const sessions = await listSessions();
  return Response.json(sessions);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = body.title || "New Session";
  const session = await createSession(title);
  return Response.json(session, { status: 201 });
}
