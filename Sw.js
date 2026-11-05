/* Service worker mínimo: só exibe as notificações e abre o site ao tocar nelas. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(lista =>
    lista.length ? lista[0].focus() : self.clients.openWindow(e.notification.data || './')));
});
