const VERSION = "v51";
const CACHE_NAME="unipop-formateur-"+VERSION;
const STATIC_ASSETS=[
  "./","./index.html","./style.css?v=51","./app.js?v=51","./manifest.webmanifest?v=32",
  "./data/locations.json","./assets/icon.svg","./assets/luxembourg-skyline.png",
  "./assets/demo-map.jpg","./assets/demo-building.jpg","./assets/demo-entry.jpg","./assets/demo-room.jpg"
];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("unipop-formateur-")&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",event=>{
  const req=event.request,url=new URL(req.url);
  if(req.mode==="navigate"||url.pathname.endsWith("/index.html")){event.respondWith(fetch(req,{cache:"no-store"}).then(r=>{const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put("./index.html",copy));return r}).catch(()=>caches.match("./index.html")));return}
  if(url.hostname==="raw.githubusercontent.com"){event.respondWith(fetch(req,{cache:"no-store"}).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy))}return r}).catch(()=>caches.match(req)));return}
  if(url.origin===self.location.origin && (
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/style.css") ||
    url.pathname.endsWith("/sw.js")
  )){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(r=>{
        if(r.ok){
          const copy=r.clone();
          caches.open(CACHE_NAME).then(c=>c.put(req,copy));
        }
        return r;
      }).catch(()=>caches.match(req))
    );
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});
