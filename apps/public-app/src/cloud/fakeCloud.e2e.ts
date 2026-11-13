import type { CloudAnalysisRequest, CloudAnalysisResponse, CloudFormAnalyzer } from './CloudFormAnalyzer.ts';

/**
 * E2E-ONLY stand-in, wired by `vite --mode e2e` (vite.config.ts alias). Never part of the
 * production build (scripts/check-public-bundle.mjs). Not evidence of a real cloud call.
 */
export function createCloudFormAnalyzer(): CloudFormAnalyzer {
  return {
    model: 'e2e-fake-model',
    endpointHost: 'fake.invalid',
    async analyze(request: CloudAnalysisRequest): Promise<CloudAnalysisResponse> {
      const pdf = atob(request.pdfBase64.slice(0, 12));
      if (!pdf.startsWith('%PDF')) throw new Error('not a pdf');
      await new Promise((r) => setTimeout(r, 150));
      return {
        inferenceSource: 'in_cloud',
        text: JSON.stringify({
          fields: [
            { labelJa: '氏名', labelEn: 'Name', kind: 'text', semanticKey: 'fullName', status: 'resolved', page: 0, box: [255, 220, 275, 900] },
            { labelJa: '在留期間の満了日', labelEn: 'Date of expiration of period of stay', kind: 'date', semanticKey: 'periodOfStayExpiry', status: 'resolved', page: 0, box: [455, 290, 475, 520] },
            { labelJa: '在留カード番号', labelEn: 'Residence card number', kind: 'text', semanticKey: 'residenceCardNumber', status: 'resolved', page: 0, box: [485, 240, 505, 520] },
            { labelJa: '国籍・地域', labelEn: 'Nationality/Region', kind: 'text', semanticKey: null, status: 'unsupported', page: 0, box: [205, 140, 225, 480] },
          ],
        }),
      };
    },
  };
}
