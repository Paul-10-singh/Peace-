/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /safety - master switch for EVERY automatic safety feature at once.
 *
 *   /safety on     -> turns on anti-spam, anti-link, scam detection,
 *                     anti-nuke and the blocked-words/profanity filter.
 *   /safety off    -> turns every one of them off (single command).
 *   /safety status -> prints each protection as a Protocol-status line.
 *
 * One command to arm everything, one command to disarm everything.
 * Equivalent per-feature commands (/antispam, /antilink, /scamdetect,
 * /antinuke, /security ...) still work for fine-tuning afterwards.
 */
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reply } = require('../../utils/helpers');
const { successEmbed, warningEmbed, infoEmbed } = require('../../utils/decorations');
const { get, set } = require('../../utils/settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('safety')
    .setDescription('Master switch: turn all safety protections ON or OFF with one command')
    .addSubcommand((s) => s.setName('on').setDescription('Turn on every safety protection'))
    .addSubcommand((s) => s.setName('off').setDescription('Turn off every safety protection'))
    .addSubcommand((s) => s.setName('status').setDescription('Show the status of every protection'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'on' || sub === 'off') {
      const enable = sub === 'on';
      const sec = get(guildId, 'security');
      const pro = get(guildId, 'profanity');

      // Master + every individual protection.
      sec.enabled = enable;
      sec.antiSpam = sec.antiSpam || {};
      sec.antiSpam.enabled = enable;
      sec.antiLink = sec.antiLink || {};
      sec.antiLink.enabled = enable;
      sec.antiLink.blockScam = enable;
      sec.antiNuke = sec.antiNuke || {};
      sec.antiNuke.enabled = enable;
      pro.enabled = enable;

      set(guildId, 'security', sec);
      set(guildId, 'profanity', pro);

      // The /safety master switch also arms/disarms the ten-layer platform.
      if (interaction.client.security?.disableAll && !enable) interaction.client.security.disableAll();
      if (interaction.client.security?.engine && enable) interaction.client.security.engine.enable();

      return reply(interaction, {
        embeds: [enable
          ? successEmbed({
              title: '🛡️ Safety ON — everything protected',
              description:
                'All automatic protections are now **enabled**:\n' +
                '• Anti-Spam\n• Anti-Link\n• Scam-Link Detection\n• Anti-Nuke (lockdown)\n• Blocked-Words / Profanity filter\n\n' +
                'Use `/safety off` to disable everything with one command.',
            })
          : warningEmbed({
              title: '⚠️ Safety OFF — protections disabled',
              description:
                'All automatic protections are now **disabled** (single command):\n' +
                '• Anti-Spam\n• Anti-Link\n• Scam-Link Detection\n• Anti-Nuke (lockdown)\n• Blocked-Words / Profanity filter',
            })],
      });
    }

    // status
    const sec = get(guildId, 'security');
    const pro = get(guildId, 'profanity');
    const fmt = (v) => (v ? '**[ON]**' : '**[OFF]**');
    const ln = (name, v) => `\`${name}\` : ${fmt(v)}`;

    const lines = [
      `Protocols Status:`,
      ln('Anti-Spam', sec.antiSpam?.enabled),
      ln('Anti-Link', sec.antiLink?.enabled),
      ln('Scam-Link Detection', sec.antiLink?.blockScam !== false && sec.enabled),
      ln('Anti-Nuke (lockdown)', sec.antiNuke?.enabled),
      ln('Blocked-Words / Profanity', pro.enabled),
      `────────────────────────────`,
      ln('Master (all protections)', sec.enabled),
    ];

    return reply(interaction, {
      embeds: [infoEmbed({
        title: '🛡️ Safety Status',
        description: lines.join('\n'),
        fields: [
          {
            name: 'Tips',
            value: '`/safety on` arms everything · `/safety off` disarms everything.\nFine-tune with `/antispam /antilink /scamdetect /antinuke /antiwords`.',
          },
        ],
      })],
    });
  },
};
