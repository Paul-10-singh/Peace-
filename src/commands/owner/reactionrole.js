/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /reactionrole - Add, list, remove, scan, and sync reaction roles.
 */
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, loadingEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');
const { normalizeEmoji, buildKey } = require('../../events/reactionRoles');

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage and sync reaction roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    // ── add ──
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Bind an emoji to a role on a message')
        .addStringOption((o) => o.setName('message_id').setDescription('The ID of the message').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('The role to give').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('The emoji to react with').setRequired(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel of the message (defaults to current)'))
    )
    // ── list ──
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('List all configured reaction roles in this server')
    )
    // ── remove ──
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a reaction role binding')
        .addStringOption((o) => o.setName('message_id').setDescription('The ID of the message').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('The emoji to unbind').setRequired(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel of the message (defaults to current)'))
    )
    // ── sync ──
    .addSubcommand((s) =>
      s
        .setName('sync')
        .setDescription('Scan reactions on a message and assign roles to all members who reacted')
        .addStringOption((o) => o.setName('message_id').setDescription('The ID of the message to sync').setRequired(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel of the message (defaults to current)'))
        .addRoleOption((o) => o.setName('specific_role').setDescription('Optional: sync only this role'))
        .addStringOption((o) => o.setName('specific_emoji').setDescription('Optional: sync only this emoji'))
    )
    // ── scan ──
    .addSubcommand((s) =>
      s
        .setName('scan')
        .setDescription('Auto-detect roles and emojis from a message text and bind them automatically')
        .addStringOption((o) => o.setName('message_id').setDescription('The ID of the message to scan').setRequired(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel of the message (defaults to current)'))
        .addBooleanOption((o) => o.setName('auto_sync').setDescription('Also sync roles to members who already reacted?'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));

    if (!me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: 'I lack the **Manage Roles** permission.' })],
        ephemeral: true,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Subcommand: add
    // ─────────────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const messageId = interaction.options.getString('message_id');
      const role = interaction.options.getRole('role');
      const emojiStr = interaction.options.getString('emoji');
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      try {
        const message = await channel.messages.fetch(messageId);
        if (!message) throw new Error('Message not found');

        if (role.position >= me.roles.highest.position) {
          return reply(interaction, {
            embeds: [
              errorEmbed({
                description: `My highest role is below <@&${role.id}>. Move my role higher in Server Settings > Roles.`,
              }),
            ],
            ephemeral: true,
          });
        }

        const key = buildKey(channel.id, message.id, emojiStr);
        const list = get(guild.id, 'reactionroles') || [];
        const filtered = list.filter((e) => e.key !== key);
        filtered.push({ key, roleId: role.id });
        set(guild.id, 'reactionroles', filtered);

        // React to message if bot can
        try {
          await message.react(emojiStr);
        } catch {}

        return reply(interaction, {
          embeds: [
            successEmbed({
              title: 'Reaction Role Added',
              description: `Successfully bound ${emojiStr} to <@&${role.id}> on [this message](${message.url}).`,
            }),
          ],
        });
      } catch (err) {
        return reply(interaction, {
          embeds: [errorEmbed({ description: `Failed: ${err.message}` })],
          ephemeral: true,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Subcommand: list
    // ─────────────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const list = get(guild.id, 'reactionroles') || [];
      if (!list.length) {
        return reply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('Reaction Roles')
              .setDescription('No reaction roles are currently configured in this server.\nUse `/reactionrole add` or `/reactionrole scan` to configure one.'),
          ],
          ephemeral: true,
        });
      }

      const lines = list.map((item, idx) => {
        const parts = item.key.split(':');
        // parts: [channelId, messageId, emojiType, emojiVal]
        const channelId = parts[0];
        const messageId = parts[1];
        const emojiType = parts[2];
        const emojiVal = parts.slice(3).join(':');

        const emojiDisplay =
          emojiType === 'custom' ? `<:emoji:${emojiVal}>` : emojiVal;
        const msgLink = `https://discord.com/channels/${guild.id}/${channelId}/${messageId}`;

        return `\`${idx + 1}.\` ${emojiDisplay} ➔ <@&${item.roleId}> ([Message](${msgLink}))`;
      });

      return reply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`Reaction Roles (${list.length})`)
            .setDescription(lines.slice(0, 25).join('\n') + (lines.length > 25 ? `\n...and ${lines.length - 25} more` : '')),
        ],
        ephemeral: true,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Subcommand: remove
    // ─────────────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const messageId = interaction.options.getString('message_id');
      const emojiStr = interaction.options.getString('emoji');
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      const norm = normalizeEmoji(emojiStr);
      const list = get(guild.id, 'reactionroles') || [];
      const beforeCount = list.length;
      const filtered = list.filter((e) => {
        const parts = (e.key || '').split(':');
        if (parts.length >= 4) {
          const mId = parts[1];
          const emojiKey = `${parts[2]}:${parts[3]}`;
          if (mId === messageId && emojiKey === norm) return false;
        }
        return true;
      });

      if (filtered.length === beforeCount) {
        return reply(interaction, {
          embeds: [errorEmbed({ description: 'No matching reaction role binding found to remove.' })],
          ephemeral: true,
        });
      }

      set(guild.id, 'reactionroles', filtered);
      return reply(interaction, {
        embeds: [successEmbed({ title: 'Reaction Role Removed', description: `Removed binding for ${emojiStr} on message \`${messageId}\`.` })],
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Subcommand: sync (Give roles to all members who reacted)
    // ─────────────────────────────────────────────────────────────────────────
    if (sub === 'sync') {
      const messageId = interaction.options.getString('message_id');
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const specificRole = interaction.options.getRole('specific_role');
      const specificEmoji = interaction.options.getString('specific_emoji');

      await interaction.deferReply();

      let message;
      try {
        message = await channel.messages.fetch(messageId);
      } catch (err) {
        return interaction.editReply({
          embeds: [errorEmbed({ description: `Could not fetch message: ${err.message}` })],
        });
      }

      // Collect bindings to sync
      let bindingsToSync = [];
      const list = get(guild.id, 'reactionroles') || [];

      if (specificRole && specificEmoji) {
        // Direct manual sync for one role & emoji
        bindingsToSync.push({
          roleId: specificRole.id,
          emojiKey: normalizeEmoji(specificEmoji),
          emojiDisplay: specificEmoji,
        });
      } else {
        // Sync all bindings associated with this message
        for (const item of list) {
          const parts = item.key.split(':');
          if (parts.length >= 4 && parts[1] === message.id) {
            const emojiKey = `${parts[2]}:${parts[3]}`;
            const emojiDisplay = parts[2] === 'custom' ? `<:emoji:${parts[3]}>` : parts[3];
            bindingsToSync.push({
              roleId: item.roleId,
              emojiKey,
              emojiDisplay,
            });
          }
        }
      }

      if (!bindingsToSync.length) {
        return interaction.editReply({
          embeds: [
            errorEmbed({
              title: 'No Bindings Found',
              description:
                `No reaction role bindings are registered for message \`${messageId}\`.\n` +
                `Run \`/reactionrole scan message_id:${messageId}\` to auto-detect roles from the text, or \`/reactionrole add\` first!`,
            }),
          ],
        });
      }

      await interaction.editReply({
        embeds: [
          loadingEmbed({
            title: 'Syncing Reaction Roles...',
            description: `Scanning ${bindingsToSync.length} reaction bindings on [this message](${message.url})...`,
          }),
        ],
      });

      const report = [];
      let totalAssigned = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const b of bindingsToSync) {
        const role = guild.roles.cache.get(b.roleId) || (await guild.roles.fetch(b.roleId).catch(() => null));
        if (!role) {
          report.push(`⚠️ ${b.emojiDisplay}: Role ID \`${b.roleId}\` not found in server.`);
          continue;
        }

        if (role.position >= me.roles.highest.position) {
          report.push(`❌ ${b.emojiDisplay} <@&${role.id}>: Bot role is **below** this role in hierarchy!`);
          continue;
        }

        // Find the reaction on the message matching b.emojiKey
        const reactionObj = message.reactions.cache.find((r) => normalizeEmoji(r.emoji) === b.emojiKey);
        if (!reactionObj) {
          report.push(`ℹ️ ${b.emojiDisplay} <@&${role.id}>: No active reaction found on the message.`);
          continue;
        }

        // Fetch all users who reacted
        let users;
        try {
          users = await reactionObj.users.fetch();
        } catch {
          users = reactionObj.users.cache;
        }

        let assignedThis = 0;
        let alreadyHadThis = 0;

        for (const [userId, userObj] of users) {
          if (userObj.bot) continue;
          try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) continue;

            if (member.roles.cache.has(role.id)) {
              alreadyHadThis += 1;
              totalSkipped += 1;
            } else {
              await member.roles.add(role.id, 'Reaction role sync');
              assignedThis += 1;
              totalAssigned += 1;
            }
          } catch (err) {
            totalErrors += 1;
          }
        }

        report.push(`✅ ${b.emojiDisplay} <@&${role.id}>: **+${assignedThis}** given (had: ${alreadyHadThis})`);
      }

      const summaryEmbed = new EmbedBuilder()
        .setColor(totalAssigned > 0 ? 0x57f287 : 0x5865f2)
        .setTitle('Reaction Role Sync Completed')
        .setDescription(
          `**Results:**\n` +
          `• **New roles assigned:** \`${totalAssigned}\`\n` +
          `• **Already had role:** \`${totalSkipped}\`\n` +
          (totalErrors > 0 ? `• **Errors:** \`${totalErrors}\`\n` : '') +
          `\n**Details:**\n` +
          report.slice(0, 20).join('\n')
        )
        .setFooter({ text: 'Peace✘ • Role Management' })
        .setTimestamp();

      return interaction.editReply({ embeds: [summaryEmbed] });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Subcommand: scan (Auto-detect emojis & roles from message text)
    // ─────────────────────────────────────────────────────────────────────────
    if (sub === 'scan') {
      const messageId = interaction.options.getString('message_id');
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const autoSync = interaction.options.getBoolean('auto_sync') ?? true;

      await interaction.deferReply();

      let message;
      try {
        message = await channel.messages.fetch(messageId);
      } catch (err) {
        return interaction.editReply({
          embeds: [errorEmbed({ description: `Could not fetch message: ${err.message}` })],
        });
      }

      const content = message.content || '';
      const lines = content.split(/\r?\n/);
      const detected = [];

      // Fetch all server roles to match by name if not mentioned by ID
      const allRoles = await guild.roles.fetch();

      for (const line of lines) {
        if (!line.trim()) continue;

        // 1. Find role: either mention <@&ID> or name pattern like `@. Name .` or `@Name`
        let foundRole = null;
        const roleMentionMatch = line.match(/<@&(\d+)>/);
        if (roleMentionMatch) {
          foundRole = allRoles.get(roleMentionMatch[1]);
        } else {
          // Try `@. Role Name .` or `@Role Name`
          const namePattern = line.match(/@\.?\s*([^.\n\r]+?)\s*\.?$/);
          if (namePattern) {
            const rawName = namePattern[1].trim().toLowerCase();
            foundRole = allRoles.find(
              (r) =>
                r.name.toLowerCase() === rawName ||
                r.name.toLowerCase() === `. ${rawName} .` ||
                r.name.toLowerCase().replace(/[@. ]/g, '') === rawName.replace(/[@. ]/g, '')
            );
          }
        }

        if (!foundRole) continue;

        // 2. Find emoji on that line
        let emojiKey = null;
        let emojiDisplay = null;

        const customEmoji = line.match(/<a?:([\w~]+):(\d+)>/);
        if (customEmoji) {
          emojiKey = `custom:${customEmoji[2]}`;
          emojiDisplay = customEmoji[0];
        } else {
          const unicodeEmojis = line.match(/\p{Extended_Pictographic}/gu);
          if (unicodeEmojis && unicodeEmojis.length > 0) {
            const first = unicodeEmojis[0];
            emojiKey = `unicode:${first.replace(/[\uFE00-\uFE0F\u200D]/g, '').trim()}`;
            emojiDisplay = first;
          }
        }

        if (foundRole && emojiKey) {
          detected.push({
            role: foundRole,
            emojiKey,
            emojiDisplay,
          });
        }
      }

      if (!detected.length) {
        return interaction.editReply({
          embeds: [
            errorEmbed({
              title: 'No Role Lines Detected',
              description:
                `Could not auto-detect role mentions from message text.\n` +
                `You can manually bind them using: \`/reactionrole add message_id:${messageId} role:@role emoji:emoji\`.`,
            }),
          ],
        });
      }

      // Save detected bindings to settings
      const list = get(guild.id, 'reactionroles') || [];
      let newBindingsCount = 0;

      for (const d of detected) {
        const fullKey = `${channel.id}:${message.id}:${d.emojiKey}`;
        const existingIdx = list.findIndex((e) => e.key === fullKey);
        if (existingIdx !== -1) {
          list[existingIdx].roleId = d.role.id;
        } else {
          list.push({ key: fullKey, roleId: d.role.id });
          newBindingsCount += 1;
        }
      }
      set(guild.id, 'reactionroles', list);

      let syncReport = '';
      if (autoSync) {
        let assignedCount = 0;
        for (const d of detected) {
          if (d.role.position >= me.roles.highest.position) continue;
          const reactionObj = message.reactions.cache.find((r) => normalizeEmoji(r.emoji) === d.emojiKey);
          if (!reactionObj) continue;

          let users;
          try {
            users = await reactionObj.users.fetch();
          } catch {
            users = reactionObj.users.cache;
          }

          for (const [userId, userObj] of users) {
            if (userObj.bot) continue;
            try {
              const member = await guild.members.fetch(userId).catch(() => null);
              if (member && !member.roles.cache.has(d.role.id)) {
                await member.roles.add(d.role.id, 'Auto-scan reaction role sync');
                assignedCount += 1;
              }
            } catch {}
          }
        }
        syncReport = `\n🔄 **Auto-synced:** Assigned **${assignedCount}** missing roles to members who reacted!`;
      }

      const linesPreview = detected
        .slice(0, 15)
        .map((d) => `• ${d.emojiDisplay} ➔ <@&${d.role.id}>`)
        .join('\n');

      return interaction.editReply({
        embeds: [
          successEmbed({
            title: 'Auto-Scan Complete!',
            description:
              `Successfully detected and bound **${detected.length}** reaction roles for [this message](${message.url})!\n\n` +
              linesPreview +
              (detected.length > 15 ? `\n...and ${detected.length - 15} more` : '') +
              `\n${syncReport}`,
          }),
        ],
      });
    }
  },
};
