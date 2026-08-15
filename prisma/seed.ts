import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL_NOT_CONFIGURED");
const parsed=new URL(connectionString);const caPath=process.env.SUPABASE_CA_CERT_PATH??path.resolve(process.cwd(),"certs","supabase-ca.crt");const ssl=parsed.hostname.endsWith(".supabase.com")&&existsSync(caPath)?{ca:readFileSync(caPath,"utf8"),rejectUnauthorized:true}:undefined;if(ssl){parsed.searchParams.delete("sslmode");parsed.searchParams.delete("uselibpqcompat");}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString:parsed.toString(),ssl }) });

const seedTracks = [
  ["Cumbia del Sol", "Orquesta Central", "Cumbia", 218000, 96, "8A", .67],
  ["Selva Nocturna", "Ritmo Amazónico", "Cumbia", 231000, 98, "8A", .74],
  ["Corazón Salsero", "Son del Puerto", "Salsa", 244000, 101, "9A", .79],
] as const;

async function main() {
  const tenant = await prisma.tenant.upsert({ where: { id: "demo-tenant" }, update: {}, create: { id: "demo-tenant", name: "AutoDJ Demo" } });
  await prisma.venue.upsert({ where: { id: "demo-venue" }, update: {}, create: { id: "demo-venue", tenantId: tenant.id, name: "Cabina principal" } });
  const user = await prisma.user.upsert({ where: { email: "admin@autodj.local" }, update: {}, create: { email: "admin@autodj.local", displayName: "Administrador", passwordHash: await bcrypt.hash("ChangeMe123!", 12) } });
  await prisma.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { role: "ADMIN" }, create: { tenantId: tenant.id, userId: user.id, role: "ADMIN" } });
  for (const [title, artist, genre, durationMs, bpm, musicalKey, energy] of seedTracks) {
    const existing = await prisma.track.findFirst({ where: { tenantId: tenant.id, title, artist } });
    const track = existing ?? await prisma.track.create({ data: { tenantId: tenant.id, title, artist, genre, durationMs } });
    await prisma.trackAnalysis.upsert({ where: { trackId: track.id }, update: { bpm, musicalKey, energy }, create: { trackId: track.id, bpm, musicalKey, energy, analyzerVersion: "seed-v1" } });
  }
}

main().finally(() => prisma.$disconnect());
