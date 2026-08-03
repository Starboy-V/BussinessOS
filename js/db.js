// Dexie is wired up here so later tasks don't need to re-plumb the library.
// The real schema (PRD §11 tables) is deliberately NOT defined yet — that's
// the next checklist item in BUILD_PROGRESS.md, kept separate so this commit
// stays a single, reviewable unit of work.

const db = new Dexie('BusinessOS');
// db.version(1).stores({ ... });  <- next task fills this in

window.db = db;
