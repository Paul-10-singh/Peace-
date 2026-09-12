/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Per-user GLOBAL playlist store backed by SQLite (better-sqlite3).
 *
 * unlike the per-server playlists (data/playlists.json), a user's "playlist"
 * follows them across every guild. Schema mirrors the build spec:
 *   users(user_id PRIMARY KEY)
 *   playlist_tracks(id PK AUTOINCREMENT, user_id, title, url, duration, added_at)
 * A UNIQUE(user_id, url) constraint makes duplicate likes a no-op.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'music.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    duration TEXT,
    added_at INTEGER NOT NULL,
    UNIQUE(user_id, url)
  );
  CREATE INDEX IF NOT EXISTS idx_pl_user ON playlist_tracks(user_id);
`);

const insertUser = db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)');
const insertTrack = db.prepare(
  `INSERT OR IGNORE INTO playlist_tracks (user_id, title, url, duration, added_at)
   VALUES (@user_id, @title, @url, @duration, @added_at)`
);
const removeByUrl = db.prepare('DELETE FROM playlist_tracks WHERE user_id = ? AND url = ?');
const removeById = db.prepare('DELETE FROM playlist_tracks WHERE user_id = ? AND id = ?');
const listTracks = db.prepare(
  'SELECT id, title, url, duration, added_at FROM playlist_tracks WHERE user_id = ? ORDER BY id ASC'
);
const isTrack = db.prepare('SELECT 1 FROM playlist_tracks WHERE user_id = ? AND url = ?');

/** Ensure a user row exists (idempotent). */
function ensureUser(userId) {
  insertUser.run(String(userId));
}

/**
 * Add a track to a user's global playlist. Duplicate (same url) => no-op.
 * Returns { ok: true, duplicate: boolean }
 */
function addTrack(userId, track) {
  ensureUser(userId);
  const url = String(track.url || '');
  if (!url) return { ok: false, error: 'missing url' };
  const dup = !!isTrack.get(String(userId), url);
  const info = insertTrack.run({
    user_id: String(userId),
    title: String(track.title || 'Untitled'),
    url,
    duration: track.duration ? String(track.duration) : null,
    added_at: Date.now(),
  });
  return { ok: info.changes > 0, duplicate: dup };
}

/** Remove a track by raw url or by playlist position (1-based). Returns removed row count. */
function removeTrack(userId, ref) {
  ensureUser(userId);
  const u = String(userId);
  if (isFinite(ref)) {
    // position reference: re-map 1-based index to the stored id of that row
    const rows = listTracks.all(u);
    const target = rows[Number(ref) - 1];
    if (!target) return 0;
    return removeById.run(u, target.id).changes;
  }
  return removeByUrl.run(u, String(ref)).changes;
}

/** List a user's playlist tracks in insertion order. */
function list(userId) {
  ensureUser(userId);
  return listTracks.all(String(userId));
}

/** Total count for a user. */
function count(userId) {
  ensureUser(userId);
  return listTracks.all(String(userId)).length;
}

module.exports = { addTrack, removeTrack, list, count, ensureUser };
