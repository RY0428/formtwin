import type { ExtractionResult } from '@formtwin/contracts';

/**
 * Boundary for on-device extraction (tech-stack.md §9: OnDeviceLLM / CloudLLM).
 * There is deliberately no mode parameter: this adapter is on-device only.
 */
export type DeviceAvailability = 'api_missing' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** Fixed failure codes. Messages never contain inputs, outputs or file details. */
export type OnDeviceFailure =
  | 'api_missing'
  | 'unavailable'
  | 'not_prepared'
  | 'prepare_failed'
  | 'inference_failed'
  | 'invalid_output'
  | 'source_mismatch'
  | 'timeout'
  | 'cancelled';

export class OnDeviceError extends Error {
  readonly code: OnDeviceFailure;
  constructor(code: OnDeviceFailure) {
    super(`on-device: ${code}`);
    this.name = 'OnDeviceError';
    this.code = code;
  }
}

export interface ImageInput {
  readonly mimeType: 'image/png' | 'image/jpeg';
  /** Base64 without the data: prefix. In memory only. */
  readonly base64: string;
}

export interface OnDeviceLLM {
  availability(): Promise<DeviceAvailability>;
  /** Must be called from a user activation (button click), before any PII input. */
  prepare(onProgress: (fraction: number) => void): Promise<void>;
  extract(image: ImageInput): Promise<ExtractionResult>;
}
