import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type SessionClaims = { sub: string; tenantId: string; role: "ADMIN" | "DJ" | "OPERATOR"; email: string };

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET_NOT_CONFIGURED");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(claims: SessionClaims) {
  return new SignJWT({ tenantId: claims.tenantId, role: claims.role, email: claims.email })
    .setProtectedHeader({ alg: "HS256" }).setSubject(claims.sub).setIssuedAt().setExpirationTime("8h").sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret());
  if (!payload.sub || typeof payload.tenantId !== "string" || typeof payload.email !== "string") throw new Error("INVALID_SESSION");
  if (!(["ADMIN", "DJ", "OPERATOR"] as const).includes(payload.role as SessionClaims["role"])) throw new Error("INVALID_ROLE");
  return { sub: payload.sub, tenantId: payload.tenantId, email: payload.email, role: payload.role as SessionClaims["role"] };
}

export async function requireSession() {
  const token = (await cookies()).get("autodj_session")?.value;
  if (!token) throw new Error("UNAUTHORIZED");
  return verifySessionToken(token);
}
