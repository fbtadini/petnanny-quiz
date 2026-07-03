/* sw.js — PetNanny service worker v1
 * Estratégia: network-first pra TUDO da mesma origem (sempre pega deploy fresco),
 * com fallback pro cache quando offline. /api/ e cross-origin passam direto.
 * Ao mudar arquivos, NÃO precisa mexer aqui — o cache é só rede-caiu.
 */
var V = 'petnanny-v1';
var CORE = ['/meu-cao.html','/breeds.js','/gear.js','/nanny-identity.js','/nanny-ask-ui.js',
            '/nanny-hoje.js','/nanny-score.js','/nanny-vet-resumo.js','/nanny-extras.js','/manifest.json'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(V).then(function(c){ return c.addAll(CORE); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k!==V; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/api/') === 0) return;
  e.respondWith(
    fetch(e.request).then(function(r){
      if(r && r.ok){ var cp=r.clone(); caches.open(V).then(function(c){ c.put(e.request, cp); }); }
      return r;
    }).catch(function(){
      return caches.match(e.request).then(function(r){
        return r || (e.request.mode==='navigate' ? caches.match('/meu-cao.html') : Response.error());
      });
    })
  );
});
