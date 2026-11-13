/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Welcome & Exit Helper
 * Matches the requested TNC OFFICIAL visual layout:
 * - Welcome (Channel): White accent embed, member avatar thumbnail, community greeting,
 *   quick links (rules, chat, guild apply), inviter tag, family count.
 * - Exit: White accent embed, member avatar thumbnail, left timestamp,
 *   family count, and disabled secondary button "Tysm for being with us!".
 * - Welcome DM: Multi-server dynamic resolution with deep clickable channel links
 *   (Priority 1: configured channels, Priority 2: auto-detected channels),
 *   plus full server owner customization support (placeholders, description, modal editor).
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

function findChannel(guild, predicate) {
  if (!guild?.channels?.cache) return null;
  if (typeof guild.channels.cache.find === 'function') {
    return guild.channels.cache.find(predicate) || null;
  }
  return [...guild.channels.cache.values()].find(predicate) || null;
}

/**
 * Resolves channels and generates clickable Discord deep-links for DMs.
 * Priority 1: Configured channel IDs in config
 * Priority 2: Auto-detected by channel name keywords
 * @param {import('discord.js').Guild} guild
 * @param {object} [config]
 */
function resolveGuildLinks(guild, config = {}) {
  if (!guild) {
    return {
      rulesChannel: null,
      chatChannel: null,
      supportChannel: null,
      rulesUrl: '',
      chatUrl: '',
      supportUrl: '',
      serverUrl: '',
    };
  }

  const isText = (c) => Boolean(c && (c.isTextBased?.() || c.type === 0));

  // Priority 1: Configured channel IDs
  // Priority 2: Auto-detect by channel name keywords
  const rulesChannel =
    (config.rulesChannelId && guild.channels?.cache?.get(config.rulesChannelId)) ||
    (guild.id === '1340379968571576341' ? guild.channels?.cache?.get('1341663035017793647') : null) ||
    findChannel(guild, (c) => isText(c) && /rule|law|guideline/i.test(c.name));

  const chatChannel =
    (config.chatChannelId && guild.channels?.cache?.get(config.chatChannelId)) ||
    (guild.id === '1340379968571576341' ? guild.channels?.cache?.get('1501972344179261611') : null) ||
    findChannel(guild, (c) => isText(c) && /chat|general|main-chat|talk|lounge/i.test(c.name));

  const supportChannel =
    (config.applyChannelId && guild.channels?.cache?.get(config.applyChannelId)) ||
    (config.supportChannelId && guild.channels?.cache?.get(config.supportChannelId)) ||
    (guild.id === '1340379968571576341' ? guild.channels?.cache?.get('1551092438460801064') : null) ||
    findChannel(guild, (c) => isText(c) && /support|ticket|help|apply|guild/i.test(c.name));

  const rulesUrl = rulesChannel
    ? `https://discord.com/channels/${guild.id}/${rulesChannel.id}`
    : `https://discord.com/channels/${guild.id}`;

  const chatUrl = chatChannel
    ? `https://discord.com/channels/${guild.id}/${chatChannel.id}`
    : `https://discord.com/channels/${guild.id}`;

  const supportUrl = supportChannel
    ? `https://discord.com/channels/${guild.id}/${supportChannel.id}`
    : `https://discord.com/channels/${guild.id}`;

  const serverUrl = guild.vanityURLCode
    ? `https://discord.gg/${guild.vanityURLCode}`
    : guild.id === '1340379968571576341'
      ? 'https://discord.gg/far7wH9fmP'
      : `https://discord.com/channels/${guild.id}`;

  return {
    rulesChannel,
    chatChannel,
    supportChannel,
    rulesUrl,
    chatUrl,
    supportUrl,
    serverUrl,
  };
}

/**
 * Replaces smart placeholders in a custom template string.
 * @param {string} template
 * @param {object} params
 */
function formatDmText(template = '', { guild, member, links }) {
  const user = member?.user || member || {};
  const userId = member?.id || user.id || 'user';
  const username = user.username || member?.displayName || 'Member';
  const serverName = guild?.name || 'Server';
  const count = guild?.memberCount || 1;

  const rulesMention = `[** rules__   __**](${links.rulesUrl})`;
  const chatMention = `[** chat__   __**](${links.chatUrl})`;
  const supportMention = `[** support__   __**](${links.supportUrl})`;

  return template
    .replace(/\{user\}/gi, `<@${userId}>`)
    .replace(/\{username\}/gi, username)
    .replace(/\{server\}|\{serverName\}|\{guild\}|\{guildName\}/gi, serverName)
    .replace(/\{memberCount\}|\{count\}|\{members\}/gi, String(count))
    .replace(/\{rules\}|\{rulesChannel\}/gi, rulesMention)
    .replace(/\{chat\}|\{chatChannel\}/gi, chatMention)
    .replace(/\{support\}|\{apply\}|\{supportChannel\}/gi, supportMention)
    .replace(/\{serverLink\}|\{invite\}|\{link\}/gi, links.serverUrl);
}

/**
 * Builds the Welcome DM embed payload.
 * Supports custom descriptions per server, dynamic deep-links, and fallback templates.
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild
 * @param {import('discord.js').GuildMember|object} params.member
 * @param {object} [params.config]
 * @returns {{ embeds: EmbedBuilder[] }|null}
 */
function buildWelcomeDMPayload({ guild, member, config = {} }) {
  if (config.dmEnabled === false) return null;

  const links = resolveGuildLinks(guild, config);
  const user = member?.user || member || {};
  const userId = member?.id || user.id || 'user';
  const serverName = guild?.name || 'Server';

  let description = '';

  if (config.customDmText) {
    description = formatDmText(config.customDmText, { guild, member, links });
  } else if (guild?.id === '1340379968571576341') {
    // TNC Official default aesthetic layout with dynamic channel URLs
    description = [
      '_ _',
      `⠀⠀   𓈒  <a:nature:1552099429362962452> 𓂃  /[** TNC Official__   __**](${links.serverUrl})   ﹑   \` 🤍 \`⠀⠀⠀`,
      '-# _ _⠀     ⠀𐔌  ᗢ⠀⠀ch__ill__ & v*c*⠀𖦹⠀**social**⠀﹒﹢   ꒱꒱',
      '-# _ _    ⠀ ⠀     ⠀ꕀ⠀⠀__anime__⠀join__**2**__create **!**',
      '-# _ _ ✦﹒﹢⠀⠀de__v__⠀⸝⸝⠀**events**⠀⸝⸝ ⠀<a:gaming:1552099352158150706> g*aming*⠀<a:music:1550504904521678848>',
      `-# _ _ [** rules__   __**](${links.rulesUrl})  [** chat__   __**](${links.chatUrl})  [** support__   __**](${links.supportUrl})`,
      '-# _ _ ',
      '-#          <a:LIKEBUTTON:1550504896745181234> Welcome to TNC™',
      '-#         `hope you enjoy your stay !`',
      '-# _ _                    𝝑ৎ',
    ].join('\n');
  } else {
    // Universal sleek aesthetic template for any server (Server B, C, D...)
    description = [
      '_ _',
      `⠀⠀   𓈒  ✨  𓂃  /[** ${serverName}__   __**](${links.serverUrl})   ﹑   \` 🤍 \`⠀⠀⠀`,
      `- # _ _⠀     ⠀𐔌  ᗢ⠀⠀Welcome to our community <@${userId}> !`,
      `- # _ _ [** rules__   __**](${links.rulesUrl})  [** chat__   __**](${links.chatUrl})  [** support__   __**](${links.supportUrl})`,
      '- # _ _ ',
      `- #          🤍 Welcome to ${serverName}™`,
      '- #         `hope you enjoy your stay !`',
      '- # _ _                    𝝑ৎ',
    ].join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setDescription(description);

  const thumb =
    typeof user.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ dynamic: true, size: 256 })
      : typeof guild?.iconURL === 'function'
        ? guild.iconURL({ dynamic: true, size: 256 })
        : null;

  if (thumb) {
    embed.setThumbnail(thumb);
  }

  return { embeds: [embed] };
}

/**
 * Builds the interactive Modal for server owners to edit their Welcome DM text.
 * @param {string} [currentText]
 * @returns {ModalBuilder}
 */
function buildWelcomeDmModal(currentText = '') {
  const modal = new ModalBuilder()
    .setCustomId('welcome_dm_modal')
    .setTitle('Customize Welcome DM');

  const textInput = new TextInputBuilder()
    .setCustomId('welcome_dm_text')
    .setLabel('Welcome DM Message / Description')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Use {user}, {server}, {rules}, {chat}, {support}, {memberCount}').setMaxLength(4000)
    .setRequired(true);

  if (currentText) {
    textInput.setValue(currentText.slice(0, 4000));
  }

  const row = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(row);
  return modal;
}

/**
 * Handles the modal submission when a server owner submits the Welcome DM editor.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleWelcomeDmModal(interaction) {
  const { get, set } = require('./settings');
  const { successEmbed } = require('./decorations');

  const text = interaction.fields.getTextInputValue('welcome_dm_text').trim();
  const current = get(interaction.guild.id, 'welcome') || {};
  const updated = {
    ...current,
    customDmText: text,
    dmEnabled: true,
  };
  await set(interaction.guild.id, 'welcome', updated);

  const previewPayload = buildWelcomeDMPayload({
    guild: interaction.guild,
    member: interaction.member || interaction.user,
    config: updated,
  });

  await interaction.reply({
    embeds: [
      successEmbed({
        title: 'Custom Welcome DM Saved!',
        description:
          '✅ Your custom Welcome DM message has been configured for this server.\n\n' +
          '**Live Preview:**',
      }),
      ...(previewPayload?.embeds || []),
    ],
    ephemeral: true,
  });
}

/**
 * Builds the in-channel Welcome embed payload matching Image 1.
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild
 * @param {import('discord.js').GuildMember|object} params.member
 * @param {import('discord.js').User|string|null} [params.inviter]
 * @param {object} [params.config]
 * @returns {{ embeds: EmbedBuilder[] }}
 */
function buildWelcomePayload({ guild, member, inviter = null, config = {} }) {
  const rulesChannel =
    config.rulesChannelId ||
    (guild.id === '1340379968571576341' ? '1341663035017793647' : null) ||
    findChannel(guild, (c) => (c.isTextBased?.() || c.type === 0) && /rule|law/i.test(c.name))?.id;

  const chatChannel =
    config.chatChannelId ||
    (guild.id === '1340379968571576341' ? '1501972344179261611' : null) ||
    findChannel(guild, (c) => (c.isTextBased?.() || c.type === 0) && /chat|general/i.test(c.name))?.id;

  const applyChannel =
    config.applyChannelId ||
    (guild.id === '1340379968571576341' ? '1551092438460801064' : null) ||
    findChannel(guild, (c) => (c.isTextBased?.() || c.type === 0) && /apply|guild|support/i.test(c.name))?.id;

  const rulesMention = rulesChannel ? `<#${rulesChannel}>` : '#rules';
  const chatMention = chatChannel ? `<#${chatChannel}>` : '#chat';
  const applyMention = applyChannel ? `<#${applyChannel}>` : '#apply';

  let inviterMention = 'Unknown';
  if (inviter) {
    if (typeof inviter === 'string') {
      inviterMention = inviter;
    } else if (inviter.id) {
      inviterMention = `<@${inviter.id}>`;
    } else if (inviter.username) {
      inviterMention = `@${inviter.username}`;
    }
  }

  const serverName = config.serverName || guild.name;
  const user = member?.user || member;
  const userId = member?.id || user?.id || 'user';
  const avatarUrl =
    typeof user?.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ dynamic: true, size: 256 })
      : null;

  const description = [
    `### Welcome to *${serverName}* 👾 <@${userId}>`,
    '',
    'Tysm for joining our community !',
    '',
    `• You can read rules in ${rulesMention}`,
    `• you can chat w us in ${chatMention}`,
    `• you can apply for tnc guild in ${applyMention}`,
    `• Invited by ${inviterMention}`,
    '',
    `Now we have ${guild.memberCount} as family <3`,
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setDescription(description);

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  return { embeds: [embed] };
}

/**
 * Builds the Exit embed payload matching Image 2.
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild
 * @param {import('discord.js').User|import('discord.js').GuildMember|object} params.user
 * @param {number} [params.memberCount]
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
function buildExitPayload({ guild, user, memberCount }) {
  const actualUser = user?.user || user;
  const username = actualUser?.username || 'Member';
  const count =
    typeof memberCount === 'number'
      ? memberCount
      : guild?.memberCount || 0;
  const nowUnix = Math.floor(Date.now() / 1000);

  const avatarUrl =
    typeof actualUser?.displayAvatarURL === 'function'
      ? actualUser.displayAvatarURL({ dynamic: true, size: 256 })
      : null;

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${username} has been left from the server`)
    .setDescription(
      `**Now we have ${count} in our family <3**\n` +
      `Left At: <t:${nowUnix}:F>`
    );

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  const button = new ButtonBuilder()
    .setCustomId('exit_farewell_btn')
    .setLabel('Tysm for being with us!')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const row = new ActionRowBuilder().addComponents(button);

  return { embeds: [embed], components: [row] };
}

/**
 * Resolves the channel where welcome messages should be posted.
 * @param {import('discord.js').Guild} guild
 * @param {object} [config]
 * @returns {import('discord.js').TextChannel|null}
 */
function resolveWelcomeChannel(guild, config = {}) {
  if (config.channelId) {
    const c = guild.channels?.cache?.get(config.channelId);
    if (c?.isTextBased?.() || c?.type === 0) return c;
  }
  return findChannel(
    guild,
    (c) => (c.isTextBased?.() || c.type === 0) && /(?:welcm|welcome)/i.test(c.name)
  );
}

/**
 * Resolves the channel where exit/farewell messages should be posted.
 * @param {import('discord.js').Guild} guild
 * @param {object} [config]
 * @returns {import('discord.js').TextChannel|null}
 */
function resolveExitChannel(guild, config = {}) {
  if (config.channelId) {
    const c = guild.channels?.cache?.get(config.channelId);
    if (c?.isTextBased?.() || c?.type === 0) return c;
  }
  return findChannel(
    guild,
    (c) => (c.isTextBased?.() || c.type === 0) && /(?:exit|farewell|leave|goodbye)/i.test(c.name)
  );
}

module.exports = {
  resolveGuildLinks,
  formatDmText,
  buildWelcomeDMPayload,
  buildWelcomeDmModal,
  handleWelcomeDmModal,
  buildWelcomePayload,
  buildExitPayload,
  resolveWelcomeChannel,
  resolveExitChannel,
};
