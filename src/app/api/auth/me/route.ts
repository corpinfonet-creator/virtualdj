import { cookies } from "next/headers";
import { verifySessionToken } from "@/server/auth/session";

export async function GET() {
  const token = (await cookies()).get("autodj_session")?.value;
  if (!token) return Response.json({ data: null }, { status: 401 });
  try { return Response.json({ data: await verifySessionToken(token) }); }
  catch { return Response.json({ data: null }, { status: 401 }); }
}
