import { fieldExplanationsJsonSchema, fieldExplanationsResponseSchema } from '@formtwin/contracts';
import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type GenerationConfig } from 'firebase/ai';
import type { FieldExplainer, FieldExplainRequest, FieldExplainResponse } from './explainerPort.ts';
import { CLOUD_MODEL, getPublicFirebaseApp } from './firebaseCloud.ts';

/**
 * Public field explanations with InferenceMode.PREFER_IN_CLOUD — the only PREFER_* use in this repository
 * (CLAUDE.md rule 2 exception, docs/decisions.md 2026-11-14; enforced by scripts/check-invariants.mjs).
 *
 * SDK behaviour (@firebase/ai 3.1.0, code-read 2026-11-14): the cloud is tried first; on FETCH_ERROR
 * (network failure, HTTP errors such as 429), ERROR or API_NOT_ENABLED the SDK falls back to the on-device
 * model when Chrome reports it `available`. The input is text built from public labels only.
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
  return new FirebaseFieldExplainer();
}
