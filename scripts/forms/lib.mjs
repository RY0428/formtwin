// Shared helpers for the form package scripts (Node 24, WebCrypto). No network access.
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const subtle = webcrypto.subtle;

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Refuse any private-key path inside the repository (CLAUDE.md rule 7). */
export function assertOutsideRepo(path) {
  const abs = resolve(path);
  let real;
  try {
    real = realpathSync(abs);
  } catch {
    real = abs;
  }
  for (const p of [abs, real]) {
    const rel = relative(ROOT, p);
    if (!rel.startsWith('..') && !isAbsolute(rel)) {
      throw new Error(`Refusing a private key inside the repository: ${p}`);
    }
  }
}

export async function keyIdFor(publicJwk) {
  const canon = JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y });
  return `ft-${sha256Hex(Buffer.from(canon)).slice(0, 16)}`;
}

export async function signBytes(privateJwk, bytes) {
  const key = await subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes);
  return Buffer.from(sig).toString('base64');
}

export async function verifyBytes(publicJwk, bytes, signatureB64) {
  const { kty, crv, x, y } = publicJwk;
  const key = await subtle.importKey('jwk', { kty, crv, x, y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(signatureB64, 'base64'), bytes);
}
