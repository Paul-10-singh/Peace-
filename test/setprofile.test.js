import { describe, it, expect, vi } from 'vitest';
const setprofileCommand = require('../src/commands/owner/setprofile');
const { getImageDimensions, fetchAndValidateImage } = setprofileCommand;
const { BOT_OWNER_COMMANDS } = require('../src/utils/owners');

describe('/setprofile & Discord Image Rules Validation', () => {
  const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

  // 512x512 PNG mock header
  const png512 = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000020000000200080600000012345678',
    'hex'
  );

  // 64x64 PNG mock header (undersized for avatar)
  const png64 = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000040000000400806000000aa6971de',
    'hex'
  );

  // 960x540 PNG mock header (perfect banner)
  const pngBanner = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000003c00000021c080600000055667788',
    'hex'
  );

  // GIF 300x300 mock
  const gif300 = Buffer.from(
    '4749463839612c012c01f00000ffffff00000021f90400000000002c000000002c012c010002',
    'hex'
  );

  it('getImageDimensions detects PNG dimensions accurately', () => {
    const info = getImageDimensions(png512);
    expect(info).toBeDefined();
    expect(info.format).toBe('png');
    expect(info.width).toBe(512);
    expect(info.height).toBe(512);
  });

  it('getImageDimensions detects Banner dimensions accurately', () => {
    const info = getImageDimensions(pngBanner);
    expect(info).toBeDefined();
    expect(info.format).toBe('png');
    expect(info.width).toBe(960);
    expect(info.height).toBe(540);
  });

  it('getImageDimensions detects GIF dimensions accurately', () => {
    const info = getImageDimensions(gif300);
    expect(info).toBeDefined();
    expect(info.format).toBe('gif');
    expect(info.width).toBe(300);
    expect(info.height).toBe(300);
  });

  it('fetchAndValidateImage rejects files exceeding Discord 10 MB limit', async () => {
    const largeAttachment = {
      name: 'giant.png',
      url: 'https://example.com/giant.png',
      size: 15 * 1024 * 1024, // 15 MB
    };

    const result = await fetchAndValidateImage(largeAttachment, 'avatar');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('File size too large');
    expect(result.error).toContain('10 MB');
  });

  it('fetchAndValidateImage rejects avatars smaller than Discord 128x128 minimum', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: () => Promise.resolve(toArrayBuffer(png64)),
    });

    try {
      const result = await fetchAndValidateImage('https://example.com/tiny.png', 'avatar');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Avatar image is too small');
      expect(result.error).toContain('128x128 px');
      expect(result.error).toContain('512x512 px');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fetchAndValidateImage rejects banners smaller than Discord 600x240 minimum', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: () => Promise.resolve(toArrayBuffer(png512)), // 512 is < 600 width
    });

    try {
      const result = await fetchAndValidateImage('https://example.com/small_banner.png', 'banner');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Banner image is too small');
      expect(result.error).toContain('600x240 px');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('fetchAndValidateImage accepts valid 512x512 avatar and 960x540 banner', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url) => {
      const buf = url.includes('banner') ? pngBanner : png512;
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: () => Promise.resolve(toArrayBuffer(buf)),
      });
    });

    try {
      const avatarRes = await fetchAndValidateImage('https://example.com/avatar.png', 'avatar');
      expect(avatarRes.error).toBeUndefined();
      expect(avatarRes.info.width).toBe(512);

      const bannerRes = await fetchAndValidateImage('https://example.com/banner.png', 'banner');
      expect(bannerRes.error).toBeUndefined();
      expect(bannerRes.info.width).toBe(960);
      expect(bannerRes.info.height).toBe(540);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('/setprofile slash command definition includes username, avatar, avatar_file, banner, banner_file', () => {
    const json = setprofileCommand.data.toJSON();
    expect(json.name).toBe('setprofile');
    const optionNames = json.options.map((o) => o.name);
    expect(optionNames).toContain('username');
    expect(optionNames).toContain('avatar');
    expect(optionNames).toContain('avatar_file');
    expect(optionNames).toContain('banner');
    expect(optionNames).toContain('banner_file');
  });

  it('strictly blocks Server Owners (guild owners) who are not Bot Owners', async () => {
    expect(BOT_OWNER_COMMANDS.has('setprofile')).toBe(true);
    expect(setprofileCommand.botOwnerOnly).toBe(true);

    let replyPayload = null;
    const serverOwnerUser = {
      id: '999999999999999999',
      username: 'ServerOwnerGuy',
      displayAvatarURL: () => null,
    };
    const mockInteraction = {
      user: serverOwnerUser,
      guild: { id: 'guild_123', ownerId: serverOwnerUser.id },
      options: {
        getString: (name) => (name === 'username' ? 'HackedBot' : null),
        getAttachment: () => null,
      },
      reply: vi.fn().mockImplementation((payload) => {
        replyPayload = payload;
        return Promise.resolve();
      }),
    };

    await setprofileCommand.execute(mockInteraction);
    expect(replyPayload).toBeDefined();
    expect(replyPayload.embeds[0].data.title).toBe('Permission Denied');
    expect(replyPayload.embeds[0].data.description).toContain('strictly reserved for the **Bot Owner**');
  });
});
