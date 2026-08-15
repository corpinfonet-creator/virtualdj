import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSessionToken } from "@/server/auth/session";
import { db } from "@/server/db/prisma";
import { apiError } from "@/server/http/api-error";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8), tenantId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await db().user.findUnique({ where: { email: input.email.toLowerCase() }, include: { memberships: { where: { tenantId: input.tenantId }, take: 1 } } });
    if (!user?.passwordHash || user.disabledAt || !user.memberships[0] || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
    const membership = user.memberships[0];
    const token = await createSessionToken({ sub: user.id, tenantId: membership.tenantId, role: membership.role, email: user.email });
    const jar = await cookies();
    jar.set("autodj_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 28_800, path: "/" });
    return Response.json({ data: { id: user.id, email: user.email, displayName: user.displayName, role: membership.role } });
  } catch (error) { return apiError(error); }
}
