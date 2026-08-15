import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient:SupabaseClient|undefined;
export function supabaseBrowser(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_PUBLIC_CONFIG_MISSING");
  browserClient??=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return browserClient;
}
