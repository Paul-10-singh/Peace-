/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Unified SECURITY PANEL system.
 *
 * Every protection (/security, /antilink, /antinuke, /antispam, /antiwords,
 * /antibot, /antiraid, /scamdetect) opens an interactive PANEL instead of
 * raw subcommands: status embed + buttons / menus / modals to configure it.
 *
 * Custom IDs (all prefixed `sec:`):
 *   sec:refresh:<key>            - re-render a panel with fresh state
 *   sec:toggle:<key>:<on|off>    - flip a protection / master switch
 *   sec:open:<key>               - render a specific protection panel
 *   sec:nav                      - /security dashboard cross-navigation
 *   sec:set:antiNuke:<field>     - select menu (punishment / lockdown)
 *   sec:pick:<key>:<kind>        - select menu that mutates (remove domain/word/role)
 *   sec:modal:<key>:<kind>       - opens a config modal (domain/word/settings/...)
 *   sec:add:<key>:<kind>         - modal submit handler
 *   sec:list:<key>               - ephemeral full listing
 */
const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { get, set, getList, addToList, removeFromList } = require('./settings');
const { infoEmbed, successEmbed } = require('./decorations');
const { chunkFieldValue } = require('./helpers');
const { hasAccess } = require('./permissions');

// Ordered navigation list (used by the /security dashboard selector).
const ORDER = [
  { key: 'security', label: 'Security (master switch)' },
  { key: 'antiLink', label: 'Anti-Link' },
  { key: 'antiNuke', label: 'Anti-Nuke' },
  { key: 'antiSpam', label: 'Anti-Spam' },
  { key: 'antiWords', label: 'Blocked Words' },
  { key: 'antiBot', label: 'Anti-Bot' },
  { key: 'antiRaid', label: 'Anti-Raid' },
  { key: 'scamDetect', label: 'Scam Detect' },
];

const KEY_TO_COMMAND = {
  security: 'security',
  antiLink: 'antilink',
  antiNuke: 'antinuke',
  antiSpam: 'antispam',
  antiWords: 'antiwords',
  antiBot: 'antibot',
  antiRaid: 'antiraid',
  scamDetect: 'scamdetect',
};

// **[ ON ]** / **[ OFF ]** — bold, no emoji
const fmt = (v) => (v ? '**[ ON ]**' : '**[ OFF ]**');

// btn() — no emoji parameter. Only Danger style for destructive actions.
function btn(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function opts(list, limit = 25) {
  return list.slice(0, limit).map((v) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(String(v).length > 80 ? `${String(v).slice(0, 77)}...` : String(v))
      .setValue(String(v))
  );
}

function selectRow(customId, options, placeholder) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options)
  );
}

// pickRow() — omit the select menu entirely when there are no options
// (Discord requires a select to have between 1 and 25 options).
function pickRow(customId, list, placeholder) {
  if (!list.length) return null;
  return selectRow(customId, opts(list), placeholder);
}

// Status embed per protection — clean, bold key values, no emojis
function statusEmbed(key, cfg) {
  switch (key) {
    case 'security':
      return infoEmbed({
        title: 'Security Dashboard',
        description:
          `**Master Switch:** ${fmt(cfg.enabled)}\n` +
          `**Punishment:** \`${cfg.action || 'warn'}\` — auto-timeout after **${cfg.warnThreshold ?? 3}** warnings.\n` +
          'Navigate to any protection using the menu below.',
        fields: [
          { name: 'Anti-Link',        value: fmt(cfg.antiLink?.enabled),          inline: true },
          { name: 'Scam Detect',      value: fmt(cfg.antiLink?.blockScam !== false), inline: true },
          { name: 'Anti-Nuke',        value: fmt(cfg.antiNuke?.enabled),           inline: true },
          { name: 'Anti-Spam',        value: fmt(cfg.antiSpam?.enabled),           inline: true },
          { name: 'Anti-Bot',         value: fmt(cfg.antiBot?.enabled),            inline: true },
          { name: 'Anti-Raid',        value: fmt(cfg.antiRaid?.enabled),           inline: true },
          { name: 'Blocked Words',    value: `${(cfg.words || []).length}`,        inline: true },
          { name: 'Whitelisted Users', value: `${(cfg.whitelist || []).length}`,   inline: true },
        ],
      });

    case 'antiLink': {
      const allow = cfg.antiLink?.allow || [];
      return infoEmbed({
        title: 'Anti-Link Configuration',
        description:
          `**Status:** ${fmt(cfg.antiLink?.enabled)} link blocking (allow-list bypass only)\n` +
          `**Scam Detect:** ${fmt(cfg.antiLink?.blockScam !== false)} automatic scam-link blocking\n` +
          `**Allowed Domains:** ${allow.length}`,
        fields: [
          { name: 'Allowed Domains', value: allow.length ? allow.slice(0, 10).map((d) => `\`${d}\``).join(' ') : '*none*', inline: false },
        ],
      });
    }

    case 'antiNuke': {
      const n = cfg.antiNuke || {};
      const roles = n.whitelistRoles || [];
      return infoEmbed({
        title: 'Anti-Nuke Configuration',
        description:
          `**Status:** ${fmt(n.enabled)} instant-action anti-nuke\n` +
          `**Punishment:** \`${(n.punishment || 'ban').toUpperCase()}\`\n` +
          `**Auto-Lockdown:** ${fmt(n.lockdown !== false)}`,
        fields: [
          { name: 'Bypass Roles', value: roles.length ? roles.slice(0, 8).map((id) => `<@&${id}>`).join(' ') : '*none*', inline: false },
        ],
      });
    }

    case 'antiSpam': {
      const s = cfg.antiSpam || {};
      return infoEmbed({
        title: 'Anti-Spam Configuration',
        description:
          `**Status:** ${fmt(s.enabled)} spam protection\n` +
          `**Limit:** max **${s.maxMessages ?? 5}** messages per **${((s.intervalMs ?? 5000) / 1000).toFixed(0)}s** window.`,
      });
    }

    case 'antiWords': {
      const words = cfg.words || [];
      return infoEmbed({
        title: 'Blocked Words Configuration',
        description:
          `**Blocked Words:** ${words.length}` +
          (!words.length ? ' — Add words using the button below.' : ''),
        fields: words.length
          ? chunkFieldValue(words.slice(0, 40).map((w) => `\`${w}\``)).map((value, i) => ({
              name: i === 0 ? 'Blocked Words' : 'Blocked (cont.)',
              value,
            }))
          : [],
      });
    }

    case 'antiBot':
      return infoEmbed({
        title: 'Anti-Bot Configuration',
        description:
          `**Status:** ${fmt(cfg.antiBot?.enabled)} unauthorized bot additions are kicked instantly.\n` +
          '**Bypass:** Owners and whitelisted users are always exempt.',
      });

    case 'antiRaid': {
      const r = cfg.antiRaid || {};
      return infoEmbed({
        title: 'Anti-Raid Configuration',
        description:
          `**Status:** ${fmt(r.enabled)} sudden join floods lock the server.\n` +
          `**Trigger:** **${r.maxJoins ?? 8}** joins within **${((r.windowMs ?? 10000) / 1000).toFixed(0)}s**\n` +
          '**Action:** Text channels lock for 10 minutes, then auto-unlock.',
      });
    }

    case 'scamDetect':
      return infoEmbed({
        title: 'Scam Detect Configuration',
        description:
          `**Status:** ${fmt(cfg.antiLink?.blockScam !== false)} automatic scam-link blocking\n` +
          `**Banner:** ${cfg.scamImage ? '`set`' : '*(none — add an image below)*'}`,
        image: cfg.scamImage || null,
      });

    default:
      return infoEmbed({ title: 'Security' });
  }
}

// Action rows per protection — Secondary for all, Danger only for OFF/Remove/Delete
function actionRows(key, cfg, guild) {
  const navRow = () =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('sec:nav')
        .setPlaceholder('Open another protection...')
        .addOptions(
          ORDER.map((p) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(p.label)
              .setValue(p.key)
              .setDescription(`Open the ${p.label} panel`)
          )
        )
    );

  // ON = Secondary (gray), OFF = Danger (red), Refresh = Secondary (gray)
  const switchRow = (onId, offId, onLabel = 'Enable', offLabel = 'Disable') =>
    new ActionRowBuilder().addComponents(
      btn(onId,                    onLabel,   ButtonStyle.Secondary),
      btn(offId,                   offLabel,  ButtonStyle.Danger),
      btn(`sec:refresh:${key}`,    'Refresh', ButtonStyle.Secondary)
    );

  switch (key) {
    case 'security':
      return [
        switchRow('sec:toggle:security:on', 'sec:toggle:security:off', 'Master ON', 'Master OFF'),
        new ActionRowBuilder().addComponents(
          btn('sec:modal:security:policy', 'Set Punishment / Threshold', ButtonStyle.Secondary)
        ),
        navRow(),
      ];

    case 'antiLink':
      return [
        switchRow('sec:toggle:antiLink:on', 'sec:toggle:antiLink:off'),
        new ActionRowBuilder().addComponents(
          btn('sec:modal:antiLink:domain', 'Allow Domain',   ButtonStyle.Secondary),
          btn('sec:list:antiLink',         'List Domains',   ButtonStyle.Secondary)
        ),
        pickRow('sec:pick:antiLink:domain', (cfg.antiLink?.allow || []).map((d) => `\`${d}\``), 'Remove an allowed domain...'),
        new ActionRowBuilder().addComponents(
          btn('sec:toggle:antiLink:scamon',  'Scam Detect ON',  ButtonStyle.Secondary),
          btn('sec:toggle:antiLink:scamoff', 'Scam Detect OFF', ButtonStyle.Danger)
        ),
        navRow(),
      ].filter(Boolean);

    case 'antiNuke': {
      const n = cfg.antiNuke || {};
      const whitelist = n.whitelistRoles || [];
      const rows = [
        switchRow('sec:toggle:antiNuke:on', 'sec:toggle:antiNuke:off'),
        selectRow('sec:set:antiNuke:punishment', [
          new StringSelectMenuOptionBuilder().setLabel('Ban').setValue('ban'),
          new StringSelectMenuOptionBuilder().setLabel('Kick').setValue('kick'),
          new StringSelectMenuOptionBuilder().setLabel('Timeout (1h)').setValue('timeout'),
        ], 'Set Punishment...'),
        selectRow('sec:set:antiNuke:lockdown', [
          new StringSelectMenuOptionBuilder().setLabel('Auto-Lockdown ON').setValue('on'),
          new StringSelectMenuOptionBuilder().setLabel('Auto-Lockdown OFF').setValue('off'),
        ], 'Set Auto-Lockdown...'),
      ];

      const addable = [...guild.roles.cache.values()].filter(
        (r) => r.editable && !whitelist.includes(r.id)
      );
      if (addable.length) {
        rows.push(selectRow('sec:pick:antiNuke:addrole', opts(addable.map((r) => `@${r.name} (${r.id})`)), 'Add Bypass Role...'));
      }
      if (whitelist.length) {
        rows.push(selectRow(
          'sec:pick:antiNuke:role',
          opts(whitelist.map((id) => `@${(guild.roles.cache.get(id) || {}).name || id} (${id})`)),
          'Remove Bypass Role...'
        ));
      }

      if (rows.length < 5) rows.push(navRow());
      return rows.slice(0, 5);
    }

    case 'antiSpam':
      return [
        switchRow('sec:toggle:antiSpam:on', 'sec:toggle:antiSpam:off'),
        new ActionRowBuilder().addComponents(
          btn('sec:modal:antiSpam:settings', 'Configure Limits', ButtonStyle.Secondary)
        ),
        navRow(),
      ];

    case 'antiWords':
      return [
        new ActionRowBuilder().addComponents(
          btn('sec:modal:antiWords:word',  'Add Word',   ButtonStyle.Secondary),
          btn('sec:list:antiWords',        'List Words', ButtonStyle.Secondary),
          btn('sec:refresh:antiWords',     'Refresh',    ButtonStyle.Secondary)
        ),
        pickRow('sec:pick:antiWords:word', (cfg.words || []).map((w) => `\`${w}\``), 'Remove a blocked word...'),
        navRow(),
      ].filter(Boolean);

    case 'antiBot':
      return [
        switchRow('sec:toggle:antiBot:on', 'sec:toggle:antiBot:off'),
        navRow(),
      ];

    case 'antiRaid':
      return [
        switchRow('sec:toggle:antiRaid:on', 'sec:toggle:antiRaid:off'),
        new ActionRowBuilder().addComponents(
          btn('sec:modal:antiRaid:settings', 'Configure Limits', ButtonStyle.Secondary)
        ),
        navRow(),
      ];

    case 'scamDetect':
      return [
        switchRow('sec:toggle:scamDetect:on', 'sec:toggle:scamDetect:off', 'Scam Detect ON', 'Scam Detect OFF'),
        new ActionRowBuilder().addComponents(
          btn('sec:modal:scamDetect:banner', 'Set Banner Image', ButtonStyle.Secondary),
          btn('sec:del:scamDetect:banner',   'Remove Banner',    ButtonStyle.Danger)
        ),
        navRow(),
      ];

    default:
      return [navRow()];
  }
}

function panelPayload(interaction, key) {
  const cfg = get(interaction.guild.id, 'security');
  return {
    embeds: [statusEmbed(key, cfg)],
    components: actionRows(key, cfg, interaction.guild),
  };
}

function openPanel(interaction, key) {
  return interaction.reply({ ...panelPayload(interaction, key), flags: MessageFlags.Ephemeral });
}

function mutate(guildId, fn) {
  const cfg = get(guildId, 'security');
  fn(cfg);
  set(guildId, 'security', cfg);
}

// Only users allowed to run the matching slash command may use a panel.
function canUse(interaction, key) {
  return hasAccess(interaction.user, interaction.guild, KEY_TO_COMMAND[key] || key);
}

// Component dispatcher
async function handleComponent(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('sec:')) return false;

  const parts = id.split(':');
  const kind = parts[1];
  const use = kind === 'nav' ? (interaction.values?.[0] || 'security') : parts[2] || 'security';

  if (!canUse(interaction, use)) {
    await interaction
      .reply({ content: 'You do not have permission to use this panel.', flags: MessageFlags.Ephemeral })
      .catch(() => {});
    return true;
  }

  if (kind === 'nav' || kind === 'refresh' || kind === 'open') {
    await interaction.update(panelPayload(interaction, use)).catch(() => {});
    return true;
  }

  if (kind === 'list') {
    const cfg = get(interaction.guild.id, 'security');
    const items = use === 'antiWords' ? (cfg.words || []) : (cfg.antiLink?.allow || []);
    const title = use === 'antiWords' ? 'Blocked Words' : 'Allow-Listed Domains';
    await interaction
      .reply({
        embeds: [infoEmbed({ title, description: items.length ? items.map((d) => `\`${d}\``).join(', ') : '*(nothing yet)*' })],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return true;
  }

  if (kind === 'toggle') {
    const value = parts[3];
    mutate(interaction.guild.id, (cfg) => {
      if (use === 'security') cfg.enabled = value === 'on';
      if (use === 'antiLink') {
        cfg.antiLink = cfg.antiLink || { enabled: false, allow: [], blockScam: true };
        if (value === 'scamon') cfg.antiLink.blockScam = true;
        else if (value === 'scamoff') cfg.antiLink.blockScam = false;
        else cfg.antiLink.enabled = value === 'on';
      }
      if (use === 'antiNuke') {
        cfg.antiNuke = cfg.antiNuke || {};
        cfg.antiNuke.enabled = value === 'on';
      }
      if (use === 'antiSpam') {
        cfg.antiSpam = {
          enabled: value === 'on',
          maxMessages: cfg.antiSpam?.maxMessages || 5,
          intervalMs: cfg.antiSpam?.intervalMs || 5000,
        };
      }
      if (use === 'antiBot') cfg.antiBot = { enabled: value === 'on' };
      if (use === 'antiRaid') {
        cfg.antiRaid = { enabled: value === 'on', maxJoins: cfg.antiRaid?.maxJoins || 8, windowMs: cfg.antiRaid?.windowMs || 10000 };
      }
      if (use === 'scamDetect') {
        cfg.antiLink = cfg.antiLink || { enabled: false, allow: [], blockScam: true };
        cfg.antiLink.blockScam = value === 'on';
      }
    });
    await interaction.update(panelPayload(interaction, use)).catch(() => {});
    return true;
  }

  if (kind === 'set') {
    const field = parts[3];
    const value = interaction.values?.[0];
    mutate(interaction.guild.id, (cfg) => {
      cfg.antiNuke = cfg.antiNuke || {};
      if (field === 'punishment') cfg.antiNuke.punishment = value;
      if (field === 'lockdown') cfg.antiNuke.lockdown = value === 'on';
    });
    await interaction.update(panelPayload(interaction, use)).catch(() => {});
    return true;
  }

  if (kind === 'del' && use === 'scamDetect' && parts[3] === 'banner') {
    mutate(interaction.guild.id, (cfg) => { delete cfg.scamImage; });
    await interaction.update(panelPayload(interaction, use)).catch(() => {});
    return true;
  }

  if (kind === 'modal') {
    const modal = new ModalBuilder().setCustomId(`sec:add:${use}:${parts[3]}`);
    const input = (customId, label, value, max = 4000, placeholder) =>
      new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(value)
        .setMaxLength(max)
        .setPlaceholder(placeholder || '');
    const cfg = get(interaction.guild.id, 'security');
    const pair = `${use}-${parts[3]}`;

    if (pair === 'antiSpam-settings') {
      modal
        .setTitle('Anti-Spam Settings')
        .addComponents(
          new ActionRowBuilder().addComponents(input('sec_value_spammax', 'Max messages (2-20)', String(cfg.antiSpam?.maxMessages || 5), 2)),
          new ActionRowBuilder().addComponents(input('sec_value_spaminterval', 'Interval in seconds (1-30)', String((cfg.antiSpam?.intervalMs || 5000) / 1000), 2))
        );
    } else if (pair === 'antiRaid-settings') {
      modal
        .setTitle('Anti-Raid Settings')
        .addComponents(
          new ActionRowBuilder().addComponents(input('sec_value_raidmax', 'Max joins (3-100)', String(cfg.antiRaid?.maxJoins || 8), 3)),
          new ActionRowBuilder().addComponents(input('sec_value_raidwindow', 'Window in seconds (3-120)', String((cfg.antiRaid?.windowMs || 10000) / 1000), 3))
        );
    } else if (pair === 'security-policy') {
      modal
        .setTitle('Security Policy')
        .addComponents(
          new ActionRowBuilder().addComponents(input('sec_value_action', 'Punishment (warn / timeout / kick)', String(cfg.action || 'warn'), 10)),
          new ActionRowBuilder().addComponents(input('sec_value_threshold', 'Warnings before auto-timeout (1-10)', String(cfg.warnThreshold ?? 3), 2))
        );
    } else if (pair === 'scamDetect-banner') {
      modal
        .setTitle('Scam Detect Banner')
        .addComponents(
          new ActionRowBuilder().addComponents(
            input('sec_value_banner', 'Direct image URL', cfg.scamImage || '', 400, 'https://i.imgur.com/example.png')
          )
        );
    } else if (pair === 'antiLink-domain') {
      modal
        .setTitle('Allow Domain')
        .addComponents(
          new ActionRowBuilder().addComponents(input('sec_value_domain', 'Domain (no https://)', '', 200, 'youtube.com'))
        );
    } else if (pair === 'antiWords-word') {
      modal
        .setTitle('Block a Word')
        .addComponents(
          new ActionRowBuilder().addComponents(input('sec_value_word', 'Word or phrase to block', '', 200))
        );
    } else {
      return true;
    }
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (kind === 'add') {
    const pair = `${use}-${parts[3]}`;
    const cfg = get(interaction.guild.id, 'security');
    if (pair === 'antiSpam-settings') {
      const max = Math.max(2, Math.min(20, parseInt(interaction.fields.getTextInputValue('sec_value_spammax'), 10) || 5));
      const interval = Math.max(1, Math.min(30, parseInt(interaction.fields.getTextInputValue('sec_value_spaminterval'), 10) || 5));
      mutate(interaction.guild.id, (c) => { c.antiSpam = { enabled: c.antiSpam?.enabled ?? false, maxMessages: max, intervalMs: interval * 1000 }; });
    } else if (pair === 'antiRaid-settings') {
      const max = Math.max(3, Math.min(100, parseInt(interaction.fields.getTextInputValue('sec_value_raidmax'), 10) || 8));
      const window = Math.max(3, Math.min(120, parseInt(interaction.fields.getTextInputValue('sec_value_raidwindow'), 10) || 10));
      mutate(interaction.guild.id, (c) => { c.antiRaid = { enabled: c.antiRaid?.enabled ?? false, maxJoins: max, windowMs: window * 1000 }; });
    } else if (pair === 'security-policy') {
      const action = interaction.fields.getTextInputValue('sec_value_action').trim().toLowerCase();
      const threshold = Math.max(1, Math.min(10, parseInt(interaction.fields.getTextInputValue('sec_value_threshold'), 10) || 3));
      mutate(interaction.guild.id, (c) => {
        if (['warn', 'timeout', 'kick'].includes(action)) c.action = action;
        c.warnThreshold = threshold;
      });
    } else if (pair === 'scamDetect-banner') {
      const url = interaction.fields.getTextInputValue('sec_value_banner').trim();
      mutate(interaction.guild.id, (c) => { c.scamImage = url; });
    } else if (pair === 'antiLink-domain') {
      const domain = interaction.fields.getTextInputValue('sec_value_domain').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
      if (domain) mutate(interaction.guild.id, (c) => {
        c.antiLink = c.antiLink || { enabled: false, allow: [], blockScam: true };
        if (!(c.antiLink.allow || []).includes(domain)) c.antiLink.allow = [...(c.antiLink.allow || []), domain];
      });
    } else if (pair === 'antiWords-word') {
      const word = interaction.fields.getTextInputValue('sec_value_word').trim().toLowerCase();
      if (word) addToList(interaction.guild.id, 'security', 'words', word);
    }
    await interaction
      .reply({ embeds: [successEmbed({ description: '**Saved.**' })], flags: MessageFlags.Ephemeral })
      .catch(() => {});
    await interaction.followUp({ ...panelPayload(interaction, use), flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }

  if (kind === 'pick') {
    const what = parts[3];
    const item = interaction.values?.[0];
    if (what === 'addrole') {
      const roleId = /\((\d+)\)$/.exec(item)?.[1];
      if (roleId) {
        mutate(interaction.guild.id, (c) => {
          c.antiNuke = c.antiNuke || {};
          c.antiNuke.whitelistRoles = c.antiNuke.whitelistRoles || [];
          if (!c.antiNuke.whitelistRoles.includes(roleId)) c.antiNuke.whitelistRoles.push(roleId);
        });
      }
    } else if (use === 'antiNuke' && what === 'role') {
      const roleId = /\((\d+)\)$/.exec(item)?.[1];
      if (roleId) {
        mutate(interaction.guild.id, (c) => {
          c.antiNuke.whitelistRoles = (c.antiNuke.whitelistRoles || []).filter((rid) => rid !== roleId);
        });
      }
    } else if (use === 'antiWords' && what === 'word') {
      const word = (item || '').replace(/^`|`$/g, '');
      removeFromList(interaction.guild.id, 'security', 'words', word);
    } else if (use === 'antiLink' && what === 'domain') {
      const domain = (item || '').replace(/^`|`$/g, '');
      mutate(interaction.guild.id, (c) => {
        c.antiLink = c.antiLink || { enabled: false, allow: [], blockScam: true };
        c.antiLink.allow = (c.antiLink.allow || []).filter((d) => d !== domain);
      });
    }
    await interaction.update(panelPayload(interaction, use)).catch(() => {});
    return true;
  }

  return true;
}

module.exports = { openPanel, panelPayload, handleComponent, ORDER };