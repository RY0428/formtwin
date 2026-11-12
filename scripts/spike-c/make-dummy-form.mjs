// Builds a DUMMY fixed form for Spike C (not an official form) and its layout.
// Usage: node scripts/spike-c/make-dummy-form.mjs
// Output: apps/private-app/assets/forms/dummy-form.pdf, dummy-form.layout.json
import fontkit from '@pdf-lib/fontkit';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, rgb } from 'pdf-lib';

const root = new URL('../../apps/private-app/assets/', import.meta.url);
const fontBytes = readFileSync(new URL('fonts/BIZUDGothic-Regular.ttf', root));

const doc = await PDFDocument.create({ updateMetadata: false });
doc.registerFontkit(fontkit);
const font = await doc.embedFont(fontBytes, { subset: false }); // subsetting is broken, see spike-c.md
const page = doc.addPage([595.28, 841.89]); // A4 portrait
const form = doc.getForm();
const grey = rgb(0.35, 0.35, 0.35);

page.drawText('DUMMY FORM – not an official form / 検証用ダミー様式', { x: 40, y: 800, size: 12, font, color: grey });
page.drawText('在留期間更新許可申請書（ダミー）', { x: 40, y: 770, size: 16, font });

const boxes = [
  { id: 'nameKanji', label: '1 氏名（漢字）', y: 700, width: 360 },
  { id: 'nameRoman', label: '2 氏名（ローマ字）Name', y: 640, width: 360 },
  { id: 'expiry', label: '3 在留期間の満了日 Date of expiration', y: 580, width: 220 },
];
const layoutFields = [];
for (const b of boxes) {
  page.drawText(b.label, { x: 40, y: b.y + 32, size: 9, font, color: grey });
  page.drawRectangle({ x: 40, y: b.y - 6, width: b.width + 8, height: 28, borderColor: grey, borderWidth: 0.8 });
  layoutFields.push({ kind: 'coordinateText', id: b.id, page: 0, x: 44, y: b.y + 2, width: b.width, fontSize: 12 });
}

page.drawText('4 在留カード番号 Residence card number', { x: 40, y: 532, size: 9, font, color: grey });
const card = form.createTextField('residenceCardNumber');
card.addToPage(page, { x: 40, y: 494, width: 220, height: 28, font, borderColor: grey, borderWidth: 0.8 });
layoutFields.push({ kind: 'acroText', id: 'residenceCardNumber', name: 'residenceCardNumber', fontSize: 12 });

page.drawText('5 住居地 Address in Japan', { x: 40, y: 472, size: 9, font, color: grey });
const addr = form.createTextField('address');
addr.addToPage(page, { x: 40, y: 434, width: 480, height: 28, font, borderColor: grey, borderWidth: 0.8 });
layoutFields.push({ kind: 'acroText', id: 'address', name: 'address', fontSize: 11 });

page.drawText('6 同居者の有無 Family in Japan: 有 Yes', { x: 64, y: 400, size: 10, font });
const cb = form.createCheckBox('familyInJapan');
cb.addToPage(page, { x: 40, y: 396, width: 16, height: 16, borderColor: grey, borderWidth: 0.8 });
layoutFields.push({ kind: 'acroCheck', id: 'familyInJapan', name: 'familyInJapan' });

form.updateFieldAppearances(font);
doc.setTitle('FormTwin dummy form');
doc.setProducer('FormTwin');
doc.setCreator('FormTwin');
const fixed = new Date(Date.UTC(2000, 0, 1));
doc.setCreationDate(fixed);
doc.setModificationDate(fixed);

const bytes = await doc.save();
writeFileSync(new URL('forms/dummy-form.pdf', root), bytes);
const layout = {
  formId: 'dummy-extension-of-stay-v0',
  sourcePdfSha256: createHash('sha256').update(bytes).digest('hex'),
  fields: layoutFields,
};
writeFileSync(new URL('forms/dummy-form.layout.json', root), JSON.stringify(layout, null, 2) + '\n');
console.log(`dummy-form.pdf ${bytes.length} bytes, sha256 ${layout.sourcePdfSha256}`);
