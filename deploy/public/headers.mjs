// Production security headers for apps/public-app.
// PROVISIONAL (S1): no Firebase hosts are allowed yet. Spike B adds only the
// App Check / AI Logic / reCAPTCHA hosts actually observed and documented
// in docs/spikes/spike-b.md.
export const publicCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
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
