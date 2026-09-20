/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 5 : JOINER FINGERPRINTING + RAID SCORE.
 *
 * Each joiner is fingerprinted across cheap, stateless signals:
 *   - account age (days since creation)
 *   - default avatar (no custom avatar => freshly-minted account tell)
 *   - username entropy (Shannon) — bot-farm usernames cluster low entropy
 *   - invite code used (fresh/boosted invites vs. long-lived vanities)
 *   - join timing gap (joins huddled together => coordinated raid)
 *
 * Raid score = weighted sum in [0,1]; > 0.7 triggers auto-lockdown + ping.
 * Thresholds are per-guild configurable via /antiraid panel (antiRaid config).
 */
const { get } = require('../../utils/settings');

function shannonEntropy(str) {
  if (!str) return 0;
  const freq = new Map();
  for (const ch of String(str).toLowerCase()) freq.set(ch, (freq.get(ch) || 0) + 1);
  const len = str.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function accountAgeMs(user) {
  return user?.createdTimestamp ? Date.now() - user.createdTimestamp : null;
}

function accountAgeDays(user) {
  const ms = accountAgeMs(user);
  return ms == null ? null : ms / 86_400_000;
}

/** Discord default avatars are the 6 hashed "blurple" ones — new-alt tell. */
function isDefaultAvatar(user) {
  return user?.avatar == null;
}

/**
 * Build a feature vector for a joining member.
 * ctx = { user, guildId, inviteCode?, joinedAt, lastJoinAt? }
 */
function fingerprint(ctx = {}) {
  const { user, joinedAt = Date.now(), lastJoinAt = null } = ctx;
  const ageDays = accountAgeDays(user);
  return {
    accountAgeDays: ageDays,
    accountAgeBucketed: ageDays == null ? 1.0 : clamp01(1 - Math.log2(ageDays + 1) / 12), // <1d -> ~1.0, 1y -> ~0.15
    defaultAvatar: isDefaultAvatar(user),
    username: user?.username || '',
    usernameEntropy: shannonEntropy(user?.username || ''),
    entropyScore: clamp01(1 - shannonEntropy(user?.username || '') / 4), // very low entropy => near 1.0
    inviteCode: ctx.inviteCode || null,
    joinGapMs: lastJoinAt ? joinedAt - lastJoinAt : null,
    joinedByInvite: !!ctx.inviteCode,
  };
}

/** Weighted 0..1 raid score from a feature vector + per-guild config. */
function raidScore(features, cfg = {}) {
  const w = cfg.weights || {};
  const weights = {
    accountAgeBucketed: w.accountAge ?? 0.25,
    defaultAvatar: w.defaultAvatar ?? 0.15,
    entropyScore: w.entropy ?? 0.2,
    joinGap: w.joinGap ?? 0.25,
    inviteFreshness: w.invite ?? 0.15,
  };

  let score = 0;
  const debug = {};

  score += weights.accountAgeBucketed * features.accountAgeBucketed;
  debug.age = features.accountAgeBucketed;

  if (features.defaultAvatar) score += weights.defaultAvatar;
  debug.defaultAvatar = features.defaultAvatar ? 1 : 0;

  score += weights.entropyScore * features.entropyScore;
  debug.entropy = features.entropyScore;

  // huddled joins: gap < 3s between consecutive joins is near-universal in raids
  const gapScore = features.joinGapMs != null ? clamp01(1 - features.joinGapMs / 3000) : 0.5;
  score += weights.joinGap * gapScore;
  debug.joinGap = gapScore;

  // invite via a link that gets recycled every join is typical raid bait
  score += weights.inviteFreshness * (features.joinedByInvite ? 1 : 0.2);
  debug.invite = features.joinedByInvite ? 1 : 0.2;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return { score: clamp01(score / total), debug };
}

/** Classify a fresh join; returns { score, features, verdict }. */
function classify(member, ctx = {}) {
  const features = fingerprint({ user: member?.user || member, ...ctx });
  const cfg = get(member?.guild?.id, 'security')?.antiRaid || {};
  const { score, debug } = raidScore(features, cfg);
  const threshold = cfg.threshold ?? 0.7;
  return {
    score: Number(score.toFixed(3)),
    verdict: score > threshold ? 'raid' : score > threshold / 2 ? 'suspicious' : 'normal',
    threshold,
    features,
    debug,
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** In-memory join gap tracker: maintains last-join timestamp per guild. */
const lastJoin = new Map(); // guildId -> ts

function trackGap(guildId, now = Date.now()) {
  const prev = lastJoin.get(guildId) || null;
  lastJoin.set(guildId, now);
  return prev;
}

function disable() { lastJoin.clear(); }

module.exports = { fingerprint, raidScore, classify, trackGap, shannonEntropy, accountAgeDays, isDefaultAvatar, disable, lastJoin };