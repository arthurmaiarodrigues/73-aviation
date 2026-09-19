/* Service worker do 73 Aviation: só notificações push (sem cache por enquanto). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = { titulo: "73 Aviation", corpo: "", url: "/inicio" };
  try {
    dados = { ...dados, ...event.data.json() };
  } catch {
    dados.corpo = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icones/icon-192.png",
      badge: "/icones/icon-192.png",
      data: { url: dados.url },
      tag: dados.tag || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
