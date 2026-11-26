const CACHE='cricdairy-v104';
const ASSETS=[
 './',
 './index.html',
 './style.css',
 './db.js',
 './app.js',
 './manifest.json',
 './assets/admin-profile.jpg',
 './assets/app-display.jpg',
 './assets/cricdairy-icon.png',
 './assets/cricdairy-icon-192.png'
];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(async cache=>{
  for(const asset of ASSETS){
   const response=await fetch(new Request(asset,{cache:'reload'}));
   if(!response.ok)throw new Error(`Failed to cache ${asset}`);
   await cache.put(asset,response);
  }
 }).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(
  keys.filter(key=>key.startsWith('cricdairy-')&&key!==CACHE).map(key=>caches.delete(key))
 )).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const requestUrl=new URL(event.request.url);
 if(requestUrl.origin!==self.location.origin)return;
 event.respondWith(caches.match(event.request).then(cached=>{
  if(cached)return cached;
  return fetch(event.request);
 }));
});
