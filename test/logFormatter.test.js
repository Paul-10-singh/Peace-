import { describe, it, expect } from 'vitest';
const {
  createLogCard,
  buildMessageDeleteLog,
  buildMessageEditLog,
  buildMemberJoinLog,
  buildMemberLeaveLog,
  buildBanLog,
  buildNicknameLog,
  buildRoleUpdateLog,
  buildVoiceLog,
} = require('../src/utils/logFormatter');

describe('Log Formatter System', () => {
  const mockUser = {
    id: '123456789012345678',
    username: 'test_user',
    tag: 'test_user#0000',
    createdTimestamp: Date.now() - 10000000,
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
  };

  const mockChannel = {
    id: '987654321098765432',
    name: 'general',
  };

  it('createLogCard uses strict blockquote arrow styling: > ❯ **Field :** value', () => {
    const embed = createLogCard({
      title: 'Test Title',
      user: mockUser,
      fields: [
        { label: 'Action', value: '`Something happened`' },
        { label: 'User ID', value: `\`${mockUser.id}\`` },
      ],
      blocks: [{ label: 'Details', content: 'Sample text block' }],
    });

    const data = embed.data;
    expect(data.title).toBe('Test Title');
    expect(data.author.name).toBe('test_user#0000');
    expect(data.thumbnail.url).toBe('https://cdn.discordapp.com/avatars/123/avatar.png');
    expect(data.description).toContain('> ❯ **Action :** `Something happened`');
    expect(data.description).toContain(`> ❯ **User ID :** \`${mockUser.id}\``);
    expect(data.description).toContain('> ❯ **Details :**\n```text\nSample text block\n```');
    expect(data.footer.text).toContain(`User ID: ${mockUser.id}`);
  });

  it('buildMessageDeleteLog includes full user details, ID, channel and message content block', () => {
    const embed = buildMessageDeleteLog({
      message: { id: 'msg_999', content: 'Hello secret world' },
      author: mockUser,
      channel: mockChannel,
    });

    const data = embed.data;
    expect(data.title).toBe('🗑️ Message Deleted');
    expect(data.thumbnail.url).toBe('https://cdn.discordapp.com/avatars/123/avatar.png');
    expect(data.description).toContain(`> ❯ **Author :** <@${mockUser.id}> (\`test_user\`)`);
    expect(data.description).toContain(`> ❯ **User ID :** \`${mockUser.id}\``);
    expect(data.description).toContain(`> ❯ **Channel :** <#${mockChannel.id}> (\`#general\`)`);
    expect(data.description).toContain('> ❯ **Message ID :** `msg_999`');
    expect(data.description).toContain('```text\nHello secret world\n```');
  });

  it('buildMessageEditLog includes before and after text blocks', () => {
    const embed = buildMessageEditLog({
      oldMessage: { content: 'Old version' },
      newMessage: { id: 'msg_100', content: 'New edited version', url: 'https://discord.com/msg' },
      author: mockUser,
      channel: mockChannel,
    });

    const data = embed.data;
    expect(data.title).toBe('✏️ Message Edited');
    expect(data.description).toContain(`> ❯ **User ID :** \`${mockUser.id}\``);
    expect(data.description).toContain('```text\nOld version\n```');
    expect(data.description).toContain('```text\nNew edited version\n```');
  });

  it('buildMemberJoinLog includes invite tracking details', () => {
    const embed = buildMemberJoinLog({
      member: { user: mockUser, guild: { memberCount: 950 } },
      usedInvite: {
        code: 'tnc2026',
        uses: 42,
        inviter: { id: '55555', username: 'InviterAce' },
      },
    });

    const data = embed.data;
    expect(data.title).toBe('📥 Member Joined');
    expect(data.description).toContain(`> ❯ **User ID :** \`${mockUser.id}\``);
    expect(data.description).toContain('InviterAce');
    expect(data.description).toContain('tnc2026');
    expect(data.description).toContain('`#950`');
  });

  it('buildBanLog includes moderator and reason', () => {
    const embed = buildBanLog({
      user: mockUser,
      executor: { id: '777', username: 'ModAdmin' },
      reason: 'Spamming raid links',
      isUnban: false,
    });

    const data = embed.data;
    expect(data.title).toBe('🔨 Member Banned');
    expect(data.description).toContain(`> ❯ **User ID :** \`${mockUser.id}\``);
    expect(data.description).toContain('<@777>');
    expect(data.description).toContain('`Spamming raid links`');
  });

  it('buildNicknameLog tracks old and new nicknames', () => {
    const embed = buildNicknameLog({
      member: mockUser,
      oldNick: 'OldGuy',
      newNick: 'NewKing',
    });

    const data = embed.data;
    expect(data.title).toBe('📛 Nickname Changed');
    expect(data.description).toContain('`OldGuy`');
    expect(data.description).toContain('`NewKing`');
    expect(data.description).toContain(`> ❯ **User ID :** \`${mockUser.id}\``);
  });

  it('buildVoiceLog formats exact Image 2 style with IDs block and mentions', () => {
    const embed = buildVoiceLog({
      member: mockUser,
      action: 'Joined Voice Channel',
      channel: mockChannel,
    });

    const data = embed.data;
    expect(data.color).toBe(0x57F287);
    expect(data.description).toContain(`📥 <@${mockUser.id}> joined voice channel <#${mockChannel.id}>.`);
    expect(data.description).toContain('**IDs**');
    expect(data.description).toContain(`> 👤 <@${mockUser.id}> ( \`${mockUser.id}\` )`);
    expect(data.description).toContain(`> 🔊 <#${mockChannel.id}> ( \`${mockChannel.id}\` )`);
  });
});
