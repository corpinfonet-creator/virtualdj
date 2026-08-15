import { cookies } from "next/headers";
import { requireSession } from "@/server/auth/session";
import { db } from "@/server/db/prisma";
import {
  openDriveTokens,
  refreshDriveTokens,
  sealDriveTokens,
} from "@/server/providers/google-drive";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/tracks/[trackId]/stream">,
) {
  try {
    const session = await requireSession();
    const { trackId } = await context.params;
    const asset = await db().audioAsset.findFirst({
      where: {
        trackId,
        status: "READY",
        OR: [
          { storageKey: { startsWith: "drive:" } },
          { storageKey: { startsWith: "drive02:" } },
          { storageKey: { startsWith: "drive03:" } },
        ],
        track: { tenantId: session.tenantId },
      },
      select: { storageKey: true, mimeType: true },
    });
    if (!asset)
      return Response.json({ error: "TRACK_NOT_STREAMABLE" }, { status: 404 });
    const jar = await cookies();
    const encrypted = jar.get("autodj_drive")?.value;
    if (!encrypted)
      return Response.json({ error: "DRIVE_NOT_CONNECTED" }, { status: 401 });
    const previous = await openDriveTokens(encrypted);
    const tokens = await refreshDriveTokens(previous);
    if (tokens.accessToken !== previous.accessToken)
      jar.set("autodj_drive", await sealDriveTokens(tokens), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 2_592_000,
        path: "/",
      });
    const separator = asset.storageKey.indexOf(":");
    const fileId = asset.storageKey.slice(separator + 1);
    const headers = new Headers({
      authorization: `Bearer ${tokens.accessToken}`,
    });
    const range = request.headers.get("range");
    if (range) headers.set("range", range);
    const upstream = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers, cache: "no-store" },
    );
    if (!upstream.ok || !upstream.body) {
      if (upstream.status === 401 || upstream.status === 403)
        return Response.json(
          { error: "DRIVE_RECONNECT_REQUIRED" },
          { status: 401 },
        );
      return Response.json(
        { error: "DRIVE_STREAM_FAILED", status: upstream.status },
        { status: upstream.status === 416 ? 416 : 502 },
      );
    }
    const responseHeaders = new Headers({
      "content-type": upstream.headers.get("content-type") || asset.mimeType,
      "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
      "cache-control": "private, no-store",
    });
    for (const name of [
      "content-length",
      "content-range",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STREAM_FAILED";
    const unauthorized =
      ["UNAUTHORIZED", "INVALID_DRIVE_TOKEN", "DRIVE_RECONNECT_REQUIRED"].includes(
        message,
      ) || /invalid authentication credentials/i.test(message);
    return Response.json(
      { error: unauthorized ? "DRIVE_RECONNECT_REQUIRED" : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
