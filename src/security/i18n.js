/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * SECURITY — lightweight i18n.
 *
 * Every user-facing string produced by the security platform goes through
 * t(key, params, lang) rather than being hardcoded, so translations can be
 * dropped in per-locale without touching logic. Missing keys fall back to
 * English, then to a visibly-flagged "[missing:key]" so gaps are easy to spot.
 */
const LOCALES = {
  en: {},
  ta: {
    'security.locked': 'ஊர்வலம் பூட்டப்பட்டது',          // Lockdown active
    'security.unlocked': 'ஊர்வலம் திறக்கப்பட்டது',        // Lockdown lifted
    'security.incident.open': 'சம்பவக்குறியீடு உருவாக்கப்பட்டது',
    'security.verify.ok': 'தொடர் சரிபார்க்கப்பட்டது',
    'gbans.check.clean': 'எந்த பதிவும் இல்லை',
  },
};

function setLocaleValue(lang, key, value) {
  if (!LOCALES[lang]) LOCALES[lang] = {};
  LOCALES[lang][key] = value;
}

/**
 * Translate key -> string for `lang` (default: config LANG or 'en').
 * Placeholders are {name} tokens resolved from params.
 */
function t(key, params = {}, lang = process.env.BOT_LANG || 'en') {
  const table = LOCALES[lang] || LOCALES.en || {};
  let text = table[key] ?? LOCALES.en[key] ?? `[missing:${key}]`;
  for (const [name, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  }
  return text;
}

// Default English catalog — used by everything user-facing in the platform.
Object.assign(LOCALES.en, {
  // capability engine
  'engine.denied': 'Action {action} requires an active capability grant for {principal}.',
  'engine.expired': 'Capability grant for {action} expired at {expires}.',
  'engine.ok': 'Capability granted: {action}',
  'engine.superuser': 'Principal is a permanent superuser (owner/self).',
  'engine.revoked.role': 'Capability revoked: role membership changed.',
  'engine.revoked.inactive': 'Capability revoked: dormant for {days} days.',

  // incident / playbook
  'incident.created': 'Incident #{id} opened — {type}.',
  'incident.rolled_back': 'Incident #{id} rolled back — server state restored.',
  'incident.status': 'Incident #{id} status: {state}',

  // audit
  'audit.verified': 'Audit chain intact: {count} entries verified.',
  'audit.broken': 'Audit chain **broken** at entry #{id} ({at}).',
  'audit.ledger.empty': 'No audit entries for this guild yet.',

  // gbans
  'gbans.clean': '{user} — no reports on the federation. Reputation {score}.',
  'gbans.flaged': '{user} — flagged by {count} guild(s). Auto-ban threshold met.',
  'gbans.appeal.open': 'Appeal #{id} opened for {user}.',
  'gbans.opted_in': 'Nexus federation is now opted-in for this guild.',
  'gbans.opted_out': 'Nexus federation is now opted-out for this guild.',

  // raid
  'raid.lockdown': 'Raid score {score} exceeded threshold — auto-lockdown engaged.',
  'raid.score': 'Raid score for {user}: {score}',

  // general
  'security.disabled': 'Security platform disabled for this guild (/safety on to re-arm).',
  'security.no_permission': 'You do not have permission to perform this action.',
});

module.exports = { t, setLocaleValue, LOCALES };