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

6. Build the Job Card screen (PRD §9 wireframe, §6.5) — status stepper (Pending → In Progress → Completed → Delivered, plus Cancelled), photo capture stub (intake/completion — actual compression is its own later checklist item, don't build that here), mechanic field, notes. Once Job Card exists, revisit whether New Bill should gain a "bill from this job" path (§6.7 mentions pulling in a job's services/parts automatically) — not required for this task, just worth having in mind since it touches the same invoice-creation code just shipped.

*(Whoever — or whatever session — picks this up next: do this one task, update the checklist and this "Next Task" line, commit, then stop and reassess. Don't chain multiple unrelated tasks in one uncommitted block of work.)*

---

## Phase 0 Task Checklist

Each box maps to a PRD section — check the section before marking done, don't rely on memory of what "should" be there.

- [x] Repo scaffolding: `index.html`, `manifest.json`, service worker, Dexie.js wired up
- [x] Dexie schema mirrors PRD §11 tables (single-business subset, no `business_id` yet): `customers`, `vehicles`, `service_catalog`, `jobs`, `job_line_items`, `job_photos`, `inventory_items`, `inventory_transactions`, `invoices`, `invoice_line_items`, `payments`, `expenses`, `expense_categories`
- [x] Bottom nav shell — Home / Jobs / Bill / Inventory / More (PRD §8) — *shipped as part of task 1's commit, not its own; checked off here retroactively rather than leaving it stale*
- [ ] Bottom nav shell — Home / Jobs / Bill / Inventory / More (PRD §8)
- [x] Home Dashboard screen (PRD §9 wireframe, §6.10 subset) — revenue/expenses/profit/jobs-pending cards + low-stock banner, reading live from Dexie; full 12-metric §6.10 set (cash/UPI split, top mechanic, etc.) deliberately deferred, not forgotten
- [x] New Bill screen (PRD §9 wireframe, §6.3, §6.7 subset) — customer search-or-create, vehicle lookup (informational only, see Blockers), quick services from seeded catalog + custom line items with save-to-catalog, parts (empty-state honest about no inventory yet), discount/tax, payment method, saves invoice + line items + payment to Dexie. PDF generation/Share Sheet NOT built — that's the separate checklist item below.
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
- **New Bill records payment inline, not as a separate step.** Phase 0's checklist has no dedicated Payments screen (§6.8 describes one conceptually but it's never listed as a Phase 0 task), so task 5 made New Bill collect payment method (Cash/UPI/Card/Credit) at save time rather than leaving invoices unpaid until a later screen. If real usage at the garage doesn't match this (e.g. bills are often created before payment is known), this needs a real Payments step added, not just a tweak.
- **Vehicle is not linked to the invoice.** The `invoices` table has no `vehicle_id` column (only `jobs` does, per §11) and Job Card doesn't exist yet, so New Bill's vehicle search is a lookup convenience only (helps find the right customer) — it doesn't persist which vehicle a given bill was for. This resolves itself once Job Card exists and New Bill can optionally start from a job, but until then a bill's vehicle isn't recoverable from the invoice alone.

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
- `index.html` — New Bill screen markup (customer/vehicle, quick services + custom, parts, line items, discount/tax, payment, saved confirmation)
- `js/app.js` — New Bill state/methods (catalog seeding, customer/vehicle search-or-create, line items, `saveBill()`); also fixed a Revenue calc bug from task 4 (was counting 'credit' payments as revenue — now excluded)

---

## Session Log

*(one line per session, oldest first — append, never delete)*

- Session 0 — checkpoint file created, no code written yet.
- Session 1 — Phase 0 task 1 complete: PWA shell scaffolded (index.html, manifest, service worker, css, Alpine app controller, Dexie stub, placeholder icons). Next: Dexie schema.
- Session 2 — Phase 0 task 2 complete: Dexie schema defined for all 13 tables in `js/db.js`. Retroactively checked off "bottom nav shell" since it shipped inside task 1's commit. Next: Home Dashboard screen.
- Session 3 — Phase 0 task 4 complete: Home Dashboard built (revenue/expenses/profit/jobs-pending cards, low-stock banner, day-1 empty state), reading live from Dexie. Locked in ISO-string timestamp convention for future tasks. Next: New Bill screen — will need a starter service catalog seeded first, flagged in Next Task.
- Session 4 — Phase 0 task 5 complete: New Bill screen built end-to-end (customer/vehicle, quick services + custom w/ save-to-catalog, parts, discount/tax, payment method, saves invoice+line items+payment to Dexie). Seeded starter service catalog per §4.1. Fixed a Revenue bug from session 3 (credit payments were counting as revenue). Flagged two real product decisions in Blockers (inline payment step, vehicle not linked to invoice) rather than guessing. Next: Job Card screen.
