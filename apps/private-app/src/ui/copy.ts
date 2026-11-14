/**
 * All user-facing English copy of the personal-entry app in one place (requirements: English UI).
 * Never claim guarantees such as "zero leakage" or "nothing remains on this device" (CLAUDE.md rule 9).
 */
export const COPY = {
  appName: 'FormTwin',
  tagline: 'Fill in an official form on this device',
  intro: (title: string) =>
    `Fill in the ${title} on this device. Use fictional sample data only. This app supports checking your own entries; it does not judge eligibility or give legal advice.`,
  privacyNote:
    'This page is built to work without sending your inputs anywhere: it has no upload feature and blocks network connections from the page. Browser-managed traffic (such as model downloads) is outside what the page controls.',
  steps: {
    form: { title: '0. Form and font', description: 'The bundled form package is checked before you can enter anything.' },
    ai: { title: '1. Prepare on-device AI (optional)', description: 'AI reads the image on this device only. You can skip it and type the values.' },
    image: { title: '2. Choose a sample image (optional)', description: 'JPEG or PNG. The image stays in this page’s memory.' },
    candidates: { title: '3. Candidates', description: 'Nothing is copied into the form until you choose it.' },
    fields: { title: '4. Check every value', description: 'Compare each value with your card, then tick it.' },
    output: { title: '5. Create and save the PDF', description: 'Only checked values are written to the PDF.' },
    end: { title: '6. Finish', description: 'Clear everything from this page when you are done.' },
  },
  boot: {
    status: 'Form status',
    failed: 'The bundled form package could not be verified',
    /** Short English reason per package error code (no personal data). */
    reasons: {
      unsigned: 'The package is not signed.',
      malformed: 'The package files are not in the expected format.',
      key_mismatch: 'The signature and key do not match.',
      bad_signature: 'The signature is not valid.',
      revoked: 'This package has been withdrawn.',
      untrusted_key: 'The signing key is not on the trusted list.',
      key_revoked: 'The signing key has been revoked.',
      key_retired: 'The signing key was retired before this package was made.',
      incompatible: 'The package is not compatible with this app version.',
      hash_mismatch: 'A package file does not match its signed hash.',
      invalid_formdef: 'The form definition is not valid.',
      assets_invalid: 'The bundled files could not be read.',
    } as Readonly<Record<string, string | undefined>>,
    disabled: 'Entry is disabled.',
  },
  ai: {
    availability: 'Browser AI availability',
    status: 'AI status',
    reason: 'reason',
    progress: 'Model download progress',
    prepare: 'Prepare AI',
    skip: 'Continue without AI',
    off: 'AI extraction is off for this session. You can enter values manually.',
    cancel: 'Cancel',
    cancelNote: 'The browser may continue downloading the model in the background; this app no longer waits for it.',
  },
  image: { label: 'Residence card image (JPEG or PNG)', alt: 'Selected sample', extract: 'Extract on this device' },
  candidates: {
    failed: 'Failed',
    extracting: 'Extracting…',
    finishing: 'The previous extraction is still finishing on this device. You can type the values meanwhile.',
    manual: 'Type the values instead.',
  },
  /** Failure codes → English reasons. No inputs, outputs or file details. */
  reasons: {
    api_missing: 'This browser does not offer built-in AI.',
    unavailable: 'Built-in AI is not available on this device.',
    not_prepared: 'AI is not prepared.',
    prepare_failed: 'AI could not be prepared.',
    inference_failed: 'The on-device model could not read the image.',
    invalid_output: 'The model’s answer could not be used, even after one retry.',
    source_mismatch: 'The answer did not come from this device, so it was discarded.',
    timeout: 'Extraction took longer than 30 seconds, so its result will not be used.',
    cancelled: 'AI preparation was cancelled.',
    config_missing: 'The app configuration is incomplete.',
    image_type: 'Use a JPEG or PNG image.',
    image_too_large: 'The image file is too large.',
    image_decode_failed: 'The image could not be opened.',
    image_dimensions: 'The image size is not supported.',
    unknown: 'Something went wrong.',
  },
  end: {
    button: 'End session and clear data',
    cleared:
      'Your inputs, images, and generated results have been cleared from this app. Your original files and downloaded PDFs have not been deleted.',
    limits:
      'This app cannot guarantee deletion of browser or operating-system history, memory, synced files, or backups.',
  },
  lifecycle: {
    lockedTitle: 'Session locked',
    locked:
      'This page was hidden, so its contents are covered. Select Resume to continue. Your inputs are kept in this page only while the session is open.',
    resume: 'Resume',
    warning: 'No activity for 9 minutes. The session will end in 1 minute and clear your inputs.',
    stay: 'Keep working',
    endedBecause: {
      user: '',
      inactivity: 'The session ended after 10 minutes without activity.',
      restored: 'This page was restored from the browser’s back/forward history, so a new session was started.',
      expired_while_locked: 'The session ended because it stayed locked for more than 10 minutes.',
      source_mismatch:
        'The session was stopped because an AI answer did not report this device as its source. AI extraction is off until you reload the page.',
    },
  },
  diagnostics: 'Diagnostics (no personal data)',
  testKey: 'TEST KEY — not for real use',
} as const;

/** English reason for a fixed failure code (unknown codes get a generic text). */
export function reasonText(code: string): string {
  const reasons: Readonly<Record<string, string | undefined>> = COPY.reasons;
  return reasons[code] ?? COPY.reasons.unknown;
}
