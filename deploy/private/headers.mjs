// Production security headers for apps/private-app (architecture.md §3.2).
// Single source of truth: used by `vite preview` and checked against firebase.json
// by tests/deploy/headers.test.ts. Never widen connect-src here to make the SDK work;
// a failing on-device init is a gate failure, not a reason to allow egress.
// connect-src allows `data:` only: @firebase/ai 3.1.0 converts image parts with
// fetch('data:...') (measured 2026-11-12). No network origin, not even 'self'.
export const privateCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "worker-src 'self'",
  "connect-src data:",
  "manifest-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const privateHeaders = {
  'Content-Security-Policy': privateCsp,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
};
