/// <reference lib="webworker" />

import { precacheAndRoute } from "workbox-precaching";

// Offline precache for Vite build
precacheAndRoute(self.__WB_MANIFEST);

// Firebase compat (background notifications)
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDVmvkaf3Pr7IX9Vcb9Xq9NvnrOXr1ApG4",
  authDomain: "trotro-3003b.firebaseapp.com",
  projectId: "trotro-3003b",
  messagingSenderId: "993740509211",
  appId: "1:993740509211:web:3bd673dc9e6c393b72e8be"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Trotro";
  const options = {
    body: payload?.notification?.body || "",
    data: payload?.data || {}
  };
  self.registration.showNotification(title, options);
});