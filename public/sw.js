const CACHE = "todo-by-ake-v3";
const APP_SHELL = ["/", "/manifest.webmanifest"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; const url = new URL(event.request.url); if (event.request.mode === "navigate" || url.pathname.startsWith("/_next/")) { event.respondWith(fetch(event.request).catch(() => caches.match("/"))); return; } event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match("/")))); });
self.addEventListener("push", (event) => {
	const data = event.data ? event.data.json() : {};
	event.waitUntil(self.registration.showNotification(data.title || "To-Do by Ake", { body: data.body || "You still have unfinished tasks waiting.", icon: "/icon.svg", badge: "/icon.svg", data: { url: "/" } }));
});
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((pages) => { const existing = pages.find((page) => "focus" in page); if (existing) return existing.focus(); return clients.openWindow(event.notification.data?.url || "/"); }));
});