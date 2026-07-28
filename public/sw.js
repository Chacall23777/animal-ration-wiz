// ARNA Service Worker — basic offline app-shell cache.
const VERSION = "arna-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Offline HTML fallback shown when navigation fails and no cache exists.
const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARNA — Sem conexão</title><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0f4d2a;color:#f7f3e6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.card{max-width:360px}h1{font-size:20px;margin:0 0 8px}p{opacity:.85;line-height:1.5;font-size:15px}button{margin-top:20px;padding:12px 20px;border-radius:10px;border:0;background:#d9a441;color:#0f4d2a;font-weight:700;cursor:pointer}</style></head><body><div class="card"><h1>Você está sem internet</h1><p>Não conseguimos carregar novos dados agora. Assim que a conexão voltar, tudo será atualizado automaticamente.</p><button onclick="location.reload()">Tentar de novo</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, fall back to cached shell then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(VERSION);
          cache.put("/", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = (await caches.match(request)) || (await caches.match("/"));
          if (cached) return cached;
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  if (/\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(VERSION).then((c) => c.put(request, res.clone())).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});