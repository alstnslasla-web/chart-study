/* 설치(바탕화면 아이콘)용 최소 서비스워커. 캐시는 하지 않고 늘 새 파일을 받는다. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { if (e.request.method !== 'GET') return; e.respondWith(fetch(e.request)); });
