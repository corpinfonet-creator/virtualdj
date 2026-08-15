import { apiError } from "@/server/http/api-error";
import { db } from "@/server/db/prisma";
import { createTrackSchema } from "@/server/tracks/schema";
import { requireSession } from "@/server/auth/session";
import {
  driveSlotFromSource,
  driveStoragePrefix,
} from "@/server/providers/drive-slots";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { tenantId } = await requireSession();
    const query = searchParams.get("q")?.trim();
    const genre = searchParams.get("genre")?.trim();
    const source = searchParams.get("source")?.trim();
    const folder = searchParams
      .get("folder")
      ?.trim()
      .replace(/^\/+|\/+$/g, "")
      .normalize("NFC");
    const driveSlot = driveSlotFromSource(source ?? null);
    const drivePrefix = driveSlot ? driveStoragePrefix(driveSlot) : null;
    const random = searchParams.get("random") === "1";
    const includeFolders = searchParams.get("includeFolders") !== "0";
    const includeFacets = searchParams.get("includeFacets") !== "0";
    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") || "1", 10) || 1,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20,
      ),
    );
    const where = {
      tenantId,
      blocked: false,
      ...(genre && !(drivePrefix && folder) ? { genre } : {}),
      ...(drivePrefix
        ? { assets: { some: { storageKey: { startsWith: drivePrefix } } } }
        : {}),
      ...(!query && drivePrefix
        ? folder
          ? { subgenre: folder }
          : { OR: [{ subgenre: null }, { subgenre: "" }] }
        : {}),
      ...(query
        ? {
            // Cada palabra escrita puede caer en un campo distinto (p. ej.
            // "camilo bebe" = artista + título), así que se exige que TODAS
            // las palabras coincidan, cada una en CUALQUIERA de los campos,
            // en vez de buscar la frase completa como una sola cadena.
            AND: query
              .split(/\s+/)
              .filter(Boolean)
              .map((word) => ({
                OR: [
                  { title: { contains: word, mode: "insensitive" as const } },
                  { artist: { contains: word, mode: "insensitive" as const } },
                  { genre: { contains: word, mode: "insensitive" as const } },
                  {
                    subgenre: {
                      contains: word,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              })),
          }
        : {}),
    };
    const readyAssetWhere = drivePrefix
      ? { status: "READY" as const, storageKey: { startsWith: drivePrefix } }
      : {
          status: "READY" as const,
          OR: [
            { storageKey: { startsWith: "drive:" } },
            { storageKey: { startsWith: "drive02:" } },
            { storageKey: { startsWith: "drive03:" } },
          ],
        };
    if (random) {
      const total = await db().track.count({
        where: {
          ...where,
          assets: { some: readyAssetWhere },
        },
      });
      if (!total) return Response.json({ data: null });
      const track = await db().track.findFirst({
        where: {
          ...where,
          assets: { some: readyAssetWhere },
        },
        include: {
          analysis: true,
          assets: {
            where: readyAssetWhere,
            select: {
              id: true,
              offlineAllowed: true,
              storageKey: true,
              mimeType: true,
            },
          },
        },
        skip: Math.floor(Math.random() * total),
      });
      return Response.json({ data: track });
    }
    const [tracks, total, genreRows, folderRows] = await Promise.all([
      db().track.findMany({
        where,
        include: {
          analysis: true,
          assets: {
            where: drivePrefix
              ? {
                  status: "READY",
                  storageKey: { startsWith: drivePrefix },
                }
              : { status: "READY" },
            select: {
              id: true,
              offlineAllowed: true,
              storageKey: true,
              mimeType: true,
            },
          },
        },
        orderBy: [{ artist: "asc" }, { title: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db().track.count({ where }),
      includeFacets
        ? db().track.findMany({
            where: { tenantId, blocked: false, genre: { not: null } },
            select: { genre: true },
            distinct: ["genre"],
            orderBy: { genre: "asc" },
          })
        : Promise.resolve([]),
      drivePrefix && includeFolders
        ? db().track.findMany({
            where: {
              tenantId,
              blocked: false,
              subgenre: { not: null },
              assets: {
                some: { storageKey: { startsWith: drivePrefix } },
              },
            },
            select: { subgenre: true },
            distinct: ["subgenre"],
          })
        : Promise.resolve([]),
    ]);
    const folderPrefix = folder ? `${folder}/` : "";
    const folders = [
      ...new Set(
        folderRows
          .map((row) => row.subgenre)
          .filter((path): path is string => Boolean(path))
          .filter((path) => path.startsWith(folderPrefix) && path !== folder)
          .map((path) => path.slice(folderPrefix.length).split("/")[0])
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, "es"));
    const folderPaths = folderRows
      .map((row) => row.subgenre)
      .filter((path): path is string => Boolean(path));
    return Response.json({
      data: tracks,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        genres: genreRows.map((row) => row.genre).filter(Boolean),
        folder: folder ?? "",
        folders,
        folderPaths,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = createTrackSchema.parse(await request.json());
    const session = await requireSession();
    const track = await db().track.create({
      data: { ...input, tenantId: session.tenantId },
    });
    return Response.json({ data: track }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
