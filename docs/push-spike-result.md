# Web Push spike result (issue #3)

**Status:** pending manual verification on both target iPhones.

**Date:** _YYYY-MM-DD_

**Build / hostname:** _e.g. combinado.pages.dev_

## Delivery matrix

| Device | Wi‑Fi, Focus off | Cellular, Focus off | Focus + Combinado allowed | Focus without allowlist (expected silence) |
| --- | --- | --- | --- | --- |
| iPhone A | ☐ | ☐ | ☐ | ☐ documented |
| iPhone B | ☐ | ☐ | ☐ | ☐ documented |

## Settings states observed

- Active / permission required / reinstall-repair: ☐ verified on both

## Cron / Edge Function

- Cron invoked `send-test-push` on Free plan: ☐
- Visible test payload received: ☐
- 404/410 endpoints removed: ☐ (or N/A)

## Decision

- [ ] **Go** — keep notifications in v1 scope
- [ ] **No-go for notifications** — ship without push; shared record remains source of truth (PRD M0 / §21)

## Notes

_Free-plan delays, Focus quirks, APNs oddities — keep short._
