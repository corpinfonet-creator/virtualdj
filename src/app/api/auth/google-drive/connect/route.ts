import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { apiError } from "@/server/http/api-error";
import { createDriveState, driveConfig } from "@/server/providers/google-drive";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const config = driveConfig();
    const requestedReturnTo = new URL(request.url).searchParams.get("returnTo");
    const returnTo =
      requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
        ? requestedReturnTo
        : "/library";
    (await cookies()).set("autodj_drive_return", returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.readonly",
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state: await createDriveState(session.sub),
    });
    return Response.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    );
  } catch (error) {
    return apiError(error);
  }
}
