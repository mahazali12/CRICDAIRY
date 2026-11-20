const CACHE='cricdairy-v55';
const ASSETS=['./','./index.html','./style.css','./db.js','./app.js','./manifest.json','./assets/admin-profile.jpg','./assets/app-display.jpg','./assets/cricdairy-icon.png','./assets/cricdairy-icon-192.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(ASSETS.map(async asset=>{
  const response=await fetch(new Request(asset,{cache:'reload'}));
  if(!response.ok)throw new Error(`Failed to cache ${asset}`);
  await cache.put(asset,response);
 }))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 event.respondWith(caches.match(event.request).then(cached=>{
  if(cached)return cached;
  return fetch(event.request).then(response=>{
   if(response.ok&&event.request.url.startsWith(self.location.origin)){
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
   }
   return response;
  }).catch(()=>{
   if(event.request.mode==='navigate')return caches.match('./index.html');
   return new Response('',{status:503,statusText:'Offline'});
  });
 }));
});