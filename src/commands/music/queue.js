/*
 * Peace✘ - Music Command: /queue
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, BRAND, footer } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the server music queue'),
  async execute(interaction, client) {
    const queue = client.distube?.getQueue(interaction.guildId);
    if (!queue || !queue.songs.length) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'The music queue is currently empty.' })],
        ephemeral: true,
      });
    }

    const songs = queue.songs;
    const nowPlaying = songs[0];
    const upcoming = songs.slice(1, 11);

    const lines = [
      `▶️ **Now Playing:** [${nowPlaying.name}](${nowPlaying.url}) — \`${nowPlaying.formattedDuration}\` (Requested by <@${nowPlaying.user?.id}>)`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ];

    if (upcoming.length) {
      lines.push('📋 **Up Next:**');
      upcoming.forEach((s, idx) => {
        lines.push(`\`${idx + 1}.\` [${s.name}](${s.url}) — \`${s.formattedDuration}\``);
      });
      if (songs.length > 11) {
        lines.push(`\n...and **${songs.length - 11}** more track(s)`);
      }
    } else {
      lines.push('*(No upcoming songs queued yet. Use `/play` to add more!)*');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`🎶 Music Queue — ${interaction.guild.name}`)
      .setDescription(lines.join('\n'))
      .setFooter(footer(`Total: ${songs.length} tracks ┆ Total Duration: ${queue.formattedDuration}`))
      .setTimestamp();

    return reply(interaction, { embeds: [embed] });
  },
};
