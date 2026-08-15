import { z } from "zod";
import { createOrVoteRequest, listRequests } from "@/server/requests/store";

const schema=z.object({title:z.string().trim().min(1).max(180),artist:z.string().trim().min(1).max(180),requester:z.string().trim().min(1).max(60)});
const attempts=new Map<string,{count:number;until:number}>();
function allowed(key:string){const now=Date.now(),state=attempts.get(key);if(!state||state.until<now){attempts.set(key,{count:1,until:now+60000});return true;}if(state.count>=8)return false;state.count++;return true;}

export async function GET(_:Request,{params}:{params:Promise<{venueId:string}>}){const{venueId}=await params;return Response.json({data:await listRequests(venueId,true)});}
export async function POST(request:Request,{params}:{params:Promise<{venueId:string}>}){const{venueId}=await params;const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]??"local";if(!allowed(`${venueId}:${forwarded}`))return Response.json({error:"RATE_LIMITED"},{status:429});try{const input=schema.parse(await request.json());return Response.json({data:await createOrVoteRequest({...input,venueId})},{status:201});}catch(error){if(error instanceof z.ZodError)return Response.json({error:"VALIDATION_ERROR",issues:error.issues},{status:400});return Response.json({error:"INTERNAL_ERROR"},{status:500});}}
