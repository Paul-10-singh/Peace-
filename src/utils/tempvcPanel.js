/*
 * Per-room temporary voice control panel.
 */
const {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { get, set } = require('./settings');

function getRoom(guildId, voiceId) {
  return get(guildId, 'tempvc').rooms?.[voiceId] || null;
}

function saveRoom(guildId, voiceId, room) {
  const config = get(guildId, 'tempvc');
  config.rooms = config.rooms || {};
  config.rooms[voiceId] = room;
  set(guildId, 'tempvc', config);
}

function removeRoom(guildId, voiceId) {
  const config = get(guildId, 'tempvc');
  if (!config.rooms?.[voiceId]) return;
  delete config.rooms[voiceId];
  set(guildId, 'tempvc', config);
}

function panelPayload(voice, ownerId) {
  const owner = voice.guild.members.cache.get(ownerId);
  const roomName = voice.name.replace(/^🔊/, '').trim();
  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('**Control Panel**')
    .setDescription(
      `• **Owner:** <@${ownerId}>${owner ? ` (${owner.user.tag})` : ''}\n` +
      `• **Channel:** ${voice}\n\n` +
      '**Use the menus below to set up your Private Channel.**'
    )
    .setFooter({ text: `Room: ${roomName}` });

  const settings = new StringSelectMenuBuilder()
    .setCustomId(`tempvc:settings:${voice.id}`)
    .setPlaceholder('Room Settings (Name, Limit, Bitrate...)')
    .addOptions(
      { label: 'Rename Channel', value: 'rename', description: 'Set a new name for your voice room' },
      { label: 'Set User Limit', value: 'limit', description: 'Change maximum member limit (0-99)' },
      { label: 'Set Channel Status', value: 'status', description: 'Set or clear the voice status message' },
      { label: 'Game Activity Name', value: 'activity', description: 'Set a room activity name' },
      { label: 'Set Bitrate', value: 'bitrate', description: 'Change channel audio bitrate' },
      { label: 'Voice Region', value: 'region', description: 'Change the voice server region' },
      { label: 'Toggle NSFW', value: 'nsfw', description: 'Toggle the 18+ NSFW restriction' },
      { label: 'Claim Ownership', value: 'claim', description: 'Claim a room whose owner has left' }
    );

  const moderation = new StringSelectMenuBuilder()
    .setCustomId(`tempvc:moderation:${voice.id}`)
    .setPlaceholder('Permissions & Moderation (Lock, Hide...)')
    .addOptions(
      { label: 'Lock Channel', value: 'lock', description: 'Prevent everyone from connecting' },
      { label: 'Unlock Channel', value: 'unlock', description: 'Allow everyone to connect' },
      { label: 'Hide Channel', value: 'hide', description: 'Hide channel from everyone' },
      { label: 'Show Channel', value: 'show', description: 'Make channel visible to everyone' },
      { label: 'Permit User', value: 'permit', description: 'Allow a specific user to join and view' },
      { label: 'Reject Member', value: 'reject', description: 'Disconnect and block a member in this VC' },
      { label: 'Invite User', value: 'invite', description: 'Send a private room invite' },
      { label: 'Transfer Ownership', value: 'transfer', description: 'Transfer room ownership to another member' }
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(settings),
      new ActionRowBuilder().addComponents(moderation),
    ],
  };
}

function isOwner(interaction, voiceId) {
  return getRoom(interaction.guild.id, voiceId)?.ownerId === interaction.user.id;
}

function roomModal(action, voiceId) {
  const labels = {
    rename: ['Channel name', 'channel_name', 'Enter the new channel name'],
    limit: ['User limit', 'user_limit', 'Enter a number from 0 to 99'],
    status: ['Channel status', 'channel_status', 'Enter a status, or clear to remove it'],
    activity: ['Activity name', 'activity_name', 'Enter the activity name, or clear to remove it'],
    bitrate: ['Bitrate', 'bitrate', 'Enter bitrate in kbps, for example 64'],
    region: ['Voice region', 'voice_region', 'Enter a region such as singapore, or auto'],
    permit: ['User ID', 'user_id', 'Enter the Discord user ID to permit'],
    reject: ['User ID', 'user_id', 'Enter the Discord user ID to reject'],
    invite: ['User ID', 'user_id', 'Enter the Discord user ID to invite'],
    transfer: ['New owner user ID', 'user_id', 'Enter the Discord user ID of the new owner'],
  };
  const [label, inputId, placeholder] = labels[action];
  return new ModalBuilder()
    .setCustomId(`tempvc:modal:${action}:${voiceId}`)
    .setTitle(label)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(inputId)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(placeholder)
          .setRequired(true)
          .setMaxLength(100)
      )
    );
}

async function replyError(interaction, content) {
  return interaction.reply({ content, ephemeral: true });
}

async function setVoiceStatus(voice, status) {
  return voice.client.rest.put(`/channels/${voice.id}/voice-status`, { body: { status } });
}

async function handleModal(interaction) {
  const [, , action, voiceId] = interaction.customId.split(':');
  const room = getRoom(interaction.guild.id, voiceId);
  const voice = interaction.guild.channels.cache.get(voiceId);
  if (!room || !voice) return replyError(interaction, 'This temporary room no longer exists.');
  if (!isOwner(interaction, voiceId)) return replyError(interaction, 'Only the room owner can use this panel.');

  const value = interaction.fields.getTextInputValue(action === 'rename' ? 'channel_name' : action === 'limit' ? 'user_limit' : action === 'status' ? 'channel_status' : action === 'activity' ? 'activity_name' : action === 'bitrate' || action === 'region' ? action === 'bitrate' ? 'bitrate' : 'voice_region' : 'user_id').trim();
  try {
    if (action === 'rename') {
      await voice.setName(value.slice(0, 100), 'Temp room owner control');
      return replyError(interaction, 'Channel renamed.');
    }
    if (action === 'limit') {
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 0 || limit > 99) return replyError(interaction, 'User limit must be a whole number from 0 to 99.');
      await voice.setUserLimit(limit, 'Temp room owner control');
      return replyError(interaction, `User limit set to ${limit === 0 ? 'unlimited' : limit}.`);
    }
    if (action === 'status' || action === 'activity') {
      const status = value.toLowerCase() === 'clear' ? null : value.slice(0, 500);
      await setVoiceStatus(voice, status);
      return replyError(interaction, `${action === 'status' ? 'Channel status' : 'Activity name'} updated.`);
    }
    if (action === 'bitrate') {
      const bitrate = Number(value);
      if (!Number.isInteger(bitrate) || bitrate < 8 || bitrate > 384) return replyError(interaction, 'Bitrate must be between 8 and 384 kbps.');
      await voice.setBitrate(bitrate * 1000, 'Temp room owner control');
      return replyError(interaction, 'Bitrate updated.');
    }
    if (action === 'region') {
      await voice.setRTCRegion(value.toLowerCase() === 'auto' ? null : value.toLowerCase(), 'Temp room owner control');
      return replyError(interaction, 'Voice region updated.');
    }

    const target = await interaction.guild.members.fetch(value).catch(() => null);
    if (!target) return replyError(interaction, 'That user was not found in this server.');
    if (action === 'permit') {
      await voice.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true }, { reason: 'Temp room owner permit' });
      return replyError(interaction, `${target.user.tag} can now view and join the room.`);
    }
    if (action === 'reject') {
      if (target.voice.channelId === voice.id) await target.voice.disconnect('Temp room owner reject').catch(() => {});
      await voice.permissionOverwrites.edit(target.id, { ViewChannel: false, Connect: false }, { reason: 'Temp room owner reject' });
      return replyError(interaction, `${target.user.tag} was rejected from the room.`);
    }
    if (action === 'invite') {
      const invite = await voice.createInvite({ maxAge: 86400, maxUses: 1, unique: true, reason: 'Temp room owner invite' });
      await target.send(`You were invited to **${voice.name}** in **${voice.guild.name}**:\n${invite.url}`);
      return replyError(interaction, `Invite sent to ${target.user.tag}.`);
    }
    if (action === 'transfer') {
      saveRoom(interaction.guild.id, voiceId, { ...room, ownerId: target.id });
      return replyError(interaction, `Room ownership transferred to ${target.user.tag}.`);
    }
  } catch (error) {
    return replyError(interaction, `Could not update the room: ${error.message}`);
  }
}

async function handlePanel(interaction) {
  const [, kind, voiceId] = interaction.customId.split(':');
  const room = getRoom(interaction.guild.id, voiceId);
  const voice = interaction.guild.channels.cache.get(voiceId);
  if (!room || !voice) return interaction.reply({ content: 'This temporary room no longer exists.', ephemeral: true });
  const action = interaction.values?.[0];
  if (!isOwner(interaction, voiceId) && action !== 'claim') {
    return interaction.reply({ content: 'Only the room owner can use this panel.', ephemeral: true });
  }
  if (action === 'lock' || action === 'unlock') {
    await voice.permissionOverwrites.edit(interaction.guild.id, { Connect: action === 'unlock' }).catch(() => {});
    return interaction.reply({ content: action === 'lock' ? 'Room locked.' : 'Room unlocked.', ephemeral: true });
  }
  if (action === 'hide' || action === 'show') {
    await voice.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: action === 'show' }).catch(() => {});
    return interaction.reply({ content: action === 'hide' ? 'Room hidden.' : 'Room visible again.', ephemeral: true });
  }
  if (action === 'nsfw') {
    await voice.setNSFW(!voice.nsfw, 'Temp room owner control').catch(() => {});
    return interaction.reply({ content: `NSFW mode ${voice.nsfw ? 'enabled' : 'disabled'}.`, ephemeral: true });
  }
  if (['rename', 'limit', 'status', 'activity', 'bitrate', 'region', 'permit', 'reject', 'invite', 'transfer'].includes(action)) {
    return interaction.showModal(roomModal(action, voiceId));
  }
  if (action === 'claim') {
    if (voice.members.has(room.ownerId)) return interaction.reply({ content: 'The current owner is still in the room.', ephemeral: true });
    saveRoom(interaction.guild.id, voiceId, { ...room, ownerId: interaction.user.id });
    return interaction.reply({ content: 'You are now the room owner.', ephemeral: true });
  }
  return interaction.reply({ content: `Use the room command for **${action}**. More controls are ready to configure.`, ephemeral: true });
}

module.exports = { getRoom, saveRoom, removeRoom, panelPayload, handlePanel, handleModal };