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
  },
  image: { label: 'Residence card image (JPEG or PNG)', alt: 'Selected sample', extract: 'Extract on this device' },
  candidates: { failed: 'Failed', extracting: 'Extracting…' },
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
    },
  },
  diagnostics: 'Diagnostics (no personal data)',
  testKey: 'TEST KEY — not for real use',
} as const;
