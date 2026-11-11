/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /clone all - Interactive server & expression cloner (Owner only)
 *
 *   /clone all source:<source_server_id> [destination:<dest_server_id>] [type:<mode>]
 *
 * - source:      Source server ID to copy FROM (bot must be in it)
 * - destination: Destination server ID to clone INTO (defaults to current server)
 * - type:        Optional direct mode; leave blank for interactive panel:
 *                  • Clone Server (Text Channels, Voice Channels, Server Settings, Roles & Permissions)
 *                  • Emoji, Stickers, GIF
 *                  • Clone Both
 */
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed } = require('../../utils/decorations');
const { isBotOwner } = require('../../utils/owners');
const {
  createCloneSession,
  deleteCloneSession,
  validatePermissionsForMode,
  buildClonePanelPayload,
  buildWipeConfirmPayload,
  runCloneExecution,
} = require('../../utils/clonePanel');

async function resolveGuild(client, id) {
  if (!id) return null;
  const trimmed = String(id).trim();
  return client.guilds.cache.get(trimmed) || (await client.guilds.fetch(trimmed).catch(() => null));
}

module.exports = {
  botOwnerOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('clone')
    .setDescription('Clone server channels, settings, roles & perms or emojis/stickers/GIFs by server ID (Owner only)')
    .addSubcommand((s) =>
      s
        .setName('all')
        .setDescription('Clone server (channels, settings, roles/perms) or emojis, stickers & GIFs from a server')
        .addStringOption((o) =>
          o
            .setName('source')
            .setDescription('Source server ID to clone FROM')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('destination')
            .setDescription('Destination server ID to clone INTO (defaults to current server)')
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('What to clone (leave empty to choose interactively in panel)')
            .setRequired(false)
            .addChoices(
              { name: 'Clone Server (Text/Voice Channels, Settings, Roles & Perms)', value: 'server' },
              { name: 'Emoji, Stickers, GIF', value: 'expressions' },
              { name: 'Clone Both (Server + Emoji, Stickers & GIF)', value: 'both' },
            ),
        ),
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  async autocomplete(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      return interaction.respond([]).catch(() => {});
    }
    const query = String(interaction.options.getFocused() || '').toLowerCase().trim();
    const guilds = [...interaction.client.guilds.cache.values()];
    const matched = guilds
      .filter((g) => !query || g.name.toLowerCase().includes(query) || g.id.includes(query))
      .slice(0, 25)
      .map((g) => ({
        name: `${g.name.slice(0, 68)} (${g.id})`,
        value: g.id,
      }));
    return interaction.respond(matched).catch(() => {});
  },

  async execute(interaction) {
    if (!isBotOwner(interaction.user.id)) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'This command is strictly reserved for the **Bot Owner**.' })],
        ephemeral: true,
      });
    }

    const sourceId = interaction.options.getString('source', true).trim();
    const destId = interaction.options.getString('destination')?.trim() || null;
    const directType = interaction.options.getString('type') || null;
    const client = interaction.client;

    const sourceGuild = await resolveGuild(client, sourceId);
    if (!sourceGuild) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `I am not in the source server \`${sourceId}\` — add me there first.` })],
        ephemeral: true,
      });
    }

    const destination = destId ? await resolveGuild(client, destId) : interaction.guild;
    if (!destination) {
      return reply(interaction, {
        embeds: [
          errorEmbed({
            description: destId
              ? `I am not in the destination server \`${destId}\`.`
              : 'No server context found — please specify a **destination** server ID.',
          }),
        ],
        ephemeral: true,
      });
    }

    if (sourceGuild.id === destination.id) {
      return reply(interaction, {
        embeds: [
          errorEmbed({
            description: `Source and destination servers cannot be the same server (\`${sourceGuild.id}\`).`,
          }),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    // Refresh caches so preview counts & bot permissions are exact
    await Promise.allSettled([
      sourceGuild.channels?.fetch?.(),
      sourceGuild.roles?.fetch?.(),
      sourceGuild.emojis?.fetch?.(),
      sourceGuild.stickers?.fetch?.(),
      destination.members?.fetchMe?.(),
    ]);

    const session = createCloneSession({
      userId: interaction.user.id,
      sourceGuild,
      destinationGuild: destination,
    });

    if (directType) {
      const permCheck = validatePermissionsForMode(destination, directType, session.options);
      if (!permCheck.ok) {
        deleteCloneSession(session.id);
        return interaction.editReply({
          embeds: [
            errorEmbed({
              title: 'Missing Bot Permissions',
              user: interaction.user,
              description:
                `I need the following permission(s) in **${destination.name}**:\n` +
                permCheck.missing.map((m) => `• ${m}`).join('\n'),
            }),
          ],
        });
      }

      if (directType === 'expressions') {
        return runCloneExecution(interaction, session, sourceGuild, destination, 'expressions');
      }

      // Ask wipe/keep confirmation for destructive server / full clones
      const confirmPayload = buildWipeConfirmPayload(
        session,
        sourceGuild,
        destination,
        directType,
        interaction.user,
      );
      return interaction.editReply(confirmPayload);
    }

    const panelPayload = buildClonePanelPayload(session, sourceGuild, destination, interaction.user);
    return interaction.editReply(panelPayload);
  },
};
