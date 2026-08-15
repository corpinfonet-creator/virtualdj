import { cookies } from "next/headers";
import {
  exchangeDriveCode,
  inspectDriveFolder,
  sealDriveTokens,
  verifyDriveState,
} from "@/server/providers/google-drive";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state)
      throw new Error(
        url.searchParams.get("error") || "OAUTH_RESPONSE_INCOMPLETE",
      );
    await verifyDriveState(state);
    const tokens = await exchangeDriveCode(code);
    const jar = await cookies();
    jar.set("autodj_drive", await sealDriveTokens(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 2_592_000,
      path: "/",
    });
    const returnTo = jar.get("autodj_drive_return")?.value;
    jar.delete("autodj_drive_return");
    if (returnTo?.startsWith("/") && !returnTo.startsWith("//"))
      return Response.redirect(new URL(returnTo, url.origin));
    const folder = await inspectDriveFolder(tokens.accessToken);
    return Response.redirect(
      new URL(
        `/library?drive=connected&folder=${encodeURIComponent(folder.name ?? "Google Drive")}`,
        url.origin,
      ),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GOOGLE_DRIVE_CONNECTION_FAILED";
    return Response.redirect(
      new URL(
        `/library?drive=error&message=${encodeURIComponent(message)}`,
        url.origin,
      ),
    );
  }
}
