/*
 * Peace✘ - Music Command: /queue
 * Ported from Vybe ✘ hosting UI style
 * Paginated queue with dotted items, now-playing indicator, and pagination buttons.
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
const { E } = require('../../utils/emojis');

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Show the current music queue'),
  async execute(interaction, client) {
    const queue = client.distube?.getQueue(interaction.guildId);
    if (!queue || !queue.songs.length) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'The music queue is currently empty.' })],
        ephemeral: true,
      });
    }

    const songs = queue.songs;
    const current = songs[0];
    const prevList = queue.previousSongs || [];
    const upcoming = songs.slice(1);

    const fmtTrack = (t, i, isCurrent = false) => {
      const reqId = t.user?.id;
      const reqName = t.user?.username || 'Unknown';
      const req = reqId ? `<@${reqId}>` : reqName;
      const title = (t.name || 'Unknown Track').slice(0, 32);
      const dur = t.formattedDuration || '∞';
      return `-# ${E.dot} ${i}: ${title} | ${req} ${dur}${isCurrent ? ` ${E.yes}` : ''}`;
    };

    const previousLines = prevList.slice(-5).map((t, i) => fmtTrack(t, i + 1));
    const currentIndex = previousLines.length + 1;
    const currentLine = fmtTrack(current, currentIndex, true);
    const upcomingLines = upcoming.map((t, i) => fmtTrack(t, i + currentIndex + 1));

    const allLines = [...previousLines, currentLine, ...upcomingLines];

    const chunks = [];
    for (let i = 0; i < allLines.length; i += PAGE_SIZE) {
      chunks.push(allLines.slice(i, i + PAGE_SIZE).join('\n'));
    }

    let page = 0;

    const buildEmbed = (p) =>
      new EmbedBuilder()
        .setColor(0x353535)
        .setAuthor({
          name: 'Queue For Current Player',
          iconURL: client.user.displayAvatarURL(),
        })
        .setDescription(chunks[p] || 'Queue is empty.')
        .setFooter({
          text: `Page ${p + 1}/${chunks.length} ┆ Total: ${songs.length} song(s) ┆ ${queue.formattedDuration}`,
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
        });

    if (chunks.length <= 1) {
      return reply(interaction, { embeds: [buildEmbed(0)] });
    }

    const butPrev = new ButtonBuilder()
      .setCustomId('queue_but_prev')
      .setEmoji(E.left)
      .setStyle(ButtonStyle.Secondary);
    const butStop = new ButtonBuilder()
      .setCustomId('queue_but_stop')
      .setEmoji(E.del)
      .setStyle(ButtonStyle.Secondary);
    const butNext = new ButtonBuilder()
      .setCustomId('queue_but_next')
      .setEmoji(E.right)
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(butPrev, butStop, butNext);

    await interaction.reply({ embeds: [buildEmbed(0)], components: [row] });
    const replyMessage = await interaction.fetchReply().catch(() => null);
    if (!replyMessage) return;

    const collector = replyMessage.createMessageComponentCollector({
      filter: (b) => {
        if (!['queue_but_prev', 'queue_but_next', 'queue_but_stop'].includes(b.customId)) return false;
        if (b.user.id === interaction.user.id) return true;
        b.reply({
          flags: MessageFlags.Ephemeral,
          content: `${E.cross} Only **${interaction.user.tag}** can use these buttons.`,
        }).catch(() => {});
        return false;
      },
      time: 120_000,
    });

    collector.on('collect', async (b) => {
      if (b.customId === 'queue_but_stop') {
        collector.stop();
        await b.update({ components: [] }).catch(() => {});
        return;
      }
      if (b.customId === 'queue_but_prev') {
        page = page > 0 ? page - 1 : chunks.length - 1;
      } else if (b.customId === 'queue_but_next') {
        page = page + 1 < chunks.length ? page + 1 : 0;
      }
      await b.update({ embeds: [buildEmbed(page)] }).catch(() => {});
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
