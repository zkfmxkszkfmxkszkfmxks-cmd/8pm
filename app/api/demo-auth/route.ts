import { getDemoUser, makeDemoCookie, clearDemoCookie } from "@/lib/demo-auth";

export async function GET() {
  const user = await getDemoUser();
  return Response.json({ signedIn: !!user, role: user?.userId === "demo-owner" ? "owner" : user ? "customer" : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "invalid_input" }, { status: 400 }); }
  if (body.action === "logout") return Response.json({ ok: true }, { headers: { "Set-Cookie": clearDemoCookie(), "Cache-Control": "no-store" } });
  if (body.action !== "experience" || (body.role !== "customer" && body.role !== "owner")) {
    return Response.json({ error: "invalid_role" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return Response.json({ ok: true, role: body.role }, { headers: { "Set-Cookie": await makeDemoCookie(body.role), "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "demo_auth_unavailable" }, { status: 503 }); }
}
