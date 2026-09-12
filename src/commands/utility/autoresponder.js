/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /autoresponder - auto-reply to messages that contain a trigger phrase.
 * Restricted: owners + trusted members (bot-wide whitelist).
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { requireAccess } = require('../../utils/access');
const { getRules, addRule, removeRule } = require('../../utils/autoresponder');
const { commandEmbed, warningEmbed, successEmbed } = require('../../utils/decorations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Auto-reply to messages containing a trigger phrase (owners + trusted only)')
    .addSubcommand((s) => s.setName('add').setDescription('Add an auto-reply rule')
      .addStringOption((o) => o.setName('trigger').setDescription('Phrase that triggers the reply').setRequired(true))
      .addStringOption((o) => o.setName('response').setDescription('The bot\'s reply').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove an auto-reply rule')
      .addStringOption((o) => o.setName('trigger').setDescription('The trigger phrase to remove').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show all auto-reply rules')),
  execute: requireAccess()(async (interaction) => {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const rules = getRules(interaction.guild.id);
      const embed = commandEmbed({
        title: 'Auto-responder',
        description: rules.length
          ? rules.map((r, i) => `${i + 1}. \`${r.trigger}\` → ${r.response}`).join('\n')
          : 'No auto-reply rules. Add one with `/autoresponder add`.',
      });
      return reply(interaction, { embeds: [embed] });
    }

    const trigger = interaction.options.getString('trigger').trim();
    if (!trigger) return reply(interaction, { embeds: [warningEmbed({ description: 'Trigger cannot be empty.' })], ephemeral: true });

    if (sub === 'add') {
      const response = interaction.options.getString('response').trim();
      if (!response) return reply(interaction, { embeds: [warningEmbed({ description: 'Response cannot be empty.' })], ephemeral: true });
      const { added } = addRule(interaction.guild.id, trigger, response);
      return reply(
        interaction,
        added
          ? { embeds: [successEmbed({ title: 'Rule added', description: `**\`${trigger}\`** → ${response}` })] }
          : { embeds: [warningEmbed({ title: 'Rule exists', description: `A rule for **\`${trigger}\`** already exists.` })], ephemeral: true }
      );
    }

    const result = removeRule(interaction.guild.id, trigger);
    return reply(
      interaction,
      result.removed
        ? { embeds: [successEmbed({ title: 'Rule removed', description: `Removed **\`${result.rule.trigger}\`**.` })] }
        : { embeds: [warningEmbed({ title: 'Rule not found', description: `No rule found for **\`${trigger}\`**.` })], ephemeral: true }
    );
  }),
};
