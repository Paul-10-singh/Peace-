/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Welcome & Exit Helper
 * Matches the requested TNC OFFICIAL visual layout:
 * - Welcome: White accent embed, member avatar thumbnail, community greeting,
 *   quick links (rules, chat, guild apply), inviter tag, family count.
 * - Exit: White accent embed, member avatar thumbnail, left timestamp,
 *   family count, and disabled secondary button "Tysm for being with us!".
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Builds the Welcome embed payload matching Image 1.
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

function findChannel(guild, predicate) {
  if (!guild?.channels?.cache) return null;
  if (typeof guild.channels.cache.find === 'function') {
    return guild.channels.cache.find(predicate) || null;
  }
  return [...guild.channels.cache.values()].find(predicate) || null;
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
    if (c?.isTextBased?.() || c.type === 0) return c;
  }
  return findChannel(
    guild,
    (c) => (c.isTextBased?.() || c.type === 0) && /(?:exit|farewell|leave|goodbye)/i.test(c.name)
  );
}

module.exports = {
  buildWelcomePayload,
  buildExitPayload,
  resolveWelcomeChannel,
  resolveExitChannel,
};
