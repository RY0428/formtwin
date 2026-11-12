import type { ImageInput } from '../../ondevice/OnDeviceLLM.ts';

/**
 * Image intake (architecture.md §7.1). PROVISIONAL limits: evaluation settings,
 * to be fixed before the gate judgement and logged when changed.
 */
export const IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
} as const;

export type ImageRejection = 'type' | 'too_large' | 'decode_failed' | 'dimensions';

export class ImageRejectedError extends Error {
  readonly reason: ImageRejection;
  constructor(reason: ImageRejection) {
    super(`image rejected: ${reason}`);
    this.name = 'ImageRejectedError';
    this.reason = reason;
  }
}

export interface PreparedImage extends ImageInput {
  readonly width: number;
  readonly height: number;
  /** Re-encoded PNG for local preview; revoke with URL.revokeObjectURL. */
  readonly blob: Blob;
}

const ALLOWED = new Set(['image/png', 'image/jpeg']);

/**
 * Decodes the file (the declared MIME type alone is not trusted), checks limits,
 * and re-encodes it as PNG through a canvas so source metadata (EXIF etc.) is dropped.
 * Everything stays in memory.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED.has(file.type)) throw new ImageRejectedError('type');
  if (file.size > IMAGE_LIMITS.maxBytes) throw new ImageRejectedError('too_large');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageRejectedError('decode_failed');
  }
  try {
    const { width, height } = bitmap;
    if (width === 0 || height === 0 || width > IMAGE_LIMITS.maxWidth || height > IMAGE_LIMITS.maxHeight) {
      throw new ImageRejectedError('dimensions');
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new ImageRejectedError('decode_failed');
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b === null ? reject(new ImageRejectedError('decode_failed')) : resolve(b)), 'image/png');
    });
    canvas.width = 0;
    canvas.height = 0;
    return { mimeType: 'image/png', base64: await toBase64(blob), width, height, blob };
  } finally {
    bitmap.close();
  }
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
