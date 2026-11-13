/* VBerg board — offline. Scope is /board/ only; the live site at / is not
   controlled by this worker. Network first, so a new deploy is picked up
   at once; the cache answers only when the network does not. */
var CACHE = 'vberg-board-v1';
var FILES = ['./', 'core.js', 'hills.js', 'store.js', 'commands.js', 'board.js', '../assets/vberg-engine.js'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k.indexOf('vberg-board-') === 0 && k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(res){
      /* keep a copy (also of the font files, which come from another origin) */
      if(res && (res.ok || res.type === 'opaque')){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(e.request, {ignoreSearch: true}).then(function(hit){
        return hit || Response.error();
      });
    })
  );
});
