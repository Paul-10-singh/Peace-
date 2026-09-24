/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /reactionrole - Add or remove reaction roles.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

function parseEmoji(emojiStr) {
  // Check for custom emoji <:name:id> or <a:name:id>
  const match = emojiStr.match(/<?a?:?(\w+):(\d+)>?/);
  if (match) return `custom:${match[2]}`;
  // Otherwise assume unicode
  return `unicode:${emojiStr.trim()}`;
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Add a reaction role to a message')
      .addStringOption((o) => o.setName('message_id').setDescription('The ID of the message').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('The role to give').setRequired(true))
      .addStringOption((o) => o.setName('emoji').setDescription('The emoji to react with').setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('The channel the message is in (defaults to current)').setRequired(false))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    if (sub === 'add') {
      const messageId = interaction.options.getString('message_id');
      const role = interaction.options.getRole('role');
      const emojiStr = interaction.options.getString('emoji');
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      try {
        const message = await channel.messages.fetch(messageId);
        if (!message) throw new Error('Message not found');

        const parsedEmojiKey = parseEmoji(emojiStr);
        const key = `${channel.id}:${message.id}:${parsedEmojiKey}`;

        const list = get(interaction.guild.id, 'reactionroles') || [];
        
        // Remove existing if any for this exact emoji on this message
        const filtered = list.filter((e) => e.key !== key);
        filtered.push({ key, roleId: role.id });
        set(interaction.guild.id, 'reactionroles', filtered);

        // Try to react to the message so users can click it
        try {
          await message.react(emojiStr);
        } catch (e) {
          // It might fail if it's a custom emoji the bot doesn't have access to, but we still saved it.
        }

        return reply(interaction, {
          embeds: [successEmbed({ title: 'Reaction Role Added', description: `Successfully bound ${emojiStr} to <@&${role.id}> on [this message](${message.url}).` })]
        });
      } catch (err) {
        return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
      }
    }
  },
};
