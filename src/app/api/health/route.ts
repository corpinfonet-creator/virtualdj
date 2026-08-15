import { db } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", services: { web: "ok", database: "ok" }, timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", services: { web: "ok", database: "unavailable" }, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
