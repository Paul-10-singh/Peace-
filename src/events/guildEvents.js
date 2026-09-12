/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * guildCreate / guildDelete — DM the server owner when the bot joins or
 * leaves a server, styled like a premium bot welcome card.
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BRAND, FOOTER_TEXT } = require('../utils/decorations');

// Support server invite (optional — set SUPPORT_URL in .env)
function supportUrl() {
  return process.env.SUPPORT_URL || null;
}

function supportRow() {
  const url = supportUrl();
  if (!url) return null;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Support Server')
      .setURL(url)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🔗')
  );
}

module.exports = {
  events: {
    // ── Bot added to a server ──────────────────────────────────────────────
    async guildCreate(client, guild) {
      // Fetch full guild data (owner may not be cached yet)
      const fullGuild = await guild.fetch().catch(() => guild);
      const owner = await client.users.fetch(fullGuild.ownerId).catch(() => null);
      if (!owner) return;

      const embed = new EmbedBuilder()
        .setColor(BRAND.success)
        .setAuthor({
          name: client.user.username,
          iconURL: client.user.displayAvatarURL({ size: 128 }),
        })
        .setTitle('<:ticknew:1536133967709741086> Thank you for adding me!')
        .setDescription(
          `Hey **${owner.username}**! 👋\n\n` +
          `<:ticknew:1536133967709741086> **${client.user.username}** has been successfully added to **${guild.name}**.\n\n` +
          `> 📌 Use \`/help\` to explore all commands.\n` +
          `> ⚙️ Use \`/security\` to set up auto-moderation.\n` +
          `> 🎵 Use \`/play\` to start playing music.\n` +
          `> 🔧 Use \`/setlog\` to configure logging channels.`
        )
        .addFields(
          { name: '📊 Server', value: guild.name, inline: true },
          { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
          { name: '🌐 Support', value: supportUrl() ? `[Click here](${supportUrl()})` : 'Use `/support` inside your server', inline: true }
        )
        .setThumbnail(guild.iconURL({ size: 256 }) || null)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const components = supportRow() ? [supportRow()] : [];

      await owner.send({ embeds: [embed], components }).catch(() => {
        // DMs may be closed — silently ignore
      });
    },

    // ── Bot removed from a server ─────────────────────────────────────────
    async guildDelete(client, guild) {
      // guild.ownerId may still be available from cache
      if (!guild.ownerId) return;
      const owner = await client.users.fetch(guild.ownerId).catch(() => null);
      if (!owner) return;

      const embed = new EmbedBuilder()
        .setColor(BRAND.error)
        .setAuthor({
          name: client.user.username,
          iconURL: client.user.displayAvatarURL({ size: 128 }),
        })
        .setTitle('😔 I was removed from your server')
        .setDescription(
          `Hey **${owner.username}**,\n\n` +
          `<:wrongerror:1536133920989650989> **${client.user.username}** was removed from **${guild.name}**.\n\n` +
          `Sorry if I didn't meet your expectations! If you had any issues, please let us know so we can improve.\n\n` +
          `> 💬 Drop your feedback at our support server.\n` +
          `> 🔄 You can always **add me back** if you change your mind!`
        )
        .addFields(
          { name: '🏠 Server', value: guild.name, inline: true },
          { name: '📅 Left', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setThumbnail(guild.iconURL({ size: 256 }) || null)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        ...(supportUrl() ? [
          new ButtonBuilder()
            .setLabel('Support Server')
            .setURL(supportUrl())
            .setStyle(ButtonStyle.Link)
            .setEmoji('🔗'),
        ] : []),
        new ButtonBuilder()
          .setLabel('Add me back')
          .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)
          .setStyle(ButtonStyle.Link)
          .setEmoji('➕')
      );

      await owner.send({ embeds: [embed], components: [row] }).catch(() => {});
    },
  },
};
