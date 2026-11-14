# Demo video notes (Day 13–16)

Requirements: 3 minutes or less, English, fictional data only, no guarantee wording (CLAUDE.md rule 9).

## Advice to follow (recorded 2026-11-14)

Source: Firebase video "How to Build Hybrid On-Device + Cloud AI Apps with Firebase AI Logic" — the first 30
seconds of a demo should show who it is for, what it is used for, and how Firebase supports it.

## First 30 seconds (draft)

1. **Who:** foreign residents in Japan filling in an official form (Application for Extension of Period of
   Stay).
2. **What:** read the residence card photo on the device, check every value, fill the official PDF.
3. **How Firebase supports it:** Firebase AI Logic, one SDK, inference placed by data sensitivity:
   - public blank form analysis → cloud only (App Check);
   - public field explanations → cloud first with automatic on-device fallback (`PREFER_IN_CLOUD`);
   - personal data → on-device only (`ONLY_ON_DEVICE`), no cloud fallback by design.

## Points to show later in the video

- Field explanations: "In the cloud" badge, then network off → "On this device" (automatic fallback).
- Private app: extraction on the device, manual check, PDF; works with the network off.
- Why personal data has no cloud fallback (design choice; consistent with a Firebase engineer's spoken answer in the video Q&A — not an official contest answer, so do not present it as one).
