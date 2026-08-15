"use client";

import { useEffect, useState } from "react";
import { Download, Wifi, WifiOff, X } from "lucide-react";

type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
export function PwaManager(){const[online,setOnline]=useState(true);const[prompt,setPrompt]=useState<InstallEvent>();const[installed,setInstalled]=useState(false);const[visible,setVisible]=useState(true);
  useEffect(()=>{setOnline(navigator.onLine);setInstalled(window.matchMedia("(display-mode: standalone)").matches);const up=()=>setOnline(true),down=()=>setOnline(false),capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent);};window.addEventListener("online",up);window.addEventListener("offline",down);window.addEventListener("beforeinstallprompt",capture);if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).catch(()=>undefined);return()=>{window.removeEventListener("online",up);window.removeEventListener("offline",down);window.removeEventListener("beforeinstallprompt",capture);};},[]);
  async function install(){if(!prompt)return;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==="accepted")setInstalled(true);setPrompt(undefined);}
  if(!visible)return null;return <aside className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-xl border border-slate-700 bg-[#0b1018]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur"><span className={`flex items-center gap-1 ${online?"text-lime":"text-amber-300"}`}>{online?<Wifi size={14}/>:<WifiOff size={14}/>} {online?"Online":"Offline · cabina local"}</span>{prompt&&!installed&&<button onClick={install} className="flex items-center gap-1 rounded-lg bg-cyan px-2 py-1 font-bold text-ink"><Download size={13}/> Instalar</button>}<button aria-label="Ocultar estado PWA" onClick={()=>setVisible(false)} className="text-slate-500"><X size={13}/></button></aside>;
}
