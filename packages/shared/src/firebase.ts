// trotro/packages/shared/src/firebase.ts
import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";
import {
  getAnalytics,
  isSupported as analyticsIsSupported,
  logEvent as gaLogEvent,
  setUserId as gaSetUserId,
  setUserProperties as gaSetUserProperties,
  type Analytics
} from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,

  // REQUIRED for GA4 / Firebase Analytics on web
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string
};

export const firebaseApp = initializeApp(firebaseConfig);
export const messaging = getMessaging(firebaseApp);
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

// ---- Analytics (safe, optional at runtime) ----
let analytics: Analytics | null = null;

/**
 * Initialize Analytics only when supported.
 * Call once per app (Passenger web, Driver web) on startup.
 */
export async function initAnalytics(opts?: {
  userId?: string;
  userProps?: Record<string, string>;
}): Promise<Analytics | null> {
  try {
    const supported = await analyticsIsSupported();
    if (!supported) return null;

    // measurementId missing -> analytics will not function correctly
    if (!firebaseConfig.measurementId) return null;

    analytics = getAnalytics(firebaseApp);

    if (opts?.userId) gaSetUserId(analytics, opts.userId);
    if (opts?.userProps) gaSetUserProperties(analytics, opts.userProps);

    return analytics;
  } catch {
    return null;
  }
}

/**
 * Safe GA4 event logging. Never crashes the app.
 */
const isDev = import.meta.env.DEV;

export function logEvent(name: string, params?: Record<string, unknown>) {
  try {
    if (!analytics) return;

    const finalParams = isDev
      ? { ...(params ?? {}), debug_mode: true }
      : params ?? {};

    gaLogEvent(analytics, name, finalParams);
  } catch {}
}

/**
 * Optional helpers if you ever want to set these later.
 */
export function setAnalyticsUserId(userId: string) {
  try {
    if (!analytics) return;
    gaSetUserId(analytics, userId);
  } catch {}
}

export function setAnalyticsUserProps(userProps: Record<string, string>) {
  try {
    if (!analytics) return;
    gaSetUserProperties(analytics, userProps);
  } catch {}
}

export function getAnalyticsInstance(): Analytics | null {
  return analytics;
}