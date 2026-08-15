const VERSION="autodj-shell-v1";
const SHELL=["/","/login","/library","/request/demo-venue","/manifest.webmanifest","/icon.svg","/icon-maskable.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin||url.pathname.startsWith("/api/")||request.headers.has("range"))return;
  if(request.mode==="navigate"){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(VERSION).then(cache=>cache.put(request,copy));return response;}).catch(async()=>await caches.match(request)||await caches.match("/")));return;}
  if(url.pathname.startsWith("/_next/static/")||url.pathname.endsWith(".svg")||url.pathname.endsWith(".webmanifest")){event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(VERSION).then(cache=>cache.put(request,response.clone()));return response;})));}
});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});
