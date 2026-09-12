/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { BRAND, footer, MODULE_COLORS } = require('./decorations');

// Brand palette (single source of truth: src/utils/decorations.js).
const COLORS = {
  main:      BRAND.primary,
  secondary: BRAND.accent,
  accent:    BRAND.white,
  success:   BRAND.success,
  warn:      BRAND.warning,
  danger:    BRAND.error,
  dark:      BRAND.dark,
};

function embedUser(user, color) {
  return new EmbedBuilder()
    .setColor(color || COLORS.main)
    .setAuthor({ name: user.displayName || user.username, iconURL: user.displayAvatarURL({ dynamic: true }) })
    .setFooter(footer())
    .setTimestamp();
}

/**
 * reply() — centralized interaction reply helper.
 * Automatically injects:
 *  - module color recoloring
 *  - bot avatar into embed footer (iconURL)
 *  - interaction user into embed author field
 */
async function reply(interaction, options, ephemeral = false) {
  const { ephemeral: ephemeralOption, recolor = true, ...rest } = options;
  const isEphemeral = ephemeral || ephemeralOption === true;

  // Inject bot avatar + user author into every embed automatically
  const botIconURL = interaction.client?.user?.displayAvatarURL({ dynamic: true }) || null;
  const moduleColor = MODULE_COLORS[interaction.client?.embedModule];

  if (rest.embeds?.length) {
    for (const embed of rest.embeds) {
      if (!(embed instanceof EmbedBuilder)) continue;
      const data = embed.data;

      // Recolor to module color
      if (recolor && moduleColor) embed.setColor(moduleColor);

      // Inject bot avatar into footer iconURL if footer exists and has no icon yet
      if (botIconURL && data.footer?.text && !data.footer.icon_url) {
        embed.setFooter({ text: data.footer.text, iconURL: botIconURL });
      }

      // Inject user as author if no author is set yet
      if (interaction.user && !data.author) {
        embed.setAuthor({
          name:    interaction.user.displayName || interaction.user.username,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        });
      }
    }
  }

  const payload = { ...rest, ...(isEphemeral ? { flags: MessageFlags.Ephemeral } : {}) };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

function formatDuration(millis) {
  const total = Math.floor(millis / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Splits a list of lines into chunks that each fit inside an embed field value (1024 chars).
function chunkFieldValue(lines, limit = 1024) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      if (current) chunks.push(current);
      current = line.length > limit ? line.slice(0, limit - 1) : line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

module.exports = { COLORS, embedUser, reply, formatDuration, chunkFieldValue, footer };