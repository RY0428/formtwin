// Inspect a public original before approval (architecture.md §8.1) and print the record.
// Usage: node scripts/forms/approve-source.mjs <pdf>
// Checks: SHA-256, encryption, AcroForm/XFA, JavaScript/OpenAction/AA, attachments, annotations,
// incremental updates. A human still reviews visible content and hidden text (not automated).
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName } from 'pdf-lib';
import { sha256Hex } from './lib.mjs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/forms/approve-source.mjs <pdf>');
  process.exit(2);
}
const bytes = readFileSync(path);
const text = bytes.toString('latin1');
const doc = await PDFDocument.load(bytes, { updateMetadata: false });
const catalog = doc.catalog;
const has = (name) => catalog.has(PDFName.of(name));
const names = catalog.lookup(PDFName.of('Names'));
const pages = doc.getPages();
const findings = {
  sha256: sha256Hex(bytes),
  size: bytes.length,
  pages: pages.length,
  pageSizes: [...new Set(pages.map((p) => `${p.getWidth().toFixed(3)}x${p.getHeight().toFixed(3)} rot${p.getRotation().angle}`))],
  encrypted: doc.isEncrypted,
  acroForm: has('AcroForm'),
  xfa: /\/XFA\b/.test(text),
  javascript: /\/JavaScript\b|\/JS\b/.test(text),
  openAction: has('OpenAction') ? String(catalog.lookup(PDFName.of('OpenAction'))) : null,
  additionalActions: has('AA') || /\/AA\b/.test(text),
  embeddedFiles: Boolean(names && names.has && names.has(PDFName.of('EmbeddedFiles'))) || /\/EmbeddedFile\b/.test(text),
  annotations: pages.reduce((n, p) => n + (p.node.Annots()?.size() ?? 0), 0),
  eofMarkers: (text.match(/%%EOF/g) ?? []).length,
};
const blocking = [];
if (findings.encrypted) blocking.push('encrypted');
if (findings.javascript) blocking.push('javascript');
if (findings.additionalActions) blocking.push('additional actions');
if (findings.embeddedFiles) blocking.push('embedded files');
if (findings.xfa) blocking.push('XFA');
console.log(JSON.stringify({ ...findings, blocking }, null, 2));
if (blocking.length > 0) process.exit(1);
