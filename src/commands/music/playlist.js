/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /playlist - persistent per-server playlists (create / add / list / load /
 * remove / delete). Tracks are stored as query strings so they stay valid.
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { chunkFieldValue } = require('../../utils/helpers');
const { commandEmbed, successEmbed, errorEmbed } = require('../../utils/decorations');
const { requireVoice } = require('../../music/voice');
const { postPanel } = require('../../music/nowPlaying');
const list = require('../../music/playlists');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Manage server playlists')
    .addSubcommand((s) => s.setName('play').setDescription('Play a server playlist into the queue')
      .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand((s) => s.setName('create').setDescription('Create an empty playlist')
      .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand((s) => s.setName('add').setDescription('Add a track/URL to a playlist')
      .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true))
      .addStringOption((o) => o.setName('query').setDescription('Track name or URL').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List your server playlists'))
    .addSubcommand((s) => s.setName('show').setDescription('Show tracks in a playlist')
      .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand((s) => s.setName('load').setDescription('Load a playlist into the queue')
      .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand((s) => s.setName('delete').setDescription('Delete a playlist')
      .addStringOption((o) => o.setName('name').setDescription('Playlist name').setRequired(true))),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const name = (interaction.options.getString('name') || '').trim().slice(0, 40);
    const gid = interaction.guild.id;

    switch (sub) {
      case 'create': {
        if (!name) return reply(interaction, { embeds: [errorEmbed({ description: 'Name is required.' })] });
        const res = list.create(gid, name);
        if (!res.ok) return reply(interaction, { embeds: [errorEmbed({ description: 'A playlist with that name already exists.' })] });
        return reply(interaction, { embeds: [successEmbed({ description: `Created playlist **${name}**.` })] });
      }

      case 'add': {
        const query = interaction.options.getString('query');
        await interaction.deferReply();
        const p = list.get(gid, name);
        if (!p) return interaction.editReply({ embeds: [errorEmbed({ description: `Playlist **${name}** not found.` })] });
        const player = client.music.getPlayer();
        try {
          const result = await player.search(query);
          if (!result?.tracks?.length) return interaction.editReply({ embeds: [errorEmbed({ description: 'No tracks found for that query.' })] });
          const toAdd = result.playlist?.tracks?.length ? result.playlist.tracks.map((t) => ({ title: t.title, query: t.url })) : [result.tracks[0]].map((t) => ({ title: t.title, query: t.url }));
          const added = list.addTracks(gid, name, toAdd);
          if (!added.ok) return interaction.editReply({ embeds: [errorEmbed({ description: 'Playlist not found.' })] });
          return interaction.editReply({
            embeds: [successEmbed({ description: `Added **${toAdd.length}** track(s) to **${name}** (now ${added.playlist.tracks.length}).` })],
          });
        } catch (err) {
          return interaction.editReply({ embeds: [errorEmbed({ description: `Search failed: ${err.message}` })] });
        }
      }

      case 'list': {
        const pls = list.list(gid);
        if (!pls.length) return reply(interaction, { embeds: [errorEmbed({ description: 'No playlists yet. Create one with `/playlist create`.' })] });
        const lines = pls.map((p) => `• **${p.name}** — ${p.tracks.length} tracks`);
        return reply(interaction, { embeds: [commandEmbed({ title: 'Server Playlists', description: lines.join('\n') })] });
      }

      case 'show': {
        const p = list.get(gid, name);
        if (!p) return reply(interaction, { embeds: [errorEmbed({ description: `Playlist **${name}** not found.` })] });
        if (!p.tracks.length) return reply(interaction, { embeds: [commandEmbed({ title: name, description: '_Empty playlist._' })] });
        const lines = p.tracks.map((t, i) => `\`${i + 1}.\` **${t.title}**`);
        const chunks = chunkFieldValue(lines);
        return reply(interaction, { embeds: [commandEmbed({ title: name, description: `${p.tracks.length} tracks`, fields: chunks.map((c) => ({ name: '\u200b', value: c })) })] });
      }

      case 'play':
      case 'load': {
        const vc = requireVoice(interaction, client);
        if (!vc.ok) return reply(interaction, vc.reply);
        await interaction.deferReply();
        const p = list.get(gid, name);
        if (!p || !p.tracks.length) return interaction.editReply({ embeds: [errorEmbed({ description: `Playlist **${name}** is empty or not found.` })] });
        const player = client.music;
        try {
          for (const t of p.tracks) {
            await player.play(interaction.guild, vc.channel, t.query, interaction.user.tag, interaction.user.id).catch(() => {});
          }
        } catch (err) {
          return interaction.editReply({ embeds: [errorEmbed({ description: `Failed to load playlist: ${err.message}` })] });
        }
        const queue = client.music.getQueue(gid);
        return interaction.editReply({
          embeds: [successEmbed({ description: `Loading **${p.name}** (${p.tracks.length} tracks) into the queue.` })],
        }).then(() => {
          if (queue) postPanel(client, queue, queue.metadata?.channel).catch(() => {});
        });
      }

      case 'delete': {
        if (!list.remove(gid, name)) return reply(interaction, { embeds: [errorEmbed({ description: `Playlist **${name}** not found.` })] });
        return reply(interaction, { embeds: [successEmbed({ description: `Deleted playlist **${name}**.` })] });
      }

      default:
        return reply(interaction, { embeds: [errorEmbed({ description: 'Unknown subcommand.' })] });
    }
  },
};
