/**
 * Cloud analysis port (architecture.md §6.1). Implementations receive only the base64 of an
 * approved original that the egress gateway resolved and hash-checked; callers outside
 * `src/egress` never get a reference to an analyzer.
 */
export interface CloudAnalysisRequest {
  readonly pdfBase64: string;
  readonly prompt: string;
}

export interface CloudAnalysisResponse {
  /** Raw model text (JSON expected). Validated by the gateway. */
  readonly text: string;
  /** `result.response.inferenceSource`; only "in_cloud" is accepted. */
  readonly inferenceSource: string | undefined;
}

export interface CloudFormAnalyzer {
  readonly model: string;
  readonly endpointHost: string;
  analyze(request: CloudAnalysisRequest): Promise<CloudAnalysisResponse>;
}
