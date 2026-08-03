# BUILD_PROGRESS.md — BusinessOS Checkpoint

> This file is the single source of truth for "where the build is." Any Claude
> session — same account, different account, different device — reads this
> file FIRST, before touching any code. Update it after every completed task,
> not just at the end of a session. Commit it with every code commit, in the
> same commit, so progress and code never drift apart.

---

## Meta

| | |
|---|---|
| **Repo** | https://github.com/Starboy-V/BussinessOS |
| **Last updated** | 2026-08-03 |
| **Last session ended because** | task complete, stopping point reached cleanly — see Session Log |

---

## Current Phase

**Phase 0 — "Prove the Workflow"** (PRD §3) — offline single-business PWA, no backend.

## Status: IN PROGRESS

---

## Next Task (start here)

5. Build the New Bill screen (PRD §9 wireframe, §6.7) — customer/vehicle search-or-create, quick-service buttons from seeded garage catalog, parts picker, discount/tax, PDF preview. Note: `service_catalog` and `inventory_items` are currently empty tables — this task will need to seed a starter garage catalog (or stub it) before quick-service buttons have anything to show; check PRD §4.1 / §6.3 for what the starter catalog should contain before inventing one.

*(Whoever — or whatever session — picks this up next: do this one task, update the checklist and this "Next Task" line, commit, then stop and reassess. Don't chain multiple unrelated tasks in one uncommitted block of work.)*

---

## Phase 0 Task Checklist

Each box maps to a PRD section — check the section before marking done, don't rely on memory of what "should" be there.

- [x] Repo scaffolding: `index.html`, `manifest.json`, service worker, Dexie.js wired up
- [x] Dexie schema mirrors PRD §11 tables (single-business subset, no `business_id` yet): `customers`, `vehicles`, `service_catalog`, `jobs`, `job_line_items`, `job_photos`, `inventory_items`, `inventory_transactions`, `invoices`, `invoice_line_items`, `payments`, `expenses`, `expense_categories`
- [x] Bottom nav shell — Home / Jobs / Bill / Inventory / More (PRD §8) — *shipped as part of task 1's commit, not its own; checked off here retroactively rather than leaving it stale*
- [ ] Bottom nav shell — Home / Jobs / Bill / Inventory / More (PRD §8)
- [x] Home Dashboard screen (PRD §9 wireframe, §6.10 subset) — revenue/expenses/profit/jobs-pending cards + low-stock banner, reading live from Dexie; full 12-metric §6.10 set (cash/UPI split, top mechanic, etc.) deliberately deferred, not forgotten
- [ ] New Bill screen (PRD §9 wireframe) — customer/vehicle search-or-create, quick-service buttons from seeded garage catalog, parts picker, discount/tax, PDF preview
- [ ] Job Card screen (PRD §9 wireframe) — status stepper, photo capture (intake/completion), mechanic field, notes
- [ ] Customer/Vehicle profile screen (PRD §6.4) — search by plate/phone/name, full history in one scroll
- [ ] Inventory screens — Local Stock + Ordered Parts (PRD §6.6), auto-decrement on billing
- [ ] Invoice PDF generation (pdf-lib, client-side) + Android Share Sheet (PRD §6.7)
- [ ] Settings → Backup: export all IndexedDB data as one JSON file, share via Share Sheet (PRD §6.13)
- [ ] Settings → Restore from backup file, offered on first run after reinstall (PRD §6.13)
- [ ] Client-side photo compression before storage: ≤1600px longest edge, JPEG ~70%, target <300KB (PRD §3 Phase 1 table — build the habit now even though Phase 0 has no upload queue yet)
- [ ] Deploy to Cloudflare Pages, confirm "Add to Home Screen" install works on a real Android device
- [ ] Exit criterion check: garage prefers this to the notebook for two consecutive weeks (PRD §3) — this is a human observation task, not a code task; log the result here when known

---

## Decisions Already Locked In — Do Not Re-Litigate

A fresh session with no memory of *why* a choice was made will sometimes want
to "improve" something that was already deliberately decided. These are closed:

- Hosting: **Cloudflare Pages**, not Netlify or Vercel (PRD §3 — unlimited bandwidth free tier)
- Local storage: **IndexedDB via Dexie.js**, no backend in Phase 0
- Auth: none in Phase 0; PIN-based in Phase 1, never SMS OTP (PRD §3, §13)
- PDF generation: client-side, **pdf-lib**, no server round-trip
- Multi-tenant readiness: `vehicle_id` nullable, `custom_fields jsonb` on jobs/customers — build these into the schema now even in single-business Phase 0, since retrofitting later is the expensive path (PRD §4.1)
- Timestamp storage: **ISO 8601 strings**, not JS `Date` objects, for every date/time field written to Dexie (`created_at`, `paid_at`, `expense_date`, etc.) — set by Home Dashboard task since it was the first task to read timestamps; picked for IndexedDB structured-clone safety and because it's what the §6.13 JSON backup needs anyway. Any future task writing these fields should follow it, not invent a second format.

If a task seems to require reopening one of these, stop and flag it below instead of silently deciding differently.

---

## Blockers / Open Questions For The Human

- `icons/icon-192.png` and `icons/icon-512.png` are crude generated placeholders (solid color + "B" monogram), not real branding. Fine for install testing, worth swapping before showing this to the actual garage owner.

---

## Files Created So Far

- `index.html` — app shell, bottom nav (Home/Jobs/Bill/Inventory/More), Alpine.js-driven screen switching, placeholder content per screen
- `manifest.json` — PWA manifest, standalone display, theme color
- `sw.js` — service worker, caches app shell + CDN deps (Dexie/Alpine) for zero-connectivity use per §7
- `css/style.css` — design tokens (44px tap targets, high-contrast text, system font stack for offline reliability)
- `js/app.js` — Alpine controller for nav/screen state
- `js/db.js` — Dexie initialized **and schema defined** (13 tables per PRD §11, single-business subset)
- `icons/icon-192.png`, `icons/icon-512.png` — placeholder PWA icons (see Blockers)
- `index.html` — Home Dashboard markup added (metric grid, low-stock banner, day-1 empty state)
- `js/app.js` — dashboard state + `loadDashboard()` reading Dexie `payments`/`expenses`/`jobs`/`inventory_items`; established the ISO-string timestamp convention (see Decisions Locked In)
- `css/style.css` — dashboard styles (`.metric-grid`, `.metric-card`, `.alert-banner`, etc.), matching existing tokens

---

## Session Log

*(one line per session, oldest first — append, never delete)*

- Session 0 — checkpoint file created, no code written yet.
- Session 1 — Phase 0 task 1 complete: PWA shell scaffolded (index.html, manifest, service worker, css, Alpine app controller, Dexie stub, placeholder icons). Next: Dexie schema.
- Session 2 — Phase 0 task 2 complete: Dexie schema defined for all 13 tables in `js/db.js`. Retroactively checked off "bottom nav shell" since it shipped inside task 1's commit. Next: Home Dashboard screen.
- Session 3 — Phase 0 task 4 complete: Home Dashboard built (revenue/expenses/profit/jobs-pending cards, low-stock banner, day-1 empty state), reading live from Dexie. Locked in ISO-string timestamp convention for future tasks. Next: New Bill screen — will need a starter service catalog seeded first, flagged in Next Task.
