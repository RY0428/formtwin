# Device check reports

Written by `npm run device:check` on the developer's Mac (installed Google Chrome, dedicated profile
`~/.formtwin-device-profile`, hosted private app, real on-device model). Fictional sample images and values
only; no personal data. Each file records Chrome version, app build, flags, AI availability and per-step
results (cancel during preparation, preparation time, extraction time and outcome per sample image, hidden
page lock with Resume, Save PDF without lock, End session, requests outside the page origin).

Dry runs of the script in the container (`FORMTWIN_DRY_FAKE_AI=1`) use a stand-in model and are not device
evidence; their reports are not kept.
