# Yandex Rejections — Battleships Skirmish

> Stub. Append entries here if Yandex rejects a submission. Each entry should
> capture the rule cited, the rejection reason in their words, the fix
> applied, and the timestamp of the resubmission.

## Submissions

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| v1      | TBD  | Pending submission | Initial build by game-factory pipeline 2026-05-07. |

## Rejection log

_None yet._

## Pre-submit grep checks (mechanical)

Last passed: 2026-05-07 via `Shared/skills/yandex-presubmit/check.sh`.

- [x] No `console.log` / `console.error` / `console.warn` / `console.info` in production code
- [x] No game title rendered as text in cover or icon
- [x] Both EN and RU strings present in `STRINGS`
- [x] `<script src="/sdk.js"></script>` present at top of head (Yandex SDK)
- [x] Touch + click parity (single `onTap` handler routes both)
- [x] No external font/script CDN references
