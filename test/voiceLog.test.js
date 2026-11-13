import { describe, it, expect, vi, beforeEach } from 'vitest';
const setlogCommand = require('../src/commands/utility/setlog');
const { buildVoiceLog } = require('../src/utils/logFormatter');
const { getLogChannel, isTextLogChannel } = require('../src/utils/logging');
const { get, set } = require('../src/utils/settings');

describe('Voice Logging & /setlog configuration', () => {
  const mockUser = {
    id: '1487716551837880441',
    username: 'FLASH',
    tag: 'FLASH#0001',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1487716551837880441/avatar.png',
  };

  const mockMod = {
    id: '999888777666555444',
    username: 'AdminMod',
    tag: 'AdminMod#0001',
  };

  const mockVoiceChannel = {
    id: '1552019680133251093',
    name: 'General Vc',
    type: 2, // GuildVoice
    isTextBased: () => false,
    isVoiceBased: () => true,
  };

  const mockVoiceChannel2 = {
    id: '1552019680133251099',
    name: 'Music Vc',
    type: 2,
    isTextBased: () => false,
    isVoiceBased: () => true,
  };

  const mockTextChannel = {
    id: '111222333444555666',
    name: 'vc_logs',
    type: 0, // GuildText
    isTextBased: () => true,
    isVoiceBased: () => false,
    send: vi.fn().mockResolvedValue({ id: 'sent_log_id' }),
  };

  it('/setlog slash command options include vc and voice choices', () => {
    const data = setlogCommand.data.toJSON();
    const categoryOption = data.options.find((o) => o.name === 'category');
    expect(categoryOption).toBeDefined();

    const choices = categoryOption.choices.map((c) => c.value);
    expect(choices).toContain('vc');
    expect(choices).toContain('voice');
    expect(choices).toContain('message');
    expect(choices).toContain('moderation');
  });

  it('/setlog category:vc stores both config.vc and config.voice', async () => {
    const guildId = 'guild_test_vc_setlog';
    let replyPayload = null;

    const mockInteraction = {
      guild: { id: guildId },
      options: {
        getString: (name) => (name === 'category' ? 'vc' : null),
        getChannel: (name) => (name === 'channel' ? mockTextChannel : null),
      },
      reply: vi.fn().mockImplementation((payload) => {
        replyPayload = payload;
        return Promise.resolve();
      }),
    };

    await setlogCommand.execute(mockInteraction);

    const saved = get(guildId, 'logs');
    expect(saved.vc).toBe(mockTextChannel.id);
    expect(saved.voice).toBe(mockTextChannel.id);
    expect(replyPayload).toBeDefined();
    expect(replyPayload.embeds[0].data.description).toContain(mockTextChannel.id);
  });

  it('isTextLogChannel rejects voice/stage channels and accepts text channels', () => {
    expect(isTextLogChannel(mockVoiceChannel)).toBe(false);
    expect(isTextLogChannel(mockTextChannel)).toBe(true);
  });

  it('getLogChannel resolves config.vc or fallback config.voice', async () => {
    const guildId = 'guild_test_resolve';
    set(guildId, 'logs', { vc: mockTextChannel.id });

    const mockClient = {
      guilds: {
        cache: new Map([
          [
            guildId,
            {
              id: guildId,
              channels: {
                cache: new Map([[mockTextChannel.id, mockTextChannel]]),
                fetch: vi.fn().mockResolvedValue(mockTextChannel),
              },
            },
          ],
        ]),
      },
    };

    const chVc = await getLogChannel(mockClient, guildId, 'vc');
    expect(chVc).toBe(mockTextChannel);

    const chVoice = await getLogChannel(mockClient, guildId, 'voice');
    expect(chVoice).toBe(mockTextChannel);
  });

  it('buildVoiceLog formats Joined Voice Channel (Green embed with IDs block)', () => {
    const embed = buildVoiceLog({
      member: mockUser,
      action: 'Joined Voice Channel',
      channel: mockVoiceChannel,
    });

    const data = embed.data;
    expect(data.color).toBe(0x57F287);
    expect(data.description).toContain(`📥 <@${mockUser.id}> joined voice channel <#${mockVoiceChannel.id}>.`);
    expect(data.description).toContain(`> 👤 <@${mockUser.id}> ( \`${mockUser.id}\` )`);
    expect(data.description).toContain(`> 🔊 <#${mockVoiceChannel.id}> ( \`${mockVoiceChannel.id}\` )`);
    expect(data.footer.text).toContain(`User ID: ${mockUser.id}`);
  });

  it('buildVoiceLog formats Left Voice Channel (Red embed)', () => {
    const embed = buildVoiceLog({
      member: mockUser,
      action: 'Left Voice Channel',
      channel: mockVoiceChannel,
    });

    const data = embed.data;
    expect(data.color).toBe(0xED4245);
    expect(data.description).toContain(`📤 <@${mockUser.id}> left voice channel <#${mockVoiceChannel.id}>.`);
    expect(data.description).toContain(`> 👤 <@${mockUser.id}> ( \`${mockUser.id}\` )`);
  });

  it('buildVoiceLog formats Switched/Moved Voice Channel (Blurple embed with both channels)', () => {
    const embed = buildVoiceLog({
      member: mockUser,
      action: 'Switched Voice Channel',
      channel: mockVoiceChannel2,
      oldChannel: mockVoiceChannel,
    });

    const data = embed.data;
    expect(data.color).toBe(0x5865F2);
    expect(data.description).toContain(
      `🔀 <@${mockUser.id}> moved from <#${mockVoiceChannel.id}> to <#${mockVoiceChannel2.id}>.`
    );
    expect(data.description).toContain(`> 🔊 <#${mockVoiceChannel2.id}>`);
    expect(data.description).toContain(`> 🔊 <#${mockVoiceChannel.id}>`);
  });

  it('buildVoiceLog formats Disconnect with moderator attribution', () => {
    const embed = buildVoiceLog({
      member: mockUser,
      action: 'Voice Disconnected',
      channel: mockVoiceChannel,
      executor: mockMod,
    });

    const data = embed.data;
    expect(data.color).toBe(0xED4245);
    expect(data.description).toContain(
      `🔌 <@${mockUser.id}> was disconnected from <#${mockVoiceChannel.id}> by <@${mockMod.id}>.`
    );
    expect(data.description).toContain(`> 🛡️ <@${mockMod.id}> ( \`${mockMod.id}\` )`);
  });

  it('buildVoiceLog formats Server Muted and Server Unmuted', () => {
    const mutedEmbed = buildVoiceLog({
      member: mockUser,
      action: 'Server Muted',
      channel: mockVoiceChannel,
      executor: mockMod,
    });
    expect(mutedEmbed.data.color).toBe(0xFEE75C);
    expect(mutedEmbed.data.description).toContain(
      `🔇 <@${mockUser.id}> was server muted in <#${mockVoiceChannel.id}> by <@${mockMod.id}>.`
    );

    const unmutedEmbed = buildVoiceLog({
      member: mockUser,
      action: 'Server Unmuted',
      channel: mockVoiceChannel,
    });
    expect(unmutedEmbed.data.color).toBe(0x57F287);
    expect(unmutedEmbed.data.description).toContain(
      `🔊 <@${mockUser.id}> was server unmuted in <#${mockVoiceChannel.id}>.`
    );
  });

  it('buildVoiceLog formats Server Deafened and Server Undeafened', () => {
    const deafEmbed = buildVoiceLog({
      member: mockUser,
      action: 'Server Deafened',
      channel: mockVoiceChannel,
      executor: mockMod,
    });
    expect(deafEmbed.data.color).toBe(0xED4245);
    expect(deafEmbed.data.description).toContain(
      `🛑 <@${mockUser.id}> was server deafened in <#${mockVoiceChannel.id}> by <@${mockMod.id}>.`
    );

    const undeafEmbed = buildVoiceLog({
      member: mockUser,
      action: 'Server Undeafened',
      channel: mockVoiceChannel,
    });
    expect(undeafEmbed.data.color).toBe(0x57F287);
    expect(undeafEmbed.data.description).toContain(
      `🎧 <@${mockUser.id}> was server undeafened in <#${mockVoiceChannel.id}>.`
    );
  });
});
