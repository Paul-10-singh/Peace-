/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Latency check — replies "Pinging..." instantly, then swaps in the measured
 * roundtrip + WebSocket latency with an uptime readout and a live gauge.
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BRAND } = require('../../utils/decorations');

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

function latencyStatus(ms) {
  if (ms < 100) return 'Excellent';
  if (ms < 250) return 'Good';
  if (ms < 500) return 'Fair';
  return 'Poor';
}

function gauge(ms) {
  const value = Math.min(1000, Math.max(0, ms)) / 10;
  const filled = Math.max(0, Math.min(10, Math.round(value / 10)));
  return `\`${'▓'.repeat(filled)}${'░'.repeat(10 - filled)}\``;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency (roundtrip + WebSocket).'),

  async execute(interaction, client) {
    const start = Date.now();
    await interaction.reply({ content: 'Pinging...' });

    const latency = Date.now() - start;
    const ws = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(BRAND.module)
      .setTitle(`<a:status:1550504949882953820> Ping`)
      .setDescription(
        '```\n' +
          ['Latency   : ' + latency + ' ms', 'WebSocket : ' + ws + ' ms', 'Status    : ' + latencyStatus(latency)].join(
            '\n'
          ) +
          '\n```'
      )
      .addFields(
        { name: 'Live Gauge', value: `${gauge(Math.max(latency, ws))} ${latencyStatus(latency)}`, inline: true },
        { name: 'Uptime', value: `\`${formatUptime(client.uptime)}\``, inline: true },
        { name: 'Responded', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      );

    await interaction.editReply({ embeds: [embed] });
  },
};