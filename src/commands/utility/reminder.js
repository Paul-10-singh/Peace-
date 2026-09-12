/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply, formatDuration } = require('../../utils/helpers');
const { warningEmbed, successEmbed } = require('../../utils/decorations');

// "10m", "2h", "1d", "30s", "1h30m", "90"
function parseDuration(input) {
  const match = input.toLowerCase().match(/^(\d+)\s*([smhdw])?$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2] || 'm';
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[unit];
  return value * mult;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder (I will DM you when it is time)')
    .addStringOption((o) => o.setName('time').setDescription('When to remind you, e.g. 10m, 2h, 1d, 90 (minutes)').setRequired(true))
    .addStringOption((o) => o.setName('what').setDescription('What should I remind you about?').setRequired(true)),
  async execute(interaction, client) {
    const timeStr = interaction.options.getString('time');
    const what = interaction.options.getString('what');
    const ms = parseDuration(timeStr);

    if (!ms) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Invalid time format. Use e.g. `10m`, `2h`, `1d`, `30s` or a plain number of minutes.' })], ephemeral: true });
    }
    if (ms > 30 * 24 * 3600 * 1000) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'Reminders can be at most 30 days in the future.' })], ephemeral: true });
    }

    await reply(interaction, {
      embeds: [
        successEmbed({
          title: 'Reminder set',
          description: `I will remind you in **${formatDuration(ms)}** about: "${what}"`,
        }),
      ],
    });

    setTimeout(async () => {
      try {
        await interaction.user.send(
          `⏰ **Reminder:** ${what}\n*Set ${formatDuration(ms)} ago via ${interaction.guild?.name || 'a server'}.*`
        );
      } catch {}
    }, ms);
  },
};