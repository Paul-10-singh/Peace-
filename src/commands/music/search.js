/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /search - search a track and pick from the top results (ephemeral select).
 */
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const { requireVoice } = require('../../music/voice');
const { formatDuration } = require('../../music/format');
const { storePicks, v2Error } = require('../../music/interactions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search for a track and choose from the results')
    .addStringOption((o) => o.setName('query').setDescription('Song name or URL').setRequired(true)),
  async execute(interaction, client) {
    await interaction.deferReply();
    const vc = requireVoice(interaction, client);
    if (!vc.ok) return interaction.followUp(v2Error(vc.reply.content)).catch(() => {});

    const query = interaction.options.getString('query');
    const userId = interaction.user.id;
    const player = client.music.getPlayer();

    let tracks;
    try {
      const result = await player.search(query, { searchEngine: 'auto' });
      tracks = result?.tracks?.slice(0, 10);
    } catch (err) {
      return interaction.followUp(v2Error(`Search failed: ${err.message}`)).catch(() => {});
    }
    if (!tracks || !tracks.length) {
      return interaction.followUp(v2Error(`No results found for **${query}**.`)).catch(() => {});
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('music:pick')
      .setPlaceholder('Pick a result to play')
      .addOptions(
        tracks.map((t, i) => ({
          label: `${i + 1}. ${String(t.title).slice(0, 90)}`,
          value: String(i),
          description: t.author ? t.author.slice(0, 50) : undefined,
        }))
      );

    const container = new ContainerBuilder().setAccentColor(0x353535)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Results for** \`${query}\`\nChoose one to play.`)
      )
      .addActionRowComponents(select);

    storePicks(userId, {
      mode: 'play',
      channelId: vc.channel.id,
      tracks: tracks.map((t) => ({
        title: t.title,
        url: t.url,
        author: t.author,
        durationMS: t.durationMS,
        duration: t.duration || formatDuration(t.durationMS),
      })),
    });

    return interaction.followUp({
      components: [container.toJSON()],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => {});
  },
};
