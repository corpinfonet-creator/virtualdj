import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  const host=new URL(connectionString).hostname;
  const caPath=process.env.SUPABASE_CA_CERT_PATH??path.resolve(process.cwd(),"certs","supabase-ca.crt");
  const ssl=host.endsWith(".supabase.com")&&existsSync(caPath)?{ca:readFileSync(caPath,"utf8"),rejectUnauthorized:true}:undefined;
  const adapterUrl=new URL(connectionString);if(ssl){adapterUrl.searchParams.delete("sslmode");adapterUrl.searchParams.delete("uselibpqcompat");}
  return new PrismaClient({ adapter: new PrismaPg({ connectionString:adapterUrl.toString(), ssl }) });
}

export function db() {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}
