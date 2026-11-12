import { SDK_VERSION, getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

export const FIREBASE_SDK_VERSION = SDK_VERSION;

/**
 * Firebase app for on-device inference only. private-app never initializes
 * App Check, Auth, Firestore, Analytics or Remote Config (CLAUDE.md rule 4).
 * The config values are required by the SDK constructor; on-device requests do not use them.
 */
export function getPrivateFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const apiKey = import.meta.env['VITE_FIREBASE_API_KEY'] as string | undefined;
  const projectId = import.meta.env['VITE_FIREBASE_PROJECT_ID'] as string | undefined;
  const appId = import.meta.env['VITE_FIREBASE_APP_ID'] as string | undefined;
  if (!apiKey || !projectId || !appId) {
    throw new Error('firebase-config-missing');
  }
  return initializeApp({ apiKey, projectId, appId });
}
