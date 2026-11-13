/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Centralized, Clean & Premium Log Embed Formatter
 * Strict blockquote + arrow styling matching user aesthetic:
 * > ❯ **Field :** `value`
 * Every log includes user avatar profile, user ID, dynamic timestamps and zero missing details.
 */
const { EmbedBuilder } = require('discord.js');

const LOG_COLOR = 0x2B2D31; // Clean Sleek Dark theme

/**
 * Creates a uniform, clean log embed with blockquote arrows.
 * @param {object} params
 * @param {string} params.title
 * @param {import('discord.js').User|import('discord.js').GuildMember|object} [params.user]
 * @param {Array<{ label: string, value: string }>} params.fields
 * @param {Array<{ label: string, content: string }>} [params.blocks]
 * @param {string} [params.footerExtra]
 * @param {number} [params.color]
 * @returns {EmbedBuilder}
 */
function createLogCard({ title, user = null, fields = [], blocks = [], footerExtra = '', color = LOG_COLOR }) {
  const actualUser = user?.user || user;
  const avatarUrl =
    typeof actualUser?.displayAvatarURL === 'function'
      ? actualUser.displayAvatarURL({ dynamic: true, size: 256 })
      : null;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp();

  if (actualUser && actualUser.username) {
    embed.setAuthor({
      name: `${actualUser.tag || actualUser.username}`,
      iconURL: avatarUrl || undefined,
    });
    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }
  }

  // Format fields using the exact blockquote arrow layout:
  // > ❯ **Label :** value
  let description = '';
  if (fields.length > 0) {
    description = fields
      .map((f) => `> ❯ **${f.label} :** ${f.value}`)
      .join('\n');
  }

  // Add any codeblocks (for message content, before/after, etc.)
  if (blocks.length > 0) {
    for (const block of blocks) {
      const sanitized = (block.content || '*(empty)*').replace(/```/g, '`\u200B``');
      description += `\n\n> ❯ **${block.label} :**\n\`\`\`text\n${sanitized.slice(0, 1000)}\n\`\`\``;
    }
  }

  embed.setDescription(description);

  const footerText = actualUser?.id
    ? `User ID: ${actualUser.id}${footerExtra ? ` • ${footerExtra}` : ''}`
    : footerExtra || 'Server Audit Log';

  embed.setFooter({ text: footerText });

  return embed;
}

// ── Specific Log Builders ──────────────────────────────────────────────────

function buildMessageDeleteLog({ message, author, channel, executor = null }) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const fields = [
    { label: 'Author', value: author ? `<@${author.id}> (\`${author.username}\`)` : '`Unknown`' },
    { label: 'User ID', value: author?.id ? `\`${author.id}\`` : '`Unknown`' },
    { label: 'Channel', value: channel ? `<#${channel.id}> (\`#${channel.name}\`)` : '`Unknown`' },
    { label: 'Message ID', value: `\`${message?.id || 'Unknown'}\`` },
    { label: 'Deleted At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` },
  ];

  if (executor && executor.id !== author?.id) {
    fields.push({ label: 'Deleted By', value: `<@${executor.id}> (\`${executor.username}\`)` });
  }

  const blocks = [];
  const content = message?.content || (message?.attachments?.size ? '*(Attachment only)*' : '*(No text content)*');
  blocks.push({ label: 'Content', content });

  if (message?.attachments?.size > 0) {
    const urls = message.attachments.map((a) => a.url).join('\n');
    blocks.push({ label: 'Attachments', content: urls });
  }

  return createLogCard({
    title: '🗑️ Message Deleted',
    user: author,
    fields,
    blocks,
    color: 0xED4245,
  });
}

function buildMessageEditLog({ oldMessage, newMessage, author, channel }) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const jumpUrl = newMessage?.url || `https://discord.com/channels/${channel?.guild?.id}/${channel?.id}/${newMessage?.id}`;

  const fields = [
    { label: 'Author', value: author ? `<@${author.id}> (\`${author.username}\`)` : '`Unknown`' },
    { label: 'User ID', value: author?.id ? `\`${author.id}\`` : '`Unknown`' },
    { label: 'Channel', value: channel ? `<#${channel.id}> (\`#${channel.name}\`)` : '`Unknown`' },
    { label: 'Jump Link', value: `[Click to view message](${jumpUrl})` },
    { label: 'Edited At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` },
  ];

  const blocks = [
    { label: 'Before', content: oldMessage?.content || '*(empty)*' },
    { label: 'After', content: newMessage?.content || '*(empty)*' },
  ];

  return createLogCard({
    title: '✏️ Message Edited',
    user: author,
    fields,
    blocks,
    color: 0xFEE75C,
  });
}

function buildMemberJoinLog({ member, usedInvite = null, vanityCode = null }) {
  const user = member?.user || member;
  const createdUnix = Math.floor((user?.createdTimestamp || Date.now()) / 1000);
  const joinedUnix = Math.floor(Date.now() / 1000);

  let inviteVal = '`Unknown / Direct`';
  if (usedInvite) {
    const inviterText = usedInvite.inviter
      ? `<@${usedInvite.inviter.id}> (\`${usedInvite.inviter.username}\`)`
      : '`Unknown`';
    inviteVal = `${inviterText} (Code: \`${usedInvite.code}\` • Uses: \`${usedInvite.uses || 1}\`)`;
  } else if (vanityCode) {
    inviteVal = `Vanity URL (\`${vanityCode}\`)`;
  }

  const fields = [
    { label: 'Member', value: `<@${user.id}> (\`${user.username}\`)` },
    { label: 'User ID', value: `\`${user.id}\`` },
    { label: 'Invited By', value: inviteVal },
    { label: 'Account Created', value: `<t:${createdUnix}:F> (<t:${createdUnix}:R>)` },
    { label: 'Joined At', value: `<t:${joinedUnix}:F> (<t:${joinedUnix}:R>)` },
    { label: 'Member Count', value: `\`#${member?.guild?.memberCount || '?'}\`` },
  ];

  return createLogCard({
    title: '📥 Member Joined',
    user,
    fields,
    color: 0x57F287,
  });
}

function buildMemberLeaveLog({ member, roles = [] }) {
  const user = member?.user || member;
  const nowUnix = Math.floor(Date.now() / 1000);
  const joinedUnix = member?.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
    : '`Unknown`';

  const roleText =
    roles.length > 0
      ? roles.map((r) => `<@&${r.id || r}>`).join(' ')
      : '`None`';

  const fields = [
    { label: 'Member', value: `<@${user.id}> (\`${user.username}\`)` },
    { label: 'User ID', value: `\`${user.id}\`` },
    { label: 'Joined Server', value: joinedUnix },
    { label: 'Roles', value: roleText.slice(0, 500) },
    { label: 'Left At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` },
    { label: 'Remaining Members', value: `\`${member?.guild?.memberCount || '?'}\`` },
  ];

  return createLogCard({
    title: '📤 Member Left',
    user,
    fields,
    color: 0xED4245,
  });
}

function buildBanLog({ user, executor = null, reason = null, isUnban = false }) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const fields = [
    { label: 'Target User', value: `<@${user.id}> (\`${user.username}\`)` },
    { label: 'User ID', value: `\`${user.id}\`` },
    { label: 'Moderator', value: executor ? `<@${executor.id}> (\`${executor.username}\`)` : '`Unknown / Audit`' },
  ];

  if (!isUnban) {
    fields.push({ label: 'Reason', value: `\`${reason || 'No reason provided'}\`` });
    fields.push({ label: 'Banned At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` });
  } else {
    fields.push({ label: 'Unbanned At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` });
  }

  return createLogCard({
    title: isUnban ? '🔓 Member Unbanned' : '🔨 Member Banned',
    user,
    fields,
    color: isUnban ? 0x57F287 : 0xED4245,
  });
}

function buildNicknameLog({ member, oldNick, newNick, executor = null }) {
  const user = member?.user || member;
  const nowUnix = Math.floor(Date.now() / 1000);

  const fields = [
    { label: 'Member', value: `<@${user.id}> (\`${user.username}\`)` },
    { label: 'User ID', value: `\`${user.id}\`` },
    { label: 'Old Nickname', value: `\`${oldNick || '(None)'}\`` },
    { label: 'New Nickname', value: `\`${newNick || '(None)'}\`` },
    { label: 'Changed At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` },
  ];

  if (executor && executor.id !== user.id) {
    fields.push({ label: 'Changed By', value: `<@${executor.id}> (\`${executor.username}\`)` });
  }

  return createLogCard({
    title: '📛 Nickname Changed',
    user,
    fields,
    color: 0x5865F2,
  });
}

function buildRoleUpdateLog({ member, added = [], removed = [], executor = null }) {
  const user = member?.user || member;
  const nowUnix = Math.floor(Date.now() / 1000);

  const fields = [
    { label: 'Member', value: `<@${user.id}> (\`${user.username}\`)` },
    { label: 'User ID', value: `\`${user.id}\`` },
  ];

  if (added.length > 0) {
    fields.push({ label: 'Roles Added', value: added.map((id) => `<@&${id}>`).join(' ') });
  }
  if (removed.length > 0) {
    fields.push({ label: 'Roles Removed', value: removed.map((id) => `<@&${id}>`).join(' ') });
  }

  if (executor) {
    fields.push({ label: 'Updated By', value: `<@${executor.id}> (\`${executor.username}\`)` });
  }

  fields.push({ label: 'Updated At', value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)` });

  return createLogCard({
    title: '🏷️ Member Roles Updated',
    user,
    fields,
    color: 0x5865F2,
  });
}

function buildVoiceLog({ member, action, channel, oldChannel = null, executor = null, details = null }) {
  const user = member?.user || member;
  const avatarUrl =
    typeof user?.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ dynamic: true, size: 256 })
      : null;

  let emoji = '🎙️';
  let color = 0x5865F2;
  let actionText = '';

  const userMention = `<@${user.id}>`;
  const channelMention = channel ? `<#${channel.id}>` : '`Unknown VC`';

  if (action === 'Joined Voice Channel') {
    emoji = '📥';
    color = 0x57F287; // Green
    actionText = `${emoji} ${userMention} joined voice channel ${channelMention}.`;
  } else if (action === 'Left Voice Channel') {
    emoji = '📤';
    color = 0xED4245; // Red
    actionText = `${emoji} ${userMention} left voice channel ${channelMention}.`;
  } else if (action === 'Voice Disconnected' || action === 'Disconnected from Voice Channel') {
    emoji = '🔌';
    color = 0xED4245; // Red
    if (executor && executor.id !== user.id) {
      actionText = `🔌 ${userMention} was disconnected from ${channelMention} by <@${executor.id}>.`;
    } else {
      actionText = `🔌 ${userMention} disconnected from voice channel ${channelMention}.`;
    }
  } else if (action === 'Switched Voice Channel' || action === 'Moved Voice Channel') {
    emoji = '🔀';
    color = 0x5865F2; // Blurple
    const oldMention = oldChannel ? `<#${oldChannel.id}>` : '`Unknown VC`';
    if (executor && executor.id !== user.id) {
      actionText = `${emoji} ${userMention} was moved from ${oldMention} to ${channelMention} by <@${executor.id}>.`;
    } else {
      actionText = `${emoji} ${userMention} moved from ${oldMention} to ${channelMention}.`;
    }
  } else if (action === 'Server Muted') {
    emoji = '🔇';
    color = 0xFEE75C; // Yellow
    if (executor && executor.id !== user.id) {
      actionText = `${emoji} ${userMention} was server muted in ${channelMention} by <@${executor.id}>.`;
    } else {
      actionText = `${emoji} ${userMention} was server muted in ${channelMention}.`;
    }
  } else if (action === 'Server Unmuted') {
    emoji = '🔊';
    color = 0x57F287; // Green
    if (executor && executor.id !== user.id) {
      actionText = `${emoji} ${userMention} was server unmuted in ${channelMention} by <@${executor.id}>.`;
    } else {
      actionText = `${emoji} ${userMention} was server unmuted in ${channelMention}.`;
    }
  } else if (action === 'Server Deafened') {
    emoji = '🛑';
    color = 0xED4245; // Red
    if (executor && executor.id !== user.id) {
      actionText = `${emoji} ${userMention} was server deafened in ${channelMention} by <@${executor.id}>.`;
    } else {
      actionText = `${emoji} ${userMention} was server deafened in ${channelMention}.`;
    }
  } else if (action === 'Server Undeafened') {
    emoji = '🎧';
    color = 0x57F287; // Green
    if (executor && executor.id !== user.id) {
      actionText = `${emoji} ${userMention} was server undeafened in ${channelMention} by <@${executor.id}>.`;
    } else {
      actionText = `${emoji} ${userMention} was server undeafened in ${channelMention}.`;
    }
  } else {
    actionText = `${emoji} ${userMention}: \`${action}\` in ${channelMention}.`;
  }

  let idsBlock = `**IDs**\n> 👤 ${userMention} ( \`${user.id}\` )`;
  if (channel) {
    idsBlock += `\n> 🔊 ${channelMention} ( \`${channel.id}\` )`;
  }
  if (oldChannel && oldChannel.id !== channel?.id) {
    idsBlock += `\n> 🔊 <#${oldChannel.id}> ( \`${oldChannel.id}\` )`;
  }
  if (executor && executor.id !== user.id) {
    idsBlock += `\n> 🛡️ <@${executor.id}> ( \`${executor.id}\` )`;
  }

  const description = `${actionText}\n\n${idsBlock}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setFooter({ text: `User ID: ${user.id}` })
    .setTimestamp();

  if (user?.username) {
    embed.setAuthor({
      name: `${user.tag || user.username}`,
      iconURL: avatarUrl || undefined,
    });
    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }
  }

  return embed;
}

module.exports = {
  createLogCard,
  buildMessageDeleteLog,
  buildMessageEditLog,
  buildMemberJoinLog,
  buildMemberLeaveLog,
  buildBanLog,
  buildNicknameLog,
  buildRoleUpdateLog,
  buildVoiceLog,
};
