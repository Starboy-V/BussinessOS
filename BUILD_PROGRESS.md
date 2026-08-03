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
| **Last session ended because** | task complete, stopping point reached cleanly — see Session Log. This session ran in claude.ai chat with a user-provided GitHub token (the fallback path noted in BUILD_EXECUTION_PROMPT.md), so it pushed to `origin` directly — no pending-push state this time. Confirmed clean by cloning fresh from `origin` at session start rather than trusting the previous session's note. |

---

## Current Phase

**Phase 0 — "Prove the Workflow"** (PRD §3) — offline single-business PWA, no backend.

## Status: IN PROGRESS

---

## Next Task (start here)

8. Build the Inventory screens (PRD §6.6) — two views, **Local Stock** (on-shelf, with negative-stock items visibly flagged red per §9) and **Ordered Parts** (in transit from supplier, expected delivery date, received/not-received toggle). The important part isn't the UI, it's the rule: using a part in a bill must **atomically** decrement `inventory_items.current_stock`, and recording a purchase must **atomically** increment stock **and** create an `expenses` row in the same transaction — §6.6 calls this out as the single most valuable "enter once, updates everywhere" moment in the product, so don't build it as two separate manual steps. Note New Bill's `addPartToBill()` currently does NOT touch inventory at all (flagged in its own code comment) — wiring that up is part of this task, not a separate one. Use Dexie's `db.transaction(...)` for the atomic stock+expense write, matching §7's "every financial write must be atomic" NFR.

*(Whoever — or whatever session — picks this up next: do this one task, update the checklist and this "Next Task" line, commit, then stop and reassess. Don't chain multiple unrelated tasks in one uncommitted block of work.)*

---

## Phase 0 Task Checklist

Each box maps to a PRD section — check the section before marking done, don't rely on memory of what "should" be there.

- [x] Repo scaffolding: `index.html`, `manifest.json`, service worker, Dexie.js wired up
- [x] Dexie schema mirrors PRD §11 tables (single-business subset, no `business_id` yet): `customers`, `vehicles`, `service_catalog`, `jobs`, `job_line_items`, `job_photos`, `inventory_items`, `inventory_transactions`, `invoices`, `invoice_line_items`, `payments`, `expenses`, `expense_categories`
- [x] Bottom nav shell — Home / Jobs / Bill / Inventory / More (PRD §8) — *shipped as part of task 1's commit, not its own; checked off here retroactively rather than leaving it stale. (Housekeeping: this task previously had a stray duplicate unchecked line right below it from an earlier session — removed in the Job Card session, since it wasn't a real remaining task, just a leftover copy-paste.)*
- [x] Home Dashboard screen (PRD §9 wireframe, §6.10 subset) — revenue/expenses/profit/jobs-pending cards + low-stock banner, reading live from Dexie; full 12-metric §6.10 set (cash/UPI split, top mechanic, etc.) deliberately deferred, not forgotten
- [x] New Bill screen (PRD §9 wireframe, §6.3, §6.7 subset) — customer search-or-create, vehicle lookup (informational only, see Blockers), quick services from seeded catalog + custom line items with save-to-catalog, parts (empty-state honest about no inventory yet), discount/tax, payment method, saves invoice + line items + payment to Dexie. PDF generation/Share Sheet NOT built — that's the separate checklist item below.
- [x] Job Card screen (PRD §9 wireframe, §6.5) — Jobs list (new, needed as an entry point — didn't exist before), New Job creation (customer/vehicle search-or-create, complaint, mechanic), status stepper (Pending → In Progress → Completed → Delivered, tap "Mark as X" to advance) + separate Cancel action, photo capture (intake/completion, uncompressed — see Blockers), mechanic field, notes (append-only timestamped log). job_line_items NOT touched — "bill from this job" is still a future task, noted in Next Task.
- [x] Customer/Vehicle profile screen (PRD §6.4) — reached via the "More" tab (per §8's nav spec, which already answers the placement question the previous session's Next Task line left open). Search by plate/phone/name, ranked exact plate > exact phone > name fuzzy per §9, plus a 4th "partial match" tier below those three for convenience. Profile shows vehicles, jobs (tapping one jumps into the existing Job Card detail view rather than re-rendering it), and invoices+payments in one scroll. Uses the §6.7 "Invoice pending sync" label for unsynced invoices rather than showing a fabricated number.
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
- **Vehicle is not linked to the invoice.** The `invoices` table has no `vehicle_id` column (only `jobs` does, per §11) and Job Card doesn't exist yet, so New Bill's vehicle search is a lookup convenience only (helps find the right customer) — it doesn't persist which vehicle a given bill was for. This resolves itself once Job Card exists and New Bill can optionally start from a job, but until then a bill's vehicle isn't recoverable from the invoice alone. *(Job Card now exists as of this session — the "bill from this job" path itself still isn't built; see Next Task.)*
- **Mechanic is freeform text, not a real worker reference.** §11's `jobs.assigned_worker_id` is a uuid pointing at `profiles`, but Phase 0 has no Workers/Permissions table at all (§6.11 is Phase 1+). Job Card stores the mechanic's name as a plain string in `custom_fields.mechanic_name` instead, with a datalist of previously-typed names for convenience. This will need a real migration once Phase 1's worker accounts exist — free-text names won't reliably match worker records (typos, nicknames), so this is a human decision point when Phase 1 starts, not a mechanical find-replace.
- **Mechanic reassignment overwrites, doesn't keep history.** §6.5's edge case explicitly wants "job reassigned mid-repair — history keeps both mechanics' involvement rather than overwriting." Job Card's `updateJobMechanic()` currently just overwrites `custom_fields.mechanic_name`. Fine for a single-mechanic-per-job garage's day-to-day use; would need a small array instead of a single string if reassignment tracking actually matters to the pilot garage.
- **Job status changes have no "who," only "when."** §6.5 wants status changes "timestamped and attributed (who, when)." Phase 0 has no auth (per Decisions Locked In), so `custom_fields.status_history` on each job only records `{status, at}` — no actor. Not fixable without inventing a fake identity system ahead of Phase 1's real one, so left as-is.
- **Vehicle ownership transfer (§6.4) isn't implemented.** §6.4's rule: "a vehicle belongs to exactly one customer at a time, but ownership can transfer (used-vehicle sale) without losing service history — transfer creates an audit trail entry, not a new vehicle record." Phase 0 has no transfer UI and no audit-trail table for it — a vehicle's `customer_id` is simply whatever it was set to at creation. The Customer/Vehicle Profile screen (task 7) shows "every vehicle currently pointing at this customer_id," which is correct today but silently has nothing to show if a transfer ever happened, since none can happen yet. Not needed for a Phase 0 pilot at one garage (used-vehicle resale crossing the *same* garage's records is a narrow case), but worth having a real answer before Phase 1.
- **Job numbers (`Job #0231` in the wireframe) aren't real, persisted identifiers.** Unlike invoices (`invoice_number`, assigned by a row-locked counter per §6.7), §11's `jobs` table has no equivalent counter column. The Job Card header currently shows a number computed locally from creation order each time the jobs list loads — cosmetic only, not stored, and would need a real counter (like invoices got) before jobs are ever synced or merged across devices in Phase 1.

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
- `index.html` — Jobs tab markup: list view, New Job form (customer/vehicle search-or-create, complaint, mechanic), Job Card detail view (status stepper, photo capture sections ×2, mechanic field, notes)
- `js/app.js` — `JOB_STATUS_ORDER`/`JOB_STATUS_LABELS` constants; full Jobs/Job Card state block; `loadJobsList()`, `openJobDetail()`/`backToJobsList()`, `advanceJobStatus()`/`cancelJob()`/`setJobStatus()`, `onPhotoSelected()`/`refreshJobPhotos()`, `updateJobMechanic()`, `addJobNote()`, plus a job-prefixed duplicate of New Bill's customer/vehicle search-or-create methods (flagged as a refactor candidate, not done yet — see method comment in `saveNewJobCustomer`'s neighborhood)
- `css/style.css` — new "Jobs / Job Card" section: job list rows + status badges, status stepper, photo grid/thumbnails, notes list
- `index.html` — More tab: Customer/Vehicle Profile search view + profile view (vehicles/jobs/invoices+payments sections). No new CSS classes needed — reuses `bill-section`/`bill-result-list`/`jobs-list`/`job-detail-header` etc. from earlier tasks, which is why `css/style.css` isn't listed again below.
- `js/app.js` — `moreView` state + `openMoreScreen()`, `searchCustomerProfile()` (ranked search, separate from Bill/Job's search-or-create pattern), `openCustomerProfile()`, `backToCustomerSearch()`, `profileVehicleNumber()`, `openJobFromProfile()` (jumps into the existing Job Card detail rather than duplicating it), `invoiceStatusLabel()`

---

## Session Log

*(one line per session, oldest first — append, never delete)*

- Session 0 — checkpoint file created, no code written yet.
- Session 1 — Phase 0 task 1 complete: PWA shell scaffolded (index.html, manifest, service worker, css, Alpine app controller, Dexie stub, placeholder icons). Next: Dexie schema.
- Session 2 — Phase 0 task 2 complete: Dexie schema defined for all 13 tables in `js/db.js`. Retroactively checked off "bottom nav shell" since it shipped inside task 1's commit. Next: Home Dashboard screen.
- Session 3 — Phase 0 task 4 complete: Home Dashboard built (revenue/expenses/profit/jobs-pending cards, low-stock banner, day-1 empty state), reading live from Dexie. Locked in ISO-string timestamp convention for future tasks. Next: New Bill screen — will need a starter service catalog seeded first, flagged in Next Task.
- Session 4 — Phase 0 task 5 complete: New Bill screen built end-to-end (customer/vehicle, quick services + custom w/ save-to-catalog, parts, discount/tax, payment method, saves invoice+line items+payment to Dexie). Seeded starter service catalog per §4.1. Fixed a Revenue bug from session 3 (credit payments were counting as revenue). Flagged two real product decisions in Blockers (inline payment step, vehicle not linked to invoice) rather than guessing. Next: Job Card screen.
- Session 5 — Phase 0 task 6 complete: Job Card screen built (list + New Job creation + detail), since none of that existed yet to reach a job from. Status stepper (tap "Mark as X" to advance) + separate Cancel action, photo capture for intake/completion (uncompressed, per plan), mechanic field (freeform, no Workers table yet), append-only notes log. Used `custom_fields.status_history` for lightweight status timestamps rather than a new table. Flagged four real product decisions in Blockers (mechanic-as-text vs. worker reference, no reassignment history, no "who" on status changes, cosmetic-only job numbers) rather than guessing. Also fixed a stray duplicate checklist line left from an earlier session (bottom nav was listed twice, once checked once not). Ran this session in claude.ai chat (no Claude Code, no git push credentials in the sandbox) — see Meta note re: push status. Next: Customer/Vehicle profile screen.
- Session 6 — Phase 0 task 7 complete: Customer/Vehicle Profile screen built under the "More" tab (§8 already specified this placement — the previous session's Next Task line treated it as an open question, it wasn't one once §8 was checked). Ranked search (exact plate > exact phone > name fuzzy per §9, plus a partial-match 4th tier for convenience) opens a profile showing vehicles, jobs (tapping jumps into the existing Job Card detail view instead of a second renderer), and invoices+payments in one scroll, using the §6.7 "Invoice pending sync" label since Phase 0 never assigns real invoice numbers. Verified the ranking logic against sample data before wiring it into the UI. Flagged one new real gap in Blockers (§6.4's vehicle-ownership-transfer audit trail isn't implemented) rather than quietly ignoring it. No new CSS was needed — reused existing component classes throughout. Ran in claude.ai chat with a user-supplied GitHub token (per BUILD_EXECUTION_PROMPT.md's chat fallback), so this session pushed to `origin` directly. Next: Inventory screens (Local Stock + Ordered Parts, with the atomic stock↔expense link on billing/purchase).
