import { describe, it, expect, vi } from 'vitest';
const {
  resolveGuildLinks,
  formatDmText,
  buildWelcomeDMPayload,
  buildWelcomeDmModal,
} = require('../src/utils/welcome');
const welcomeCommand = require('../src/commands/owner/welcome');
const { get, set } = require('../src/utils/settings');

describe('Multi-Server Dynamic Welcome DM System', () => {
  const mockUser = {
    id: '1202689641757806602',
    username: 'ACE',
    displayName: 'ACE',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1202689641757806602/avatar.png',
  };

  const mockGuildB = {
    id: '999111222333444555',
    name: 'Server B Gaming',
    memberCount: 250,
    vanityURLCode: 'serverb',
    iconURL: () => 'https://cdn.discordapp.com/icons/999111222333444555/icon.png',
    channels: {
      cache: new Map([
        ['ch_rules_b', { id: 'ch_rules_b', name: '📜-rules-and-info', type: 0, isTextBased: () => true }],
        ['ch_chat_b', { id: 'ch_chat_b', name: '💬-general-chat', type: 0, isTextBased: () => true }],
        ['ch_help_b', { id: 'ch_help_b', name: '🎫-support-tickets', type: 0, isTextBased: () => true }],
      ]),
    },
  };

  const mockGuildTNC = {
    id: '1340379968571576341',
    name: 'TNC OFFICIAL',
    memberCount: 950,
    vanityURLCode: 'tnc',
    channels: {
      cache: new Map([
        ['1341663035017793647', { id: '1341663035017793647', name: 'rules', type: 0, isTextBased: () => true }],
        ['1501972344179261611', { id: '1501972344179261611', name: 'chat', type: 0, isTextBased: () => true }],
        ['1551092438460801064', { id: '1551092438460801064', name: 'support', type: 0, isTextBased: () => true }],
      ]),
    },
  };

  it('resolveGuildLinks uses Priority 1 (configured channels) when set', () => {
    const config = {
      rulesChannelId: 'custom_rules_id',
      chatChannelId: 'custom_chat_id',
      applyChannelId: 'custom_support_id',
    };

    const guildWithConfig = {
      id: 'mock_guild',
      name: 'Mock Guild',
      channels: {
        cache: new Map([
          ['custom_rules_id', { id: 'custom_rules_id', name: 'my-rules', type: 0, isTextBased: () => true }],
          ['custom_chat_id', { id: 'custom_chat_id', name: 'my-chat', type: 0, isTextBased: () => true }],
          ['custom_support_id', { id: 'custom_support_id', name: 'my-support', type: 0, isTextBased: () => true }],
        ]),
      },
    };

    const links = resolveGuildLinks(guildWithConfig, config);
    expect(links.rulesUrl).toBe('https://discord.com/channels/mock_guild/custom_rules_id');
    expect(links.chatUrl).toBe('https://discord.com/channels/mock_guild/custom_chat_id');
    expect(links.supportUrl).toBe('https://discord.com/channels/mock_guild/custom_support_id');
  });

  it('resolveGuildLinks auto-detects channels (Priority 2) when unconfigured', () => {
    const links = resolveGuildLinks(mockGuildB, {});
    expect(links.rulesUrl).toBe('https://discord.com/channels/999111222333444555/ch_rules_b');
    expect(links.chatUrl).toBe('https://discord.com/channels/999111222333444555/ch_chat_b');
    expect(links.supportUrl).toBe('https://discord.com/channels/999111222333444555/ch_help_b');
    expect(links.serverUrl).toBe('https://discord.gg/serverb');
  });

  it('buildWelcomeDMPayload produces Server B specific details for Server B', () => {
    const payload = buildWelcomeDMPayload({
      guild: mockGuildB,
      member: mockUser,
      config: {},
    });

    expect(payload).toBeDefined();
    const embed = payload.embeds[0].data;
    expect(embed.description).toContain('Server B Gaming');
    expect(embed.description).toContain('https://discord.com/channels/999111222333444555/ch_rules_b');
    expect(embed.description).toContain('https://discord.com/channels/999111222333444555/ch_chat_b');
    expect(embed.description).not.toContain('TNC Official');
    expect(embed.description).not.toContain('1340379968571576341');
  });

  it('buildWelcomeDMPayload preserves TNC aesthetic for TNC with dynamic links', () => {
    const payload = buildWelcomeDMPayload({
      guild: mockGuildTNC,
      member: mockUser,
      config: {},
    });

    expect(payload).toBeDefined();
    const embed = payload.embeds[0].data;
    expect(embed.description).toContain('TNC Official');
    expect(embed.description).toContain('1341663035017793647');
    expect(embed.description).toContain('1501972344179261611');
    expect(embed.description).toContain('1551092438460801064');
  });

  it('formatDmText correctly substitutes all placeholders in custom descriptions', () => {
    const links = {
      rulesUrl: 'https://discord.com/channels/guild1/rules1',
      chatUrl: 'https://discord.com/channels/guild1/chat1',
      supportUrl: 'https://discord.com/channels/guild1/support1',
      serverUrl: 'https://discord.gg/myguild',
    };

    const template =
      'Hello {user}! Welcome to **{server}**.\n' +
      'Check out {rules}, talk in {chat}, or get help in {support}.\n' +
      'Now at {memberCount} members! Join link: {serverLink}';

    const formatted = formatDmText(template, {
      guild: mockGuildB,
      member: mockUser,
      links,
    });

    expect(formatted).toContain(`<@${mockUser.id}>`);
    expect(formatted).toContain('Server B Gaming');
    expect(formatted).toContain('250 members');
    expect(formatted).toContain('[** rules__   __**](https://discord.com/channels/guild1/rules1)');
    expect(formatted).toContain('[** chat__   __**](https://discord.com/channels/guild1/chat1)');
    expect(formatted).toContain('[** support__   __**](https://discord.com/channels/guild1/support1)');
    expect(formatted).toContain('https://discord.gg/myguild');
  });

  it('buildWelcomeDMPayload honors customDmText set by server owner', () => {
    const customConfig = {
      customDmText:
        '✨ Welcome {user} to our cozy place {server}!\n' +
        'Please read {rules} before posting in {chat}!\n' +
        'Need anything? Visit {support}!',
    };

    const payload = buildWelcomeDMPayload({
      guild: mockGuildB,
      member: mockUser,
      config: customConfig,
    });

    const embed = payload.embeds[0].data;
    expect(embed.description).toContain('✨ Welcome <@1202689641757806602> to our cozy place Server B Gaming!');
    expect(embed.description).toContain('https://discord.com/channels/999111222333444555/ch_rules_b');
  });

  it('buildWelcomeDMPayload returns null if dmEnabled is false', () => {
    const payload = buildWelcomeDMPayload({
      guild: mockGuildB,
      member: mockUser,
      config: { dmEnabled: false },
    });
    expect(payload).toBeNull();
  });

  it('buildWelcomeDmModal sets up modal fields properly', () => {
    const modal = buildWelcomeDmModal('Existing custom text');
    const json = modal.toJSON();
    expect(json.custom_id).toBe('welcome_dm_modal');
    expect(json.title).toBe('Customize Welcome DM');
    expect(json.components[0].components[0].custom_id).toBe('welcome_dm_text');
    expect(json.components[0].components[0].value).toBe('Existing custom text');
  });

  it('/welcome command includes dm subcommand with all required actions', () => {
    const data = welcomeCommand.data.toJSON();
    const dmOption = data.options.find((o) => o.name === 'dm');
    expect(dmOption).toBeDefined();

    const actionOption = dmOption.options.find((o) => o.name === 'action');
    expect(actionOption).toBeDefined();
    const actions = actionOption.choices.map((c) => c.value);
    expect(actions).toContain('edit');
    expect(actions).toContain('set');
    expect(actions).toContain('test');
    expect(actions).toContain('view');
    expect(actions).toContain('reset');
    expect(actions).toContain('enable');
    expect(actions).toContain('disable');
  });

  it('/welcome dm action:set saves custom text and enables DM', async () => {
    const guildId = 'test_guild_custom_dm';
    let replyEmbeds = null;

    const mockInteraction = {
      guild: mockGuildB,
      user: mockUser,
      member: mockUser,
      options: {
        getSubcommand: () => 'dm',
        getString: (name) => {
          if (name === 'action') return 'set';
          if (name === 'message') return 'Custom welcome for {user} at {server}!';
          return null;
        },
      },
      reply: vi.fn().mockImplementation((payload) => {
        replyEmbeds = payload.embeds;
        return Promise.resolve();
      }),
    };

    // Override guild.id to test_guild_custom_dm
    mockInteraction.guild = { ...mockGuildB, id: guildId };

    await welcomeCommand.execute(mockInteraction);

    const saved = get(guildId, 'welcome');
    expect(saved.customDmText).toBe('Custom welcome for {user} at {server}!');
    expect(saved.dmEnabled).toBe(true);
    expect(replyEmbeds).toBeDefined();
  });
});
