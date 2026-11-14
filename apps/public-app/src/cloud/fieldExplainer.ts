import { fieldExplanationsJsonSchema, fieldExplanationsResponseSchema } from '@formtwin/contracts';
import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type GenerationConfig } from 'firebase/ai';
import type { FieldExplainer, FieldExplainRequest, FieldExplainResponse } from './explainerPort.ts';
import { CLOUD_MODEL, getPublicFirebaseApp } from './firebaseCloud.ts';

/**
 * Public field explanations with InferenceMode.PREFER_IN_CLOUD — the only PREFER_* use in this repository
 * (CLAUDE.md rule 2 exception, docs/decisions.md 2026-11-14; enforced by scripts/check-invariants.mjs).
 *
 * SDK behaviour (@firebase/ai 3.1.0, code-read 2026-11-14): the cloud is tried first. Errors with code
 * FETCH_ERROR (non-OK HTTP responses such as 429), ERROR (network failures, App Check token errors) or
 * API_NOT_ENABLED make the SDK answer with the on-device model when Chrome reports it `available`.
 * Caveat: if App Check never finishes initializing (reCAPTCHA script not loaded), the token wait does not
 * end and no fallback starts; the gateway's time limit covers that. Device behaviour: see device:check.
 */
export class FirebaseFieldExplainer implements FieldExplainer {
  async explain(request: FieldExplainRequest): Promise<FieldExplainResponse> {
    const model = getGenerativeModel(
      getAI(getPublicFirebaseApp(), { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true }),
      {
        mode: InferenceMode.PREFER_IN_CLOUD,
        inCloudParams: {
          model: CLOUD_MODEL,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: fieldExplanationsResponseSchema(request.fieldIds),
          } as unknown as GenerationConfig,
        },
        onDeviceParams: {
          createOptions: {
            expectedInputs: [{ type: 'text', languages: ['en', 'ja'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
          },
          promptOptions: { responseConstraint: fieldExplanationsJsonSchema(request.fieldIds) },
        },
      },
    );
    const result = await model.generateContent(request.prompt);
    return { text: result.response.text(), inferenceSource: result.response.inferenceSource };
  }
}

export function createFieldExplainer(): FieldExplainer {
  // Initialize Firebase and App Check at page load, while the network is usually up: if App Check is first
  // initialized offline, its token wait can stall and no fallback starts (the gateway then times out).
  try {
    getPublicFirebaseApp();
  } catch {
    /* configuration missing: reported on first use */
  }
  return new FirebaseFieldExplainer();
}
