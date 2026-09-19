/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { canRunAny } = require('../../utils/permissions');
const { helpEmbed, MODULE_COLORS, BRAND } = require('../../utils/decorations');

const MODULE_LABELS = {
  utility: { emoji: '<:house:1550835377772822629>', label: 'Utility' },
  moderation: { emoji: '<a:Moderator:1550835001065603162>', label: 'Moderation' },
  security: { emoji: '<a:security:1550835008422416454>', label: 'Security' },
  owner: { emoji: '<a:owner:1550504913815994418>', label: 'Owner' },
};

function getModules(client, user, guild) {
  const seen = new Map();
  for (const command of client.commands.values()) {
    if (!canRunAny(user, guild, command)) continue;
    const folder = command.__folder || 'general';
    if (seen.has(folder)) continue;
    seen.set(folder, {
      key: folder,
      ...(MODULE_LABELS[folder] || {
        label: folder.charAt(0).toUpperCase() + folder.slice(1),
      }),
    });
  }
  return [...seen.values()];
}

function getModuleCommands(client, folder, user, guild) {
  const lines = [];
  for (const command of client.commands.values()) {
    if ((command.__folder || 'general') !== folder) continue;
    if (!canRunAny(user, guild, command)) continue;
    lines.push(`• \`/${command.data.name}\` — ${command.data.description}`);
  }
  return lines;
}

function getAccessibleCount(client, user, guild) {
  let count = 0;
  for (const command of client.commands.values()) {
    if (canRunAny(user, guild, command)) count++;
  }
  return count;
}

function buildHomeEmbed(client, user, guild) {
  const modules = getModules(client, user, guild);
  const accessible = getAccessibleCount(client, user, guild);
  const subtitle = `${accessible} commands across ${modules.length} modules`;
  const links = [
    `[Invite](https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands)`,
    `[Support](${process.env.SUPPORT_URL || 'https://discord.gg/UHHhc7VdGV'})`,
    '[Website](https://discord.com/)',
    '[TOS](https://discord.com/terms)',
    '[Privacy](https://discord.com/privacy)',
  ].join(' · ');

  const CELL = 26;
  const grid = [];
  const entries = modules.map((m) => {
    let count = 0;
    for (const command of client.commands.values()) {
      if ((command.__folder || 'general') === m.key && canRunAny(user, guild, command)) count++;
    }
    return `**${m.emoji ? `${m.emoji} ` : ''}${m.label}** \`${count}\``;
  });
  for (let i = 0; i < entries.length; i += 2) {
    const left = entries[i];
    const right = entries[i + 1] || '';
    grid.push(left.concat('\u2000'.repeat(Math.max(0, CELL - left.length)), right ? ' ' + right : ''));
  }

  return helpEmbed({
    title: client.user.username,
    description: `*${subtitle}*\n\n**Getting started**\nSelect a module below to browse its commands.\n\u200b\n• \`/help <command>\` — details for one command\n\n${links}`,
    fields: [
      { name: '**Modules**', value: grid.length ? grid.join('\n') : 'No modules registered.', inline: false },
    ],
  }).setColor(BRAND.accent);
}

function buildModuleEmbed(client, folder, user, guild) {
  const meta = MODULE_LABELS[folder] || { emoji: '📁', label: folder };
  const cmds = getModuleCommands(client, folder, user, guild);
  const embed = helpEmbed({
    title: `${meta.emoji ? `${meta.emoji} ` : ''}${client.user.username} · ${meta.label}`,
    description: [`*${cmds.length} commands in this module*`, '', ...cmds].join('\n'),
  }).setColor(MODULE_COLORS[folder] || BRAND.accent);
  return embed;
}

function buildSelectMenu(client, user, guild) {
  const options = [
    { label: 'Home', value: 'home', description: 'Overview & getting started', emoji: '<:home:1550834994853847040>' },
    ...getModules(client, user, guild).map((m) => {
      let count = 0;
      for (const command of client.commands.values()) {
        if ((command.__folder || 'general') === m.key && canRunAny(user, guild, command)) count++;
      }
      return { label: m.label, value: m.key, description: `${count} commands`, emoji: m.emoji };
    }),
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('help_menu').setPlaceholder('Home').addOptions(options)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
  buildHomeEmbed,
  buildModuleEmbed,
  buildSelectMenu,
  async execute(interaction, client) {
    await reply(interaction, {
      embeds: [buildHomeEmbed(client, interaction.user, interaction.guild)],
      components: [buildSelectMenu(client, interaction.user, interaction.guild)],
      recolor: false,
    });
  },
};
