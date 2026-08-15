import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, SignJWT, jwtVerify } from "jose";

type DriveTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("AUTH_SECRET_NOT_CONFIGURED");
  return new TextEncoder().encode(value);
}

function encryptionSecret() {
  return createHash("sha256").update(authSecret()).digest();
}

export function driveConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("GOOGLE_DRIVE_NOT_CONFIGURED");
  return { clientId, clientSecret, redirectUri };
}

export type DriveSlot = "01" | "02" | "03";

export function driveFolderConfig(slot: DriveSlot = "01") {
  const folderId =
    slot === "01"
      ? process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
      : process.env[`GOOGLE_DRIVE_FOLDER_ID_${slot}`]?.trim();
  if (!folderId) throw new Error(`GOOGLE_DRIVE_FOLDER_${slot}_NOT_CONFIGURED`);
  return {
    folderId,
    slot,
    storagePrefix: slot === "01" ? "drive:" : `drive${slot}:`,
  };
}

export async function createDriveState(userId: string) {
  return new SignJWT({ purpose: "google-drive" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(authSecret());
}

export async function verifyDriveState(token: string) {
  const { payload } = await jwtVerify(token, authSecret());
  if (!payload.sub || payload.purpose !== "google-drive")
    throw new Error("INVALID_OAUTH_STATE");
  return payload.sub;
}

export async function sealDriveTokens(tokens: DriveTokens) {
  return new EncryptJWT(tokens as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .encrypt(encryptionSecret());
}

export async function openDriveTokens(value: string): Promise<DriveTokens> {
  const { payload } = await jwtDecrypt(value, encryptionSecret());
  if (
    typeof payload.accessToken !== "string" ||
    typeof payload.expiresAt !== "number"
  )
    throw new Error("INVALID_DRIVE_TOKEN");
  return {
    accessToken: payload.accessToken,
    refreshToken:
      typeof payload.refreshToken === "string"
        ? payload.refreshToken
        : undefined,
    expiresAt: payload.expiresAt,
  };
}

export async function exchangeDriveCode(code: string) {
  const config = driveConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !body.access_token)
    throw new Error(body.error_description || "GOOGLE_TOKEN_EXCHANGE_FAILED");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

export async function refreshDriveTokens(tokens: DriveTokens) {
  if (tokens.expiresAt > Date.now() + 60_000) return tokens;
  if (!tokens.refreshToken) throw new Error("DRIVE_RECONNECT_REQUIRED");
  const config = driveConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !body.access_token)
    throw new Error(body.error_description || "DRIVE_RECONNECT_REQUIRED");
  return {
    accessToken: body.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

export async function inspectDriveFolder(
  accessToken: string,
  slot: DriveSlot = "01",
  folderOverride?: string,
) {
  const folderId = folderOverride?.trim() || driveFolderConfig(slot).folderId;
  const fields = encodeURIComponent(
    "id,name,mimeType,capabilities/canDownload",
  );
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=${fields}&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  const body = (await response.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    error?: { message?: string };
  };
  if (!response.ok || body.mimeType !== "application/vnd.google-apps.folder")
    throw new Error(body.error?.message || "DRIVE_FOLDER_NOT_ACCESSIBLE");
  return { id: body.id, name: body.name };
}

export async function inspectDriveRoot(accessToken: string) {
  const fields = encodeURIComponent("id,name,mimeType");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/root?fields=${fields}&supportsAllDrives=true`,
    { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  const body = (await response.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.id)
    throw new Error(body.error?.message || "DRIVE_ROOT_NOT_ACCESSIBLE");
  return { id: body.id, name: body.name || "Mi unidad" };
}

export async function listDriveAudioFiles(
  accessToken: string,
  slot: DriveSlot = "01",
  folderOverride?: string,
) {
  const folderId = folderOverride?.trim() || driveFolderConfig(slot).folderId;
  type DriveFile = {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    webViewLink?: string;
    genre?: string;
    folderPath?: string;
  };
  type DriveFolder = { id: string; genre?: string; folderPath: string };
  let folders: DriveFolder[] = [{ id: folderId, folderPath: "" }];
  const visitedFolders = new Set([folderId]);
  const visitedFiles = new Set<string>();
  const files: DriveFile[] = [];
  const audioExtension = /\.(mp3|wav|flac|ogg|m4a|aac)$/i;
  async function listFolder(folder: DriveFolder) {
    const children: DriveFolder[] = [];
    const audio: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folder.id}' in parents and trashed = false`,
        fields:
          "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
        orderBy: "name",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        },
      );
      const body = (await response.json()) as {
        nextPageToken?: string;
        files?: DriveFile[];
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(body.error?.message || "DRIVE_FILES_UNAVAILABLE");
      for (const item of body.files ?? []) {
        if (item.mimeType === "application/vnd.google-apps.folder") {
          const name = item.name.trim() || "General";
          const folderPath = folder.folderPath
            ? `${folder.folderPath}/${name}`
            : name;
          children.push({
            id: item.id,
            genre: folder.genre ?? name,
            folderPath,
          });
        } else if (
          item.mimeType.startsWith("audio/") ||
          audioExtension.test(item.name)
        )
          audio.push({
            ...item,
            genre: folder.genre ?? "General",
            folderPath: folder.folderPath,
          });
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
    return { children, audio };
  }
  while (folders.length) {
    const level = folders;
    folders = [];
    for (let offset = 0; offset < level.length; offset += 8) {
      const results = await Promise.all(
        level.slice(offset, offset + 8).map(listFolder),
      );
      for (const result of results) {
        for (const folder of result.children) {
          if (visitedFolders.has(folder.id)) continue;
          visitedFolders.add(folder.id);
          folders.push(folder);
        }
        for (const file of result.audio) {
          if (visitedFiles.has(file.id)) continue;
          visitedFiles.add(file.id);
          files.push(file);
        }
      }
    }
  }
  return files;
}
