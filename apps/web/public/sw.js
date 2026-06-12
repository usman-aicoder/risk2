/* Service worker for turn notifications (P2). */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* malformed payload — show a generic notification */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Risk II Online", {
      body: data.body || "It's your turn.",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const win of windows) {
        if (win.url.includes(url) && "focus" in win) return win.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
