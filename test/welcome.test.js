import { describe, it, expect } from 'vitest';
const {
  buildWelcomePayload,
  buildExitPayload,
  resolveWelcomeChannel,
  resolveExitChannel,
} = require('../src/utils/welcome');

describe('Welcome and Exit System', () => {
  const mockGuild = {
    id: '1340379968571576341',
    name: 'TNC OFFICIAL',
    memberCount: 940,
    channels: {
      cache: new Map([
        ['c_welcm', { id: 'c_welcm', name: '⸝⸝-welcm-•', isTextBased: () => true }],
        ['c_exit', { id: 'c_exit', name: '⸝⸝-exit-•', isTextBased: () => true }],
        ['1341663035017793647', { id: '1341663035017793647', name: '୧🪽˙--laws', isTextBased: () => true }],
        ['1501972344179261611', { id: '1501972344179261611', name: '★˚✿--chat', isTextBased: () => true }],
        ['1551092438460801064', { id: '1551092438460801064', name: 'guild-apply', isTextBased: () => true }],
      ]),
    },
  };

  const mockMember = {
    id: '1122334455',
    user: {
      id: '1122334455',
      username: 'Falcone',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1122334455/avatar.png',
    },
  };

  it('buildWelcomePayload builds exact embed matching Image 1 sample and user template', () => {
    const payload = buildWelcomePayload({
      guild: mockGuild,
      member: mockMember,
      inviter: { id: '99887766', username: 'InviterFriend' },
      config: {
        rulesChannelId: '1341663035017793647',
        chatChannelId: '1501972344179261611',
        applyChannelId: '1551092438460801064',
      },
    });

    expect(payload.embeds).toBeDefined();
    expect(payload.embeds.length).toBe(1);

    const embed = payload.embeds[0].data;
    expect(embed.color).toBe(0xFFFFFF);
    expect(embed.thumbnail.url).toBe('https://cdn.discordapp.com/avatars/1122334455/avatar.png');

    expect(embed.description).toContain('### Welcome to *TNC OFFICIAL* 👾 <@1122334455>');
    expect(embed.description).toContain('Tysm for joining our community !');
    expect(embed.description).toContain('• You can read rules in <#1341663035017793647>');
    expect(embed.description).toContain('• you can chat w us in <#1501972344179261611>');
    expect(embed.description).toContain('• you can apply for tnc guild in <#1551092438460801064>');
    expect(embed.description).toContain('• Invited by <@99887766>');
    expect(embed.description).toContain('Now we have 940 as family <3');
  });

  it('buildExitPayload builds exact embed and button matching Image 2 sample', () => {
    const payload = buildExitPayload({
      guild: mockGuild,
      user: {
        username: '06_maya_03',
        displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/55443322/avatar.png',
      },
      memberCount: 939,
    });

    expect(payload.embeds).toBeDefined();
    expect(payload.embeds.length).toBe(1);

    const embed = payload.embeds[0].data;
    expect(embed.color).toBe(0xFFFFFF);
    expect(embed.title).toBe('06_maya_03 has been left from the server');
    expect(embed.thumbnail.url).toBe('https://cdn.discordapp.com/avatars/55443322/avatar.png');
    expect(embed.description).toContain('**Now we have 939 in our family <3**');
    expect(embed.description).toMatch(/Left At: <t:\d+:F>/);

    expect(payload.components).toBeDefined();
    expect(payload.components.length).toBe(1);

    const row = payload.components[0].toJSON();
    expect(row.components.length).toBe(1);
    expect(row.components[0].label).toBe('Tysm for being with us!');
    expect(row.components[0].disabled).toBe(true);
    expect(row.components[0].style).toBe(2); // ButtonStyle.Secondary is 2
  });

  it('resolves welcome and exit channels by ID or pattern matching', () => {
    const welcomeCh = resolveWelcomeChannel(mockGuild, {});
    expect(welcomeCh).toBeDefined();
    expect(welcomeCh.id).toBe('c_welcm');

    const exitCh = resolveExitChannel(mockGuild, {});
    expect(exitCh).toBeDefined();
    expect(exitCh.id).toBe('c_exit');
  });
});
