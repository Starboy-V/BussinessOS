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

1. **Create a private GitHub repo** for this project (a couple minutes, free).
2. **Build with Claude Code**, not claude.ai chat, for the actual multi-day
   build. Claude Code runs against a real local (or cloud) working directory
   with your own git credentials already configured — so commits and pushes
   just work, and nothing sensitive needs to be pasted into a chat window.
   *(If you'd rather stay in claude.ai chat: Claude's sandbox here can also
   reach github.com directly, but you'd need to hand it a GitHub token each
   session, which is worth avoiding if Claude Code is an option.)*
3. Every session — regardless of account — starts with the ritual below.
4. Every session ends by committing and pushing, even if the task isn't
   finished — a half-done task with an honest note in `BUILD_PROGRESS.md`
   beats an uncommitted task that vanishes with the session.

---

## Start-of-session ritual (non-negotiable, every session)

1. `git pull` — get the latest state, don't assume you remember it.
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
  code + `BUILD_PROGRESS.md` together, in the same commit.
- If something forces a decision not already covered in the PRD or the
  "Decisions Already Locked In" list, write it into "Blockers / Open
  Questions For The Human" rather than guessing — that section exists so a
  human-only decision doesn't get silently made by whichever session happens
  to hit it first.

## End-of-session ritual

- Commit and push, even mid-task — update "Next Task" to say precisely where
  it was left off (e.g. "Dexie schema written, jobs table done, inventory
  table not started yet") rather than a vague "in progress."
- Add one line to the Session Log.

---

## The actual prompt — paste this as the first message of any new session

```
You're continuing an existing build of BusinessOS, a garage-management PWA.
The full spec is in BusinessOS_PRD.md in this repo — read it before writing
any code if you haven't already. Do not re-derive architecture decisions;
they're already made and documented in §3–§15 of the PRD.

Before doing anything else:
1. Read BUILD_PROGRESS.md in full.
2. Run `git log --oneline -10` to see recent history.
3. Resume from the "Next Task" line. Don't restart, don't skip ahead.

Work in small units matching the Phase 0 checklist in BUILD_PROGRESS.md.
After each unit: update the checklist and "Next Task," then commit code and
BUILD_PROGRESS.md together in one commit. If you hit a decision not already
covered in the PRD or the "Decisions Already Locked In" list, write it to
"Blockers / Open Questions For The Human" instead of guessing.

At the end of this session, whatever the reason it ends, make sure the last
commit leaves BUILD_PROGRESS.md accurate enough that a different Claude
session, on a different account, with zero memory of this conversation,
could read it and continue correctly.
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
