/**
 * Field-explanation port (docs/decisions.md 2026-11-14). Implementations receive only the prompt that the
 * egress gateway built from an approved form's adopted FormDef labels; no PDF, image or free text.
 */
export interface FieldExplainRequest {
  readonly prompt: string;
  readonly fieldIds: readonly string[];
}

export interface FieldExplainResponse {
  readonly text: string;
  /** `result.response.inferenceSource`: "in_cloud" or "on_device" (automatic fallback). */
  readonly inferenceSource: string | undefined;
}

export interface FieldExplainer {
  explain(request: FieldExplainRequest): Promise<FieldExplainResponse>;
}
