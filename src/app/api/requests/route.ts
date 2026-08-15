import { listRequests, updateRequest } from "@/server/requests/store";
import { z } from "zod";

const patchSchema=z.object({id:z.string().uuid(),status:z.enum(["ACCEPTED","REJECTED","PLAYED"])});
function localCabin(request:Request){const host=request.headers.get("host")?.split(":")[0];return host==="localhost"||host==="127.0.0.1"||host==="[::1]";}
export async function GET(request:Request){if(!localCabin(request))return Response.json({error:"CABIN_ACCESS_REQUIRED"},{status:403});const venueId=new URL(request.url).searchParams.get("venueId");if(!venueId)return Response.json({error:"VENUE_REQUIRED"},{status:400});return Response.json({data:await listRequests(venueId)});}
export async function PATCH(request:Request){if(!localCabin(request))return Response.json({error:"CABIN_ACCESS_REQUIRED"},{status:403});try{const input=patchSchema.parse(await request.json());return Response.json({data:await updateRequest(input.id,input.status)});}catch(error){return Response.json({error:error instanceof Error?error.message:"INVALID_REQUEST"},{status:400});}}
