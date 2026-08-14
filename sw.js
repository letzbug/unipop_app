const CACHE="unipop-formateur-v4";
const STATIC=["./","index.html","style.css","app.js","manifest.webmanifest","data/locations.json","assets/icon.svg","assets/luxembourg-skyline.png","assets/demo-map.jpg","assets/demo-building.jpg","assets/demo-entry.jpg","assets/demo-room.jpg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.url.includes("raw.githubusercontent.com")){
    e.respondWith(fetch(e.request).then(r=>{
      const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r;
    }).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)));
});