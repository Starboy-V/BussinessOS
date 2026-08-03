# Build Execution & Resume Protocol — BusinessOS

## What problem this solves

Claude has no memory between separate chats, and none at all between different
Anthropic accounts. So "resume the build if I hit a limit and switch accounts"
can't be solved *inside* Claude — there's nothing for a new session to
remember. It has to be solved *outside* Claude, in something that persists
regardless of which account or which chat opens next.

That something is a **git repository you own** (GitHub — a domain Claude's
tools can already reach). The repo, plus the `BUILD_PROGRESS.md` checkpoint
file inside it, becomes the shared state. Any Claude session — this one,
a fresh one, one on a different account — that can see that repo can pick up
exactly where the last one stopped, because the state lives in commits and a
checkpoint file, not in any session's memory.

**One honest limitation:** Claude can't detect its own usage limit in advance
and fire a save at the exact right instant — a hard cutoff just ends the
response mid-stream, with no warning. The fix isn't a promise that a save
will always land — it's making the worst case cheap: commit after every small
completed task, not just at the end of a session. If a cutoff happens
mid-task, you lose at most that one task, never the whole session.

---

## The mechanism, concretely

1. **Create a private (or public) GitHub repo** for this project — already done: `Starboy-V/BussinessOS`.
2. **Pick a build environment.** Two options, both work with the same
   `BUILD_PROGRESS.md` checkpoint:

   - **Claude Code** (needs Pro/Max/Team/Enterprise/Console — not available
     on the free plan) — runs against a real local clone with your own git
     credentials already configured, so commits and pushes just happen.
   - **claude.ai chat** (works on the **free plan** — code execution and
     file creation are available at every tier, only Claude Code itself is
     paid-only) — Claude can still `git clone` the public repo directly
     (no credentials needed to *read* a public repo) and do the work, but
     can't `git push` back without something authorizing it. See "Syncing
     back to GitHub" below for the two ways to close that gap.

3. Every session — regardless of account or which of the two above — starts
   with the ritual below.
4. Every session ends with progress recorded somewhere durable: a real commit
   (if push access exists) or files handed back for you to add to the repo
   yourself (if it doesn't) — either way, `BUILD_PROGRESS.md` must be
   accurate before the session ends.

---

## Syncing back to GitHub without Claude Code

Since chat sessions can't push on their own, pick one:

**Option A — Manual upload (zero credentials, a bit more hands-on).**
At the end of each session, Claude hands you the new/changed files. Go to
the repo on GitHub → **Add file → Upload files** → drag them in → commit.
GitHub's uploader accepts multiple files (and preserves folder structure if
you drag a folder) in one commit. Takes under a minute per session.

**Option B — Scoped token (more automated, small tradeoff).**
Create a **fine-grained GitHub Personal Access Token** scoped to *only* this
one repo, with **Contents: Read and write** permission and nothing else
(Settings → Developer settings → Personal access tokens → Fine-grained →
select "Only select repositories" → `BussinessOS`). Paste it into the chat
when you want that session to push directly. Because it's scoped to one
repo and one permission, the blast radius if it ever leaked is small, and
you can revoke or regenerate it from GitHub any time — including right
after each session, if you want to be extra careful.

Either way works with the same checkpoint file — Option A just means you're
the one doing the final `git add / commit`, instead of Claude.

---

## Start-of-session ritual (non-negotiable, every session)

1. Get the current state: `git pull` if a local clone already exists
   (Claude Code), or `git clone https://github.com/Starboy-V/BussinessOS.git`
   fresh (chat sessions start with nothing on disk every time).
2. Read `BUILD_PROGRESS.md` top to bottom.
3. Run `git log --oneline -10` — the last few commits say what actually
   happened, which is more reliable than any summary.
4. Resume from the **"Next Task"** line in `BUILD_PROGRESS.md`. Don't restart
   from scratch, don't re-derive decisions already recorded under "Decisions
   Already Locked In," and don't second-guess them without flagging it first.

## During the session

- Work in small, committable units. A "unit" is roughly one checklist item
  from `BUILD_PROGRESS.md` — one screen, one schema piece, one function.
- After finishing a unit: update the checklist, update "Next Task," commit
  code + `BUILD_PROGRESS.md` together, in the same commit (Claude Code), or
  bundle the changed files together ready to hand over (chat, Option A) —
  either way, treat that unit as the save point.
- If something forces a decision not already covered in the PRD or the
  "Decisions Already Locked In" list, write it into "Blockers / Open
  Questions For The Human" rather than guessing — that section exists so a
  human-only decision doesn't get silently made by whichever session happens
  to hit it first.

## End-of-session ritual

- **Claude Code, or chat with a token (Option B):** commit and push, even
  mid-task — update "Next Task" to say precisely where it was left off (e.g.
  "Dexie schema written, jobs table done, inventory table not started yet")
  rather than a vague "in progress."
- **Chat without a token (Option A):** present every new/changed file,
  including the updated `BUILD_PROGRESS.md`, clearly enough that uploading
  them to GitHub takes one pass — don't make the human hunt for what changed.
- Add one line to the Session Log either way.

---

## The actual prompt — paste this as the first message of any new session

```
You're continuing an existing build of BusinessOS, a garage-management PWA.
The repo is https://github.com/Starboy-V/BussinessOS — if it's not already
on disk, clone it first. The full spec is in BusinessOS_PRD.md in that repo
— read it before writing any code if you haven't already. Do not re-derive
architecture decisions; they're already made and documented in §3–§15 of
the PRD.

Before doing anything else:
1. Get the repo (clone fresh, or pull if it's already checked out).
2. Read BUILD_PROGRESS.md in full.
3. Run `git log --oneline -10` to see recent history.
4. Resume from the "Next Task" line. Don't restart, don't skip ahead.

Work in small units matching the Phase 0 checklist in BUILD_PROGRESS.md.
After each unit: update the checklist and "Next Task." If you have push
access (a configured git remote, or a token I've given you), commit code and
BUILD_PROGRESS.md together in one commit. If you don't, hand me back the
new/changed files — including the updated BUILD_PROGRESS.md — clearly enough
that I can upload them to GitHub myself in one pass. If you hit a decision
not already covered in the PRD or the "Decisions Already Locked In" list,
write it to "Blockers / Open Questions For The Human" instead of guessing.

At the end of this session, whatever the reason it ends, make sure
BUILD_PROGRESS.md — once it's back in the repo — is accurate enough that a
different Claude session, on a different account, with zero memory of this
conversation, could read it and continue correctly.
```

---

## Why this specific design (so it isn't a black box)

- **The checkpoint file, not chat history, is authoritative.** Chat summaries
  drift and compress; a maintained file doesn't.
- **Commits are the actual save points**, not the checkpoint file alone —
  the file describes state, the commits are the state.
- **"Decisions Already Locked In" exists** because a fresh session with no
  memory of *why* Cloudflare Pages was picked over Netlify, say, will
  sometimes want to "improve" a settled call. Recording the decision once
  stops that from being relitigated every session.
- **Small commit units** cap the cost of a bad cutoff at one task, not one
  session — this is the actual answer to "what if the limit hits mid-work,"
  not a mechanism that detects the limit, because no such detection exists.
