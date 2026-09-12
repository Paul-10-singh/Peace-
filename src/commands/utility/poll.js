/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { SlashCommandBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { commandEmbed, warningEmbed } = require('../../utils/decorations');

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with up to 9 options')
    .addStringOption((o) => o.setName('question').setDescription('The poll question').setRequired(true))
    .addStringOption((o) => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption((o) => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption((o) => o.setName('option3').setDescription('Option 3'))
    .addStringOption((o) => o.setName('option4').setDescription('Option 4'))
    .addStringOption((o) => o.setName('option5').setDescription('Option 5'))
    .addStringOption((o) => o.setName('option6').setDescription('Option 6'))
    .addStringOption((o) => o.setName('option7').setDescription('Option 7'))
    .addStringOption((o) => o.setName('option8').setDescription('Option 8'))
    .addStringOption((o) => o.setName('option9').setDescription('Option 9')),
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const options = [];
    for (let i = 1; i <= 9; i++) {
      const opt = interaction.options.getString(`option${i}`);
      if (opt) options.push({ emoji: EMOJIS[i - 1], text: opt });
    }

    if (options.length < 2) {
      return reply(interaction, { embeds: [warningEmbed({ description: 'A poll needs at least 2 options.' })], ephemeral: true });
    }

    const embed = commandEmbed({
      title: question,
      description: options.map((o, i) => `${o.emoji} **${o.text}**`).join('\n'),
      extra: `Poll by ${interaction.user.tag}`,
    });

    const m = await reply(interaction, { embeds: [embed] });
    const message = await interaction.fetchReply();
    for (const opt of options) {
      await message.react(opt.emoji).catch(() => {});
    }
  },
};