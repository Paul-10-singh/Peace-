/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
const { EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../utils/decorations');
const { sendLog } = require('../utils/logging');
const { get } = require('../utils/settings');
const { isOwner } = require('../utils/owners');
const snipe = require('../utils/snipe');

module.exports = {
  name: 'messageDelete',
  async execute(client, message) {
    if (!message.guild) return;

    // Reassign to the fully-fetched message so all properties below are populated.
    if (message.partial) {
      const fetched = await message.fetch().catch(() => null);
      if (!fetched) return;
      message = fetched;
    }

    if (message.author?.bot) return;

    snipe.capture(message);

    const cfg = get(message.guild.id, 'security');
    const mentions = message.mentions?.users?.filter((u) => !u.bot && u.id !== message.author.id);
    const hasMentions = mentions && mentions.size > 0;
    const isRecent = (Date.now() - (message.createdTimestamp || 0)) < 120000; // within 2 minutes

    // ── Anti-Ghost Ping ──────────────────────────────────────────────────
    if (hasMentions && isRecent && cfg?.antiGhostPing?.enabled) {
      const isPrivileged = isOwner(message.author.id, message.guild.id) ||
        message.member?.permissions?.has('ManageMessages') ||
        (cfg.whitelist || []).includes(message.author.id);

      if (!isPrivileged) {
        const victims = mentions.map((u) => `<@${u.id}>`).slice(0, 5).join(', ');
        const extra = mentions.size > 5 ? ` +${mentions.size - 5} more` : '';

        const ghostEmbed = new EmbedBuilder()
          .setColor(0xFF3366)
          .setAuthor({
            name: 'Ghost Ping Detected',
            iconURL: message.author.displayAvatarURL({ dynamic: true }) || null,
          })
          .setDescription(
            `👻 **${message.author.tag || message.author.username}** ghost-pinged ${victims}${extra} and deleted their message!`
          )
          .addFields([
            {
              name: '💬 Deleted Content',
              value: message.content ? (message.content.length > 500 ? message.content.slice(0, 500) + '...' : message.content) : '[No text content]',
            },
          ])
          .setFooter({ text: 'Peace✘ Anti-GhostPing' })
          .setTimestamp();

        await message.channel.send({ embeds: [ghostEmbed] }).catch(() => {});
      }
    }

    const content = message.content || '[embed/attachment only]';
    const logFields = [
      { name: 'Author', value: `${message.author.username} (<@${message.author.id}>)`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
    ];

    if (hasMentions) {
      logFields.push({
        name: '👻 Mentions (Ghost Ping)',
        value: mentions.map((u) => `<@${u.id}>`).slice(0, 8).join(', '),
        inline: false,
      });
    }

    const embed = errorEmbed({
      title: hasMentions ? 'Message Deleted (Ghost Ping)' : 'Message Deleted',
      description: content,
      fields: logFields,
      extra: `Message ID: ${message.id}`,
    });

    await sendLog(client, message.guild.id, 'message', { embeds: [embed] });
  },
};
