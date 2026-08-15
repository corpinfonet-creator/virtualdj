import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type PublicRequest={id:string;venueId:string;title:string;artist:string;requester:string;votes:number;status:"PENDING"|"ACCEPTED"|"REJECTED"|"PLAYED";createdAt:string;updatedAt:string};
const directory=path.resolve(process.cwd(),".data"),filePath=path.join(directory,"requests.json");
let lock=Promise.resolve();
async function readAll(){try{return JSON.parse(await readFile(filePath,"utf8")) as PublicRequest[];}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return[];throw error;}}
async function writeAll(items:PublicRequest[]){await mkdir(directory,{recursive:true});const temporary=path.join(directory,`requests-${process.pid}.tmp`);await writeFile(temporary,JSON.stringify(items,null,2),"utf8");await rename(temporary,filePath);}
async function mutate<T>(operation:(items:PublicRequest[])=>Promise<T>|T){const previous=lock;let release!:()=>void;lock=new Promise<void>(resolve=>{release=resolve;});await previous;try{const items=await readAll(),result=await operation(items);await writeAll(items);return result;}finally{release();}}

export async function listRequests(venueId:string,publicView=false){const items=await readAll();return items.filter(item=>item.venueId===venueId&&(!publicView||item.status==="ACCEPTED")).sort((a,b)=>b.votes-a.votes||a.createdAt.localeCompare(b.createdAt));}
export async function createOrVoteRequest(input:Pick<PublicRequest,"venueId"|"title"|"artist"|"requester">){return mutate(items=>{const normalized=`${input.title}|${input.artist}`.toLocaleLowerCase();const existing=items.find(item=>item.venueId===input.venueId&&item.status==="PENDING"&&`${item.title}|${item.artist}`.toLocaleLowerCase()===normalized);if(existing){existing.votes++;existing.updatedAt=new Date().toISOString();return existing;}const now=new Date().toISOString(),created:PublicRequest={...input,id:crypto.randomUUID(),votes:1,status:"PENDING",createdAt:now,updatedAt:now};items.push(created);return created;});}
export async function updateRequest(id:string,status:PublicRequest["status"]){return mutate(items=>{const item=items.find(current=>current.id===id);if(!item)throw new Error("REQUEST_NOT_FOUND");item.status=status;item.updatedAt=new Date().toISOString();return item;});}
