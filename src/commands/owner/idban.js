/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('idban')
    .setDescription('Ban a user by ID who is not in the server (Owner only)')
    .addStringOption((o) => o.setName('user_id').setDescription('Discord user ID').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Ban reason').setRequired(false))
    .addBooleanOption((o) => o.setName('delete_messages').setDescription('Delete their recent messages (default true)').setRequired(false)),
  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteMessages = interaction.options.getBoolean('delete_messages') ?? true;

    if (!/^\d{17,20}$/.test(userId)) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That does not look like a valid user ID.' })], ephemeral: true });
    }

    try {
      const user = await interaction.client.users.fetch(userId);
      await interaction.guild.bans.create(userId, { reason: `ID ban by ${interaction.user.tag}: ${reason}`, deleteMessageSeconds: deleteMessages ? 604800 : 0 });
      return reply(interaction, {
        embeds: [successEmbed({ title: 'User banned', description: `Banned **${user.tag}** (\`${userId}\`) ${deleteMessages ? 'and deleted their messages' : ''}.\nReason: ${reason}` })],
      });
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Failed: ${err.message}` })], ephemeral: true });
    }
  },
};