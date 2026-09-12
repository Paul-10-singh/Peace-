/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /grab - DM the current track's info (title, author, duration, link) to you.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { formatDuration } = require('../../music/format');

module.exports = {
  data: new SlashCommandBuilder().setName('grab').setDescription('DM the current track to you'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }
    const track = queue.currentTrack;
    const dur = track.durationMS ? formatDuration(track.durationMS) : '∞';
    try {
      await interaction.user.send({
        embeds: [
          successEmbed({
            title: track.title || 'Track',
            description:
              (track.author ? `**Artist:** ${track.author}\n` : '') +
              `**Duration:** \`${dur}\`\n` +
              (track.url ? `**Link:** ${track.url}` : 'Local library track'),
            thumbnail: track.thumbnail || undefined,
          }),
        ],
      });
      return reply(interaction, { embeds: [successEmbed({ description: '📩 Sent the track to your DMs.' })] });
    } catch {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Could not send you a DM (DMs closed?).' })], ephemeral: true });
    }
  },
};
