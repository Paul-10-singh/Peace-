/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /queue - show the music queue, now playing, and previous tracks, in the
 * Pro build's style: dotted lines, prev/current/upcoming sections and
 * paginated with ◀ / ✕ / ▶ buttons (10 tracks per page).
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed } = require('../../utils/decorations');
const { formatDuration } = require('../../music/format');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current music queue'),
  async execute(interaction, client) {
    const queue = client.music.getQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Nothing is playing.' })], ephemeral: true });
    }

    const dot = '<:dot:1201841280577970176>';
    const prevList = queue.history?.data ?? [];
    const current = queue.currentTrack;
    const upcoming = queue.tracks.data || [];

    const fmtTrack = (t, i) => {
      const reqId = t.requestedById;
      const reqName = t.requestedBy || 'Unknown';
      const req = reqId ? `[${reqName}](https://discord.com/users/${reqId})` : reqName;
      return `-# ${dot} ${i}: ${(t.title || 'Unknown').substring(0, 30)} | ${req} ${
        t.durationMS ? formatDuration(t.durationMS) : '∞'
      }`;
    };

    const previousLines = prevList.map((t, i) => fmtTrack(t, i + 1));
    const currentIndex = previousLines.length + 1;
    const currentTrack = current;
    const currentReqId = currentTrack.requestedById;
    const currentReqName = currentTrack.requestedBy || currentTrack.author || 'Unknown';
    const currentReq = currentReqId ? `[${currentReqName}](https://discord.com/users/${currentReqId})` : currentReqName;
    const currentLine = `-# ${dot} ${currentIndex}: ${(currentTrack.title || 'Unknown').substring(0, 25)} | ${currentReq} ${
      currentTrack.durationMS ? formatDuration(currentTrack.durationMS) : '∞'
    } <:yes:1127619660519575612>`;
    const upcomingLines = upcoming.map((t, i) => fmtTrack(t, i + currentIndex + 1));

    const allLines = [...previousLines, currentLine, ...upcomingLines];
    const totalSongs = allLines.length;

    const chunks = [];
    for (let i = 0; i < allLines.length; i += PAGE_SIZE) {
      chunks.push(allLines.slice(i, i + PAGE_SIZE).join('\n'));
    }

    let page = 0;

    const embed = new EmbedBuilder()
      .setColor(0x353535)
      .setAuthor({ name: 'Queue For Current Player', iconURL: client.user.displayAvatarURL() })
      .setDescription(chunks[page] || 'Queue is empty.')
      .setFooter({
        text: `Page ${page + 1}/${chunks.length}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });

    // Only show navigation for multi-page queues (Pro behavior).
    if (chunks.length <= 1) {
      return reply(interaction, { embeds: [embed] });
    }

    const butPrev = new ButtonBuilder().setCustomId('queue_but_prev').setEmoji('<:left:1127618224595406929>').setStyle(ButtonStyle.Secondary);
    const butStop = new ButtonBuilder().setCustomId('queue_but_stop').setEmoji('<:del:1188108090499923999>').setStyle(ButtonStyle.Secondary);
    const butNext = new ButtonBuilder().setCustomId('queue_but_next').setEmoji('<:right:1127618208510255165>').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(butPrev, butStop, butNext);

    await interaction.reply({ embeds: [embed], components: [row] });
    const replyMessage = await interaction.fetchReply().catch(() => null);

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (b) => {
        if (!['queue_but_prev', 'queue_but_next', 'queue_but_stop'].includes(b.customId)) return false;
        if (b.user.id === interaction.user.id) return true;
        b.reply({
          flags: MessageFlags.Ephemeral,
          content: `<:cross:1534849320568750221> Only **${interaction.user.tag}** can use these buttons.`,
        }).catch(() => {});
        return false;
      },
      time: 300_000,
      idle: 30_000,
    });

    collector.on('collect', async (button) => {
      try {
        await button.deferUpdate();
        if (button.customId === 'queue_but_next') page = (page + 1) % chunks.length;
        else if (button.customId === 'queue_but_prev') page = page > 0 ? page - 1 : chunks.length - 1;
        else if (button.customId === 'queue_but_stop') {
          collector.stop();
          return;
        }

        const updated = EmbedBuilder.from(embed)
          .setDescription(chunks[page])
          .setFooter({ text: `Page ${page + 1}/${chunks.length}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });

        await button.message.edit({ embeds: [updated] });
      } catch (err) {
        console.error('[PeaceX] [Queue] pagination error:', err);
      }
    });

    collector.on('end', async () => {
      if (!replyMessage) return;
      try {
        const disabled = new ActionRowBuilder().addComponents(butPrev.setDisabled(true), butStop.setDisabled(true), butNext.setDisabled(true));
        await replyMessage.edit({ components: [disabled] });
      } catch {
        /* ignore */
      }
    });
  },
};