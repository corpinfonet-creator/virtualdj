import { cookies } from "next/headers";

export async function POST() {
  const jar = await cookies();
  jar.set("autodj_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 0, path: "/" });
  return new Response(null, { status: 204 });
}
