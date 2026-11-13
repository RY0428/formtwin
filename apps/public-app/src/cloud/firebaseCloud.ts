import { formDefCandidateResponseSchema } from '@formtwin/contracts';
import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type GenerativeModel } from 'firebase/ai';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import type { CloudAnalysisRequest, CloudAnalysisResponse, CloudFormAnalyzer } from './CloudFormAnalyzer.ts';

/** Model fixed by tech-stack.md §4 (availability checked 2026-11-13, firebase.google.com/docs/ai-logic/models). */
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';
/** Host the Firebase AI Logic SDK (firebase 13.3.0) sends requests to. */
export const AI_LOGIC_HOST = 'firebasevertexai.googleapis.com';

function env(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) throw new Error('firebase-config-missing');
  return value;
}

let app: FirebaseApp | undefined;

/**
 * App Check with reCAPTCHA Enterprise is initialized before any AI Logic call
 * (firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider, checked 2026-11-13).
 * No debug provider: a debug token never ships in this bundle.
 */
function getPublicFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApp();
    return app;
  }
  app = initializeApp({
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
  });
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY')),
    isTokenAutoRefreshEnabled: true,
  });
  return app;
}

export class FirebaseCloudFormAnalyzer implements CloudFormAnalyzer {
  readonly model = CLOUD_MODEL;
  readonly endpointHost = AI_LOGIC_HOST;
  private generative: GenerativeModel | undefined;

  async analyze(request: CloudAnalysisRequest): Promise<CloudAnalysisResponse> {
    this.generative ??= getGenerativeModel(
      getAI(getPublicFirebaseApp(), { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true }),
      {
        mode: InferenceMode.ONLY_IN_CLOUD,
        inCloudParams: {
          model: CLOUD_MODEL,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: formDefCandidateResponseSchema as unknown as Record<string, unknown>,
          },
        },
      },
    );
    const result = await this.generative.generateContent([
      request.prompt,
      { type: 'inlineData', inlineData: { mimeType: 'application/pdf', data: request.pdfBase64 } },
    ]);
    return { text: result.response.text(), inferenceSource: result.response.inferenceSource };
  }
}

export function createCloudFormAnalyzer(): CloudFormAnalyzer {
  return new FirebaseCloudFormAnalyzer();
}
