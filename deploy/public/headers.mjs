// Production security headers for apps/public-app.
// Spike B (2026-11-13): hosts from the SDK code (firebase 13.3.0: AI Logic
// firebasevertexai.googleapis.com, App Check content-firebaseappcheck.googleapis.com,
// reCAPTCHA Enterprise script www.google.com/recaptcha/enterprise.js) and Google's published
// reCAPTCHA CSP guidance (script/frame hosts; not re-fetched from this container).
// PROVISIONAL until the hosted real-device run records no CSP violations (docs/spikes/spike-b.md).
export const publicCsp = [
  "default-src 'none'",
  "script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
  "connect-src 'self' https://firebasevertexai.googleapis.com https://content-firebaseappcheck.googleapis.com",
  "manifest-src 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const publicHeaders = {
  'Content-Security-Policy': publicCsp,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
};
