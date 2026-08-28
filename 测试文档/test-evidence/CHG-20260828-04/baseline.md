# CHG-20260828-04 Baseline

- Captured: 2026-08-28 +08:00
- Git commit: `6b6cf928176ee3963a1f7ecc53de6aaa0d719b90`
- Branch: `codex/mac-capture-interview-20260828`
- Internal package version: `2026.8.27002`
- Business version: `2026.8.27.2`
- Production website/update manifests changed: no
- Database/backend schema changed: no
- Browser extension/Android scope opened: no

## Pre-change SHA-256

```text
D0094B2C7C93515798E383CAB32EA6502AF2BC97E4BCBE8F5FB998304B74F033  desktop-core/electron/helpers/RealtimeVoiceHelper.ts
2069C8848F0567CB4635FBEDF4576124D92FD27E4936EED3D1FD0BF3FFED3095  desktop-core/electron/helpers/ScreenshotHelper.ts
BBB5127CC010E9C474F07C7722D61CBD2A641CDE7891E4EE84C468550A22A9FD  desktop-core/electron/helpers/ProcessingHelper.ts
DD77590AE3316C400375C452F4DCE6D200D6FE603C8C21EDFB764B8D8B097F72  desktop-core/electron/helpers/InterviewHelper.ts
F6675F5204094C2D18EDFDD9661A96DC95142BF98D33A65CFA8853F9732EA833  desktop-core/src/pages/Interview.tsx
F2D3FD6CB7C06C84F97F54E414B99473DB96303D79F2C30C803398FBAEDE773E  desktop-core/src/pages/ExamOverlay.tsx
```

## Pre-change behavior

- `RealtimeVoiceHelper` stops each display video track immediately after `getDisplayMedia`, does not monitor track ended/mute or AudioContext state, and exposes only a main-process boolean `running`.
- ASR reconnect exists, but reconnect/recovery state is not a first-class UI contract and hidden-window execution failures are swallowed by polling.
- Screenshot analyze writes `exam-analysis.log`, but capture/save/compress stages do not share one operation timeline and the UI headline remains generic.
- Mac permission prompts occur when the user enters a feature, not as a complete first-launch verified onboarding flow.

## Rollback boundary

Code rollback is a Git revert to this commit. No state or schema migration is planned. New local logs/onboarding flags must be optional so this baseline client can ignore them. Test packages must remain under OSS `temp/` and can be removed without touching production manifests.
