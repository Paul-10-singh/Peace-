/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Central decoration system — Midnight Blue theme.
 * Single source of truth for all embed styling, brand colors, footers,
 * timestamps, status marks and the terminal startup banner.
 *
 * Theme: Deep navy + ice blue + white (modern & sleek)
 * Features:
 *  - Uniform single accent color across all modules
 *  - Animated emoji for success / error states
 *  - Auto-timestamp on every embed
 *  - Bot avatar in footer
 *  - Author field (who used the command) on every embed
 *  - Category-specific emoji icons in titles
 */
const { EmbedBuilder } = require('discord.js');

// --- Brand ---------------------------------------------------------------
const BRAND = {
  name:      'PeaceX',

  // Spotify Green palette
  primary:   0x353535,   // dark gray (standard embed color)
  accent:    0x353535,   // dark gray
  white:     0xF8FAFC,   // near-white (unused for embeds)
  success:   0x353535,   // dark gray
  warning:   0x353535,   // dark gray
  error:     0x353535,   // dark gray
  dark:      0x353535,   // dark gray
  muted:     0x353535,   // dark gray

  // All modules use the same dark gray
  module:    0x353535,
};

// Module-level emoji icons shown in embed titles
const MODULE_ICONS = {
  utility:    '🔧',
  moderation: '🛡️',
  security:   '🔒',
  owner:      '👑',
  default:    '✦',
};

// Status emoji (universal unicode — renders in every server, unlike custom
// emojis which showed as broken `:name:` text outside the host server)
const STATUS = {
  SUCCESS: '✅',
  ERROR:   '❌',
  WARNING: '⚠️',
  INFO:    'ℹ️',
  LOADING: '⏳',
};

const FOOTER_TEXT = `${BRAND.name}`;

// --- Footer ----------------------------------------------------------------
// iconURL is the bot's avatar URL — passed in at runtime from client.user.displayAvatarURL()
function footer(extra = '', iconURL = null) {
  const text = extra ? `${FOOTER_TEXT} • ${extra}` : FOOTER_TEXT;
  return iconURL ? { text, iconURL } : { text };
}

// --- Dynamic Discord timestamp -----------------------------------------------
function stamp(value, style = 'R') {
  const seconds =
    typeof value === 'number' ? value : Math.floor(new Date(value).getTime() / 1000);
  return `<t:${seconds}:${style}>`;
}

// --- Core embed builder -------------------------------------------------------
// opts: title, description, fields, extra (footer suffix), thumbnail, image,
//       url, author, timestamp (default now; false to omit),
//       mark (emoji prefix), iconURL (bot avatar for footer), user (interaction user)
function build(opts, color, mark, defaultTitle) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setFooter(footer(opts.extra || '', opts.iconURL || null));

  const title = opts.title ?? defaultTitle;
  if (title) embed.setTitle(mark ? `${mark}  ${title}` : title);
  if (opts.description) embed.setDescription(opts.description);
  if (opts.fields?.length) embed.addFields(opts.fields);
  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
  if (opts.image)     embed.setImage(opts.image);
  if (opts.url)       embed.setURL(opts.url);

  // Author field — shows who ran the command
  if (opts.author) {
    embed.setAuthor(opts.author);
  } else if (opts.user) {
    embed.setAuthor({
      name:    opts.user.displayName || opts.user.username,
      iconURL: opts.user.displayAvatarURL({ dynamic: true }),
    });
  }

  // Always show timestamp (current time)
  if (opts.timestamp !== false) embed.setTimestamp();

  return embed;
}

// --- Public embed builders ---------------------------------------------------

/** ✅ Action succeeded */
function successEmbed(opts = {}) {
  return build(opts, BRAND.success, null, 'Success');
}

/** ❌ Something went wrong */
function errorEmbed(opts = {}) {
  return build(opts, BRAND.error, null, 'Something went wrong');
}

/** ⚠️ Caution / heads-up */
function warningEmbed(opts = {}) {
  return build(opts, BRAND.warning, null, 'Warning');
}

/** Neutral information */
function infoEmbed(opts = {}) {
  return build(opts, BRAND.accent, null, 'Information');
}

/** Processing / loading */
function loadingEmbed(opts = {}) {
  return build(opts, BRAND.muted, null, 'Processing…');
}

/** Standard command output */
function commandEmbed(opts = {}) {
  return build(opts, BRAND.module, null, '');
}

/** Music / premium highlight embed */
function premiumEmbed(opts = {}) {
  return build(opts, BRAND.module, null, '');
}

/** Help / list embed */
function helpEmbed(opts = {}) {
  return build(opts, BRAND.dark, null, '');
}

/**
 * Category embed — prepends the module icon to the title.
 * category: 'utility' | 'moderation' | 'security' | 'owner'
 */
function categoryEmbed(category, opts = {}) {
  const icon = MODULE_ICONS[category] || MODULE_ICONS.default;
  return build(opts, BRAND.module, icon, '');
}

// --- Terminal styling --------------------------------------------------------
const ANSI = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  navy:   '\x1b[38;5;25m',    // deep navy
  ice:    '\x1b[38;5;117m',   // ice blue
  white:  '\x1b[97m',
  green:  '\x1b[38;5;48m',
  red:    '\x1b[38;5;203m',
  amber:  '\x1b[38;5;214m',
  dim:    '\x1b[2m',
  // Legacy aliases kept for compatibility
  purple: '\x1b[38;5;141m',
  cyan:   '\x1b[38;5;51m',
};

function render(segments) {
  return segments.map((s) => (s.c ? `${s.c}${s.t}${ANSI.reset}` : s.t)).join('');
}

function boxRow(innerWidth, segments) {
  const plain = segments.map((s) => s.t).join('');
  const pad   = ' '.repeat(Math.max(0, innerWidth - plain.length));
  return `${ANSI.dim}│${ANSI.reset} ${render(segments)}${pad} ${ANSI.dim}│${ANSI.reset}`;
}

function printStartupBanner({ tag, commandCount, status = 'Online' }) {
  const inner = 46;
  const hline = `${ANSI.dim}${'─'.repeat(inner + 2)}${ANSI.reset}`;
  const center = (segments) => {
    const plain = segments.map((s) => s.t).join('');
    const left  = ' '.repeat(Math.max(0, Math.floor((inner - plain.length) / 2)));
    return boxRow(inner, [{ t: left, c: null }, ...segments]);
  };
  const infoRow = (label, value) =>
    boxRow(inner, [
      { t: '✓ ',            c: ANSI.green },
      { t: label.padEnd(19), c: ANSI.white },
      { t: value,            c: ANSI.ice   },
    ]);

  const lines = [
    `\n${ANSI.dim}╭${'─'.repeat(inner + 2)}╮${ANSI.reset}`,
    center([{ t: 'PEACEX', c: `${ANSI.bold}${ANSI.ice}` }]),
    center([{ t: 'Peace in Every Command', c: ANSI.dim }]),
    ANSI.dim + '├' + '─'.repeat(inner + 2) + '┤' + ANSI.reset,
    infoRow('Logged in as',       tag            || '—'),
    infoRow('Commands deployed',  String(commandCount ?? '—')),
    infoRow('Discord connection', 'Ready'),
    infoRow('System status',      status),
    ANSI.dim + '╰' + '─'.repeat(inner + 2) + '╯' + ANSI.reset + '\n',
  ];

  console.log(lines.join('\n'));
}

function consoleStatus(mark, text) {
  const colors = { '✓': ANSI.green, '×': ANSI.red, '!': ANSI.amber };
  const c = colors[mark] || ANSI.ice;
  console.log(`${c}${mark}${ANSI.reset} ${ANSI.white}${text}${ANSI.reset}`);
}

// --- Backwards compat: MODULE_COLORS (all same color now) -------------------
const MODULE_COLORS = {
  owner:      0x353535,
  moderation: 0x353535,
  security:   0x353535,
  utility:    0x353535,
};

module.exports = {
  BRAND,
  MODULE_COLORS,
  MODULE_ICONS,
  FOOTER_TEXT,
  STATUS,
  footer,
  stamp,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,
  loadingEmbed,
  commandEmbed,
  premiumEmbed,
  helpEmbed,
  categoryEmbed,
  ANSI,
  printStartupBanner,
  consoleStatus,
};
