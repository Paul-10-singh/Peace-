/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');

const FONTS = {
  default: (text) => text,
  bold: (text) => {
    // Basic A-Z to 𝗔-𝗭 mapping
    const map = { a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶', j: '𝗷', k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿', s: '𝘀', t: '𝘁', u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇', A: '𝗔', B: '𝗕', C: '𝗖', D: '𝗗', E: '𝗘', F: '𝗙', G: '𝗚', H: '𝗛', I: '𝗜', J: '𝗝', K: '𝗞', L: '𝗟', M: '𝗠', N: '𝗡', O: '𝗢', P: '𝗣', Q: '𝗤', R: '𝗥', S: '𝗦', T: '𝗧', U: '𝗨', V: '𝗩', W: '𝗪', X: '𝗫', Y: '𝗬', Z: '𝗭' };
    return text.replace(/[a-zA-Z]/g, c => map[c] || c);
  },
  serif: (text) => {
    // 𝓔𝓵𝓮𝓰𝓪𝓷𝓽 𝓢𝓮𝓻𝓲𝓯
    const map = { a: '𝓪', b: '𝓫', c: '𝓬', d: '𝓭', e: '𝓮', f: '𝓯', g: '𝓰', h: '𝓱', i: '𝓲', j: '𝓳', k: '𝓴', l: '𝓵', m: '𝓶', n: '𝓷', o: '𝓸', p: '𝓹', q: '𝓺', r: '𝓻', s: '𝓼', t: '𝓽', u: '𝓾', v: '𝓿', w: '𝔀', x: '𝔁', y: '𝔂', z: '𝔃', A: '𝓐', B: '𝓑', C: '𝓒', D: '𝓓', E: '𝓔', F: '𝓕', G: '𝓖', H: '𝓗', I: '𝓘', J: '𝓙', K: '𝓚', L: '𝓛', M: '𝓜', N: '𝓝', O: '𝓞', P: '𝓟', Q: '𝓠', R: '𝓡', S: '𝓢', T: '𝓣', U: '𝓤', V: '𝓥', W: '𝓦', X: '𝓧', Y: '𝓨', Z: '𝓩' };
    return text.replace(/[a-zA-Z]/g, c => map[c] || c);
  },
  sakura: (text) => {
    // Fullwidth
    return text.replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
  },
  medieval: (text) => {
    const map = { a: '𝔞', b: '𝔟', c: '𝔠', d: '𝔡', e: '𝔢', f: '𝔣', g: '𝔤', h: '𝔥', i: '𝔦', j: '𝔧', k: '𝔨', l: '𝔩', m: '𝔪', n: '𝔫', o: '𝔬', p: '𝔭', q: '𝔮', r: '𝔯', s: '𝔰', t: '𝔱', u: '𝔲', v: '𝔳', w: '𝔴', x: '𝔵', y: '𝔶', z: '𝔷', A: '𝔄', B: '𝔅', C: 'ℭ', D: '𝔇', E: '𝔈', F: '𝔉', G: '𝔊', H: 'ℌ', I: 'ℑ', J: '𝔍', K: '𝔎', L: '𝔏', M: '𝔐', N: '𝔑', O: '𝔒', P: '𝔓', Q: '𝔔', R: 'ℜ', S: '𝔖', T: '𝔗', U: '𝔘', V: '𝔙', W: '𝔚', X: '𝔛', Y: '𝔜', Z: 'ℨ' };
    return text.replace(/[a-zA-Z]/g, c => map[c] || c);
  },
  monospace: (text) => {
    const map = { a: '𝚊', b: '𝚋', c: '𝚌', d: '𝚍', e: '𝚎', f: '𝚏', g: '𝚐', h: '𝚑', i: '𝚒', j: '𝚓', k: '𝚔', l: '𝚕', m: '𝚖', n: '𝚗', o: '𝚘', p: '𝚙', q: '𝚚', r: '𝚛', s: '𝚜', t: '𝚝', u: '𝚞', v: '𝚟', w: '𝚠', x: '𝚡', y: '𝚢', z: '𝚣', A: '𝙰', B: '𝙱', C: '𝙲', D: '𝙳', E: '𝙴', F: '𝙵', G: '𝙶', H: '𝙷', I: '𝙸', J: '𝙹', K: '𝙺', L: '𝙻', M: '𝙼', N: '𝙽', O: '𝙾', P: '𝙿', Q: '𝚀', R: '𝚁', S: '𝚂', T: '𝚃', U: '𝚄', V: '𝚅', W: '𝚆', X: '𝚇', Y: '𝚈', Z: '𝚉' };
    return text.replace(/[a-zA-Z]/g, c => map[c] || c);
  },
  decorative: (text) => {
    const map = { a: '𝕒', b: '𝕓', c: '𝕔', d: '𝕕', e: '𝕖', f: '𝕗', g: '𝕘', h: '𝕙', i: '𝕚', j: '𝕛', k: '𝕜', l: '𝕝', m: '𝕞', n: '𝕟', o: '𝕠', p: '𝕡', q: '𝕢', r: '𝕣', s: '𝕤', t: '𝕥', u: '𝕦', v: '𝕧', w: '𝕨', x: '𝕩', y: '𝕪', z: '𝕫', A: '𝔸', B: '𝔹', C: 'ℂ', D: '𝔻', E: '𝔼', F: '𝔽', G: '𝔾', H: 'ℍ', I: '𝕀', J: '𝕁', K: '𝕂', L: '𝕃', M: '𝕄', N: 'ℕ', O: '𝕆', P: 'ℙ', Q: 'ℚ', R: 'ℝ', S: '𝕊', T: '𝕋', U: '𝕌', V: '𝕍', W: '𝕎', X: '𝕏', Y: '𝕐', Z: 'ℤ' };
    return text.replace(/[a-zA-Z]/g, c => map[c] || c);
  }
};

const BASE_NAME = 'Peace✘';

async function handleNameStyleComponent(interaction) {
  const { isOwner } = require('./owners');
  if (!isOwner(interaction.user.id, interaction.guild?.id)) {
    return interaction.reply({ content: '<a:wrong:1550504971303395430> Only the bot owner can use this feature.', flags: MessageFlags.Ephemeral });
  }

  // Handle Font change
  if (interaction.customId === 'namestyle_font') {
    const fontType = interaction.values[0];
    const newName = FONTS[fontType](BASE_NAME);

    try {
      const me = await interaction.guild.members.fetch(interaction.client.user.id);
      await me.setNickname(newName, 'Bot Name Style update');
      await interaction.reply({ content: `<a:correct:1550504846199758928> My nickname has been updated to: **${newName}**`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error('[PeaceX] [NameStyle] Failed to update nickname:', err);
      await interaction.reply({ content: '<a:wrong:1550504971303395430> I could not update my nickname. Check my permissions.', flags: MessageFlags.Ephemeral });
    }
  }

  // Handle Color button
  if (interaction.customId === 'namestyle_color') {
    const modal = new ModalBuilder()
      .setCustomId('namestyle_modal')
      .setTitle('Set Bot Color');

    const colorInput = new TextInputBuilder()
      .setCustomId('hex_color')
      .setLabel("Hex Color Code (e.g. #a78bfa)")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(7)
      .setPlaceholder('#FFFFFF')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(colorInput));
    await interaction.showModal(modal);
  }
}

async function handleNameStyleModal(interaction) {
  const { isOwner } = require('./owners');
  if (!isOwner(interaction.user.id, interaction.guild?.id)) {
    return interaction.reply({ content: '<a:wrong:1550504971303395430> Only the bot owner can use this feature.', flags: MessageFlags.Ephemeral });
  }

  const hexValue = interaction.fields.getTextInputValue('hex_color').trim().toUpperCase();
  const hexMatch = hexValue.match(/^#?([0-9A-F]{6})$/);
  
  if (!hexMatch) {
    return interaction.reply({ content: '<a:wrong:1550504971303395430> Invalid Hex code. Please use the format `#RRGGBB`.', flags: MessageFlags.Ephemeral });
  }

  const colorInt = parseInt(hexMatch[1], 16);

  try {
    const me = await interaction.guild.members.fetch(interaction.client.user.id);
    let styleRole = interaction.guild.roles.cache.find(r => r.name === 'Peace✘ Style');

    if (styleRole) {
      await styleRole.setColor(colorInt);
    } else {
      styleRole = await interaction.guild.roles.create({
        name: 'Peace✘ Style',
        color: colorInt,
        reason: 'Bot Name Style update',
        position: me.roles.highest.position, // Attempt to place it high
      });
    }

    if (!me.roles.cache.has(styleRole.id)) {
      await me.roles.add(styleRole);
    }

    await interaction.reply({ content: `<a:correct:1550504846199758928> My color has been updated to **${hexValue}**!`, flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error('[PeaceX] [NameStyle] Failed to update color:', err);
    await interaction.reply({ content: '<a:wrong:1550504971303395430> I could not update the color role. Please make sure my role is higher in the hierarchy and I have the "Manage Roles" permission.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = { handleNameStyleComponent, handleNameStyleModal };
