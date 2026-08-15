import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const connectionString=process.env.DATABASE_URL??process.env.POSTGRES_PRISMA_URL??process.env.POSTGRES_URL;
if(!connectionString){console.error("DATABASE_URL_MISSING");process.exit(1);}
const parsed=new URL(connectionString);
console.log(`DATABASE_TARGET host=${parsed.hostname} port=${parsed.port||"default"}`);
const caPath=process.env.SUPABASE_CA_CERT_PATH??path.resolve(process.cwd(),"certs","supabase-ca.crt");
const ssl=parsed.hostname.endsWith(".supabase.com")&&existsSync(caPath)?{ca:readFileSync(caPath,"utf8"),rejectUnauthorized:true}:undefined;
console.log(`TLS_CA=${ssl?"CONFIGURED":"SYSTEM_DEFAULT"}`);
const adapterUrl=new URL(connectionString);if(ssl){adapterUrl.searchParams.delete("sslmode");adapterUrl.searchParams.delete("uselibpqcompat");}
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:adapterUrl.toString(),connectionTimeoutMillis:8000,ssl})});
try{await prisma.$queryRawUnsafe("SELECT 1 AS ok");const tables=await prisma.$queryRawUnsafe("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'");console.log("DATABASE_CONNECTION_OK");console.log(`PUBLIC_TABLES=${tables[0]?.count??0}`);if((tables[0]?.count??0)>0){const[tenants,venues,users,tracks,migrations]=await Promise.all([prisma.tenant.count(),prisma.venue.count(),prisma.user.count(),prisma.track.count(),prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')]);console.log(`DATA_COUNTS tenants=${tenants} venues=${venues} users=${users} tracks=${tracks} migrations=${migrations[0]?.count??0}`);}}catch(error){const raw=[error.message,error.meta?.message,error.meta?.dbError?.message,error.cause?.message].filter(Boolean).join(" | ");const sanitized=String(raw).replaceAll(connectionString,"[REDACTED_CONNECTION]").replace(parsed.password,"[REDACTED]").replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[REDACTED_URL]");console.error(`DATABASE_CONNECTION_FAILED code=${error.code??"unknown"} detail=${sanitized.slice(0,700)}`);process.exitCode=1;}finally{await prisma.$disconnect();}
