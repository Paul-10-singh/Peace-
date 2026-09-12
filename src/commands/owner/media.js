const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, errorEmbed } = require('../../utils/decorations');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('media')
    .setDescription('Image and emoji utilities (Owner only)')
    .addSubcommand((s) => s.setName('avatar').setDescription('Show a user avatar').addUserOption((o) => o.setName('user').setDescription('User').setRequired(false)))
    .addSubcommand((s) => s.setName('emoji').setDescription('Show an emoji image').addStringOption((o) => o.setName('emoji').setDescription('Custom emoji').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'avatar') {
      const user = interaction.options.getUser('user') || interaction.user;
      return reply(interaction, { embeds: [commandEmbed({ title: `${user.tag} avatar`, image: user.displayAvatarURL({ size: 2048, extension: 'png' }) })] });
    }
    const raw = interaction.options.getString('emoji');
    const match = raw.match(/^<a?:([\w]+):(\d+)>$/);
    if (!match) return reply(interaction, { embeds: [errorEmbed({ description: 'Provide a custom Discord emoji such as `<:name:id>`.' })], ephemeral: true });
    const animated = raw.startsWith('<a:');
    return reply(interaction, { embeds: [commandEmbed({ title: `${match[1]} emoji`, image: `https://cdn.discordapp.com/emojis/${match[2]}.${animated ? 'gif' : 'png'}?size=256` })] });
  },
};