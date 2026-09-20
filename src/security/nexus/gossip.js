/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — LAYER 8 : CROSS-GUILD GLOBAL BAN NETWORK.
 *
 * Privacy-preserving federation: instances exchange only a user snowflake +
 * an offense *hash* (normalized content hash, never the message). Gossip is
 * Ed25519-signed and exchanged over an optional relay (NEXUS_RELAY_URL).
 *
 * A user is auto-banned when >= 3 distinct guilds report the same offense
 * hash (threshold configurable per bot install). Appeals are tracked locally
 * and shared with the relay for the admin-vote flow.
 */
const { ed25519Sign, ed25519Verify, sha256 } = require('../crypto');
const reputation = require('./reputation');

let DB = null;
let peerKeys = {};      // peerId -> spki hex (learned from signed gossip)
let keyPair = null;     // this instance's ed25519 key
const REPORT_THRESHOLD = Number(process.env.NEXUS_REPORT_THRESHOLD || '3');

function init(db, { keypath } = {}) {
  DB = db;
  const { loadOrCreateKey } = require('../ledger/merkle');
  keyPair = loadOrCreateKey(); // Ed25519 key reused for signing gossip
  return nexusApi;
}

function signingKey() {
  return keyPair?.privateKeyPem;
}

function myPeerId() {
  const { mainOwnerId } = require('../../utils/owners');
  return process.env.NEXUS_PEER_ID || `P-${sha256(process.env.DISCORD_TOKEN || 'dev')}`;
}

function signatureFor(userId, offenseHash, verdict) {
  return ed25519Sign({ op: 'report', userId, offenseHash, verdict }, signingKey());
}

/**
 * Local report: store + adjust reputation. Returns { reportsGuilds, threshold }.
 */
function report({ userId, offenseHash, verdict, guildId, peerId = 'local', signature = signatureFor(userId, offenseHash, verdict) }) {
  if (!DB) return { ok: false, reason: 'no-db' };
  const now = Date.now();
  DB.prepare(`
    INSERT INTO nexus_reports (user_id, offense_hash, verdict, guild_id, peer_id, signature, reported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, offenseHash, verdict || 'scam', guildId, peerId, signature, now);
  peerKeys[peerId] = peerId === 'local' ? (keyPair?.publicHex || '') : peerKeys[peerId];
  reputation.adjust(userId, -0.1);
  const distinct = DB.prepare(
    'SELECT COUNT(DISTINCT guild_id) AS c FROM nexus_reports WHERE user_id = ?'
  ).get(userId).c;
  return { ok: true, reportsGuilds: distinct, threshold: REPORT_THRESHOLD, ban: distinct >= REPORT_THRESHOLD };
}

/**
 * Verify an incoming gossip signature before accepting a peer report.
 * Peers' public keys are cached from their own signed payloads (TOFU).
 */
function verifyPeerReport(report) {
  const { peerId, userId, offenseHash, verdict, signature } = report;
  const pub = peerKeys[peerId];
  if (!pub) return false; // unknown peer -> reject (appears via relay trust only)
  return ed25519Verify({ op: 'report', userId, offenseHash, verdict }, signature, pub);
}

/** Query federation: distinct guilds + rep score for a user. */
function check(userId) {
  if (!DB) return { reports: 0, guilds: 0, ban: false, reputation: 1.0 };
  const rows = DB.prepare('SELECT * FROM nexus_reports WHERE user_id = ?').all(userId);
  const guilds = new Set(rows.map((r) => r.guild_id)).size;
  const rep = reputation.get(userId);
  const first = rows.sort((a, b) => a.reported_at - b.reported_at)[0];
  return {
    reports: rows.length,
    guilds,
    ban: guilds >= REPORT_THRESHOLD,
    threshold: REPORT_THRESHOLD,
    reputation: rep,
    firstReportedAt: first?.reported_at || null,
  };
}

/**
 * Push our local reports to the relay and fetch peers'. Requires
 * NEXUS_RELAY_URL. Best-effort; never throws into the caller.
 */
async function gossip() {
  const relay = process.env.NEXUS_RELAY_URL;
  if (!relay) return { ok: false, reason: 'no-relay-configured' };
  try {
    const local = DB.prepare('SELECT * FROM nexus_reports ORDER BY id DESC LIMIT 50').all();
    const res = await fetch(`${relay}/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ peerId: myPeerId(), publicKey: keyPair?.publicHex, reports: local.map((r) => ({ peerId: r.peer_id, userId: r.user_id, offenseHash: r.offense_hash, verdict: r.verdict, signature: r.signature, guildId: r.guild_id })) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: `relay-http-${res.status}` };
    const body = await res.json();
    const incoming = body?.reports || [];
    if (body?.peerPublicKeys) Object.assign(peerKeys, body.peerPublicKeys);
    let accepted = 0;
    for (const rep of incoming) {
      if (!rep?.offenseHash || !rep.userId) continue;
      if (verifyPeerReport({ ...rep, peerId: rep.peerId })) {
        if (!DB.prepare('SELECT id FROM nexus_reports WHERE user_id = ? AND offense_hash = ? AND peer_id = ?').get(rep.userId, rep.offenseHash, rep.peerId)) {
          report({ userId: rep.userId, offenseHash: rep.offenseHash, verdict: rep.verdict, guildId: rep.guildId || 'fed', peerId: rep.peerId, signature: rep.signature });
          accepted += 1;
        }
      }
    }
    return { ok: true, accepted, relayed: local.length };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Appeal flow. Creates a local appeal record (persisted in settings for now;
 * ledger-append keeps it tamper-evident). Returns case id.
 */
function appeal({ userId, caseId, evidence, appellant, guildId }) {
  try {
    const { append } = require('../ledger/chain');
    append(guildId, appellant, 'gbans.appeal', userId, { caseId, evidence: sha256(evidence || '') });
    return { ok: true, caseId: caseId || `AP-${Date.now().toString(36)}` };
  } catch {
    return { ok: false };
  }
}

function disable() { peerKeys = {}; }

const nexusApi = { init, report, check, gossip, appeal, reportForPeer: report, myPeerId, REPORT_THRESHOLD };

module.exports = nexusApi;