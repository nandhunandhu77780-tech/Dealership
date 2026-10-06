/**
 * NANDANAM Agencies - Firebase Cloud Messaging Service Worker
 * Handles background push notifications when the web app is closed or in the background.
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Public Firebase Client Configuration
firebase.initializeApp({
  apiKey: "AIzaSyCzDNCxjYhz2sIKv2BIE5v9zo1oCvo1GGw",
  authDomain: "project-karthi-b0f29.firebaseapp.com",
  projectId: "project-karthi-b0f29",
  storageBucket: "project-karthi-b0f29.firebasestorage.app",
  messagingSenderId: "403319967428",
  appId: "1:403319967428:web:fd74013a1e7ae896078391",
});

const messaging = firebase.messaging();

/**
 * Handle background FCM messages
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Payment Overdue';
  const body = payload.notification?.body || payload.data?.body || 'You have an installment payment that is overdue.';
  const icon = payload.notification?.icon || payload.data?.icon || '/logo.png';
  const badge = payload.notification?.badge || payload.data?.badge || '/logo.png';

  const notificationOptions = {
    body,
    icon,
    badge,
    data: {
      url: payload.data?.url || '/member/installments',
      ...payload.data,
    },
    tag: payload.data?.tag || `overdue-${payload.data?.planId || 'installment'}`,
    renotify: true,
    requireInteraction: true,
  };

  return self.registration.showNotification(title, notificationOptions);
});

/**
 * Handle notification clicks: Focus or open the Member Installments page
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/member/installments';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open with the application, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then((focusedClient) => {
            if (focusedClient && 'navigate' in focusedClient) {
              return focusedClient.navigate(targetUrl);
            }
          });
        }
      }
      // If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
