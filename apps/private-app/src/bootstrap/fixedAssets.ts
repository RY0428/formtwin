import pkg from 'virtual:form-package';
import type { PdfLayout } from '@formtwin/contracts';
import { verifyPackage, type VerifiedPackage } from '../packages/verifyPackage.ts';

/**
 * Fixed public assets: the signed form package bundled at build time, verified before any
 * personal data is accepted (architecture.md §3.1, §6.2-1). No runtime fetch.
 */
export interface FixedAssets {
  readonly template: Uint8Array;
  readonly font: Uint8Array;
  readonly layout: PdfLayout;
  readonly pkg: VerifiedPackage;
}

export async function prepareFixedAssets(): Promise<FixedAssets> {
  const verified = await verifyPackage(pkg);
  if (verified.font.length < 1000) throw new Error('font-missing');
  return { template: verified.template, font: verified.font, layout: verified.layout, pkg: verified };
}
