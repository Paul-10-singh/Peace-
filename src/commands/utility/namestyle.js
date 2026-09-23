/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Bot Name Style Settings Panel
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('namestyle')
    .setDescription('Customize how the bot\'s name and color appears in this server (Owner Only)'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('Display Name Style')
      .setDescription('Customize how the bot\'s name appears in this server.\n\n**Font**\nChoose a Unicode font style for the bot\'s nickname.\n\n**Color**\nPick a Hex color to assign to the bot\'s dedicated role.')
      .setFooter({ text: 'Peace✘ Customization', iconURL: interaction.client.user.displayAvatarURL() });

    const fontSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('namestyle_font')
        .setPlaceholder('Select a font style...')
        .addOptions([
          { label: 'Default', value: 'default', description: 'Standard text' },
          { label: 'Bold Comic', value: 'bold', description: '𝗕𝗼𝗹𝗱 𝘁𝗲𝘅𝘁' },
          { label: 'Elegant Serif', value: 'serif', description: '𝓔𝓵𝓮𝓰𝓪𝓷𝓽 𝓢𝓮𝓻𝓲𝓯' },
          { label: 'Sakura (Fullwidth)', value: 'sakura', description: 'Ｓａｋｕｒａ' },
          { label: 'Medieval', value: 'medieval', description: '𝔐𝔢𝔡𝔦𝔢𝔳𝔞𝔩' },
          { label: '8Bit (Monospace)', value: 'monospace', description: '𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎' },
          { label: 'Decorative', value: 'decorative', description: '𝔻𝕖𝕔𝕠𝕣𝕒𝕥𝕚𝕧𝕖' },
        ])
    );

    const colorButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('namestyle_color')
        .setLabel('Set Color (Hex)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎨')
    );

    await interaction.reply({
      embeds: [embed],
      components: [fontSelect, colorButton],
      flags: MessageFlags.Ephemeral, // Send ephemerally if the owner just wants to set it quietly, or send publicly? Let's make it public so it acts like a panel, but owners usually prefer panels public if it's an admin channel. Actually, ephemeral is safer.
    });
  },
};
