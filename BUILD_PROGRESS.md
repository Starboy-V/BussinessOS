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
| **Repo** | (fill in: your GitHub repo URL once created) |
| **Last updated** | (ISO timestamp) |
| **Last session ended because** | (e.g. "task complete" / "hit usage limit mid-task" / "human paused") |

---

## Current Phase

**Phase 0 — "Prove the Workflow"** (PRD §3) — offline single-business PWA, no backend.

## Status: NOT STARTED

---

## Next Task (start here)

1. Scaffold the project: `index.html`, `manifest.json`, service worker registration, Dexie.js installed and initialized with the schema below.

*(Whoever — or whatever session — picks this up next: do this one task, update the checklist and this "Next Task" line, commit, then stop and reassess. Don't chain multiple unrelated tasks in one uncommitted block of work.)*

---

## Phase 0 Task Checklist

Each box maps to a PRD section — check the section before marking done, don't rely on memory of what "should" be there.

- [ ] Repo scaffolding: `index.html`, `manifest.json`, service worker, Dexie.js wired up
- [ ] Dexie schema mirrors PRD §11 tables (single-business subset, no `business_id` yet): `customers`, `vehicles`, `service_catalog`, `jobs`, `job_line_items`, `job_photos`, `inventory_items`, `inventory_transactions`, `invoices`, `invoice_line_items`, `payments`, `expenses`, `expense_categories`
- [ ] Bottom nav shell — Home / Jobs / Bill / Inventory / More (PRD §8)
- [ ] Home Dashboard screen (PRD §9 wireframe, §6.10 metrics)
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

If a task seems to require reopening one of these, stop and flag it below instead of silently deciding differently.

---

## Blockers / Open Questions For The Human

*(nothing yet — add here anything that needs a decision only the founder can make, e.g. PRD §20's open questions)*

---

## Files Created So Far

*(nothing yet — list paths as they're created, so a new session can orient without re-reading every file)*

---

## Session Log

*(one line per session, oldest first — append, never delete)*

- Session 0 — checkpoint file created, no code written yet.
