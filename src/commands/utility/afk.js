/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { setAfk, getAfk } = require('../../utils/afk');
const { infoEmbed, errorEmbed, successEmbed } = require('../../utils/decorations');

function statusPayload(userId, user) {
  const entry = getAfk(userId);
  const embed = infoEmbed({
    author: { name: user.username, iconURL: user.displayAvatarURL({ dynamic: true }) },
    title: 'AFK status',
    description: entry
      ? `**Reason:** ${entry.reason}\n**Since:** <t:${Math.floor(entry.timestamp / 1000)}:R>\n**DMs:** ${entry.dmNotify ? 'On' : 'Off'}`
      : 'You are not currently AFK.',
  });

  const notify = new ButtonBuilder()
    .setCustomId('afk_dm_on')
    .setLabel('🔔 Notify on DMs')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!entry || entry.dmNotify);
  const silent = new ButtonBuilder()
    .setCustomId('afk_dm_off')
    .setLabel('🔕 No DMs')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!entry || !entry.dmNotify);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(notify, silent)] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set your AFK status')
    .addStringOption((o) =>
      o.setName('reason').setDescription('The reason you are AFK (defaults to "AFK")').setRequired(false)
    ),
  statusPayload,
  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'AFK';

    let entry = setAfk(interaction.user.id, reason, true);
    if (!entry) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'Something went wrong while setting your AFK status.' })], ephemeral: true });
    }

    const confirm = successEmbed({
      author: { name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) },
      title: 'AFK Set',
      description: `You're now **AFK**\n**Reason:** ${reason}`,
    });

    await reply(interaction, { embeds: [confirm], ephemeral: true });

    const panel = statusPayload(interaction.user.id, interaction.user);
    await interaction.user.send(panel).catch(() => {});
  },
};