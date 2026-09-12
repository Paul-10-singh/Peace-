/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Translate Message - right-click context command.
 * Uses the free (unofficial) Google translate endpoint — no API key.
 * Auto-detects the source language and translates to English (or the
 * message's own channel language hint is ignored; English output).
 */
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { errorEmbed, infoEmbed } = require('../../utils/decorations');

const MAX_TRANSLATE_LEN = 4000;

async function translate(text, target = 'en') {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google translate returned ${res.status}.`);
  const data = await res.json();
  const translated = (data[0] || []).map((seg) => seg[0]).join('');
  const detected = data[2] || 'auto';
  return { translated, detected };
}

module.exports = {
  ownerOnly: true,
  data: new ContextMenuCommandBuilder()
    .setName('Translate Message')
    .setType(ApplicationCommandType.Message),
  async execute(interaction) {
    const message = interaction.targetMessage;
    const content = (message.content || '').trim();
    if (!content) {
      return reply(interaction, { embeds: [errorEmbed({ description: 'That message has no text to translate.' })] }, true);
    }
    if (content.length > MAX_TRANSLATE_LEN) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Message is too long (${content.length} chars, max ${MAX_TRANSLATE_LEN}).` })] }, true);
    }

    try {
      const { translated, detected } = await translate(content);
      return reply(interaction, {
        embeds: [infoEmbed({
          title: `Translated (from ${detected})`,
          description: translated.slice(0, 4000) || '*empty translation*',
          fields: content.length > 600 ? [] : [{ name: 'Original', value: content.slice(0, 600) }],
        })],
      }, true);
    } catch (err) {
      return reply(interaction, { embeds: [errorEmbed({ description: `Translation failed: ${err.message}` })] }, true);
    }
  },
};