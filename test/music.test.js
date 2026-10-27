import { describe, it, expect, vi } from 'vitest';
import { buildMusicButtons, buildNowPlayingEmbed, handleMusicButton } from '../src/music/player';
import { YouTubePlugin } from '../src/music/youtubePlugin';
import playCommand from '../src/commands/music/play';
import pauseCommand from '../src/commands/music/pause';
import resumeCommand from '../src/commands/music/resume';
import skipCommand from '../src/commands/music/skip';
import queueCommand from '../src/commands/music/queue';
import nowplayingCommand from '../src/commands/music/nowplaying';
import volumeCommand from '../src/commands/music/volume';
import loopCommand from '../src/commands/music/loop';
import shuffleCommand from '../src/commands/music/shuffle';
import filterCommand from '../src/commands/music/filter';
import seekCommand from '../src/commands/music/seek';

describe('Music System & Interactive Button Controls', () => {
  it('exports valid slash command builders for all music commands', () => {
    const commands = [
      playCommand,
      pauseCommand,
      resumeCommand,
      skipCommand,
      queueCommand,
      nowplayingCommand,
      volumeCommand,
      loopCommand,
      shuffleCommand,
      filterCommand,
      seekCommand,
    ];

    for (const cmd of commands) {
      expect(cmd.data).toBeDefined();
      expect(typeof cmd.data.name).toBe('string');
      expect(typeof cmd.data.description).toBe('string');
      expect(typeof cmd.execute).toBe('function');
    }
  });

  it('builds interactive button rows with correct custom IDs', () => {
    const mockQueue = {
      paused: false,
      repeatMode: 0,
    };

    const rows = buildMusicButtons(mockQueue);
    expect(rows.length).toBe(2);

    const row1Buttons = rows[0].components.map((c) => c.data.custom_id);
    expect(row1Buttons).toContain('music_pause_resume');
    expect(row1Buttons).toContain('music_skip');
    expect(row1Buttons).toContain('music_stop');
    expect(row1Buttons).toContain('music_loop');
    expect(row1Buttons).toContain('music_shuffle');

    const row2Buttons = rows[1].components.map((c) => c.data.custom_id);
    expect(row2Buttons).toContain('music_voldown');
    expect(row2Buttons).toContain('music_volup');
    expect(row2Buttons).toContain('music_queue');
    expect(row2Buttons).toContain('music_filters_menu');
  });

  it('builds now playing embed with track metadata and status', () => {
    const mockQueue = {
      paused: false,
      repeatMode: 1,
      volume: 80,
      songs: [{ name: 'Test Song', url: 'https://youtube.com', formattedDuration: '3:30', user: { id: '123' } }],
      filters: { names: ['bassboost'] },
    };

    const embed = buildNowPlayingEmbed(mockQueue, mockQueue.songs[0]);
    expect(embed.data.description).toContain('Test Song');
    expect(embed.data.description).toContain('https://youtube.com');
    expect(embed.data.description).toContain('3:30');
    expect(embed.data.description).toContain('80%');
    expect(embed.data.description).toContain('Track Repeat');
  });

  it('rejects button interaction if member is not in the same voice channel', async () => {
    const replyMock = vi.fn().mockResolvedValue(true);
    const mockInteraction = {
      guildId: 'g1',
      member: {
        voice: { channel: { id: 'vc1' } },
      },
      guild: {
        members: {
          me: { voice: { channelId: 'vc2' } },
        },
      },
      customId: 'music_skip',
      reply: replyMock,
    };

    const mockClient = {
      distube: {
        getQueue: () => ({ songs: [{ name: 'Song 1' }] }),
      },
    };

    await handleMusicButton(mockInteraction, mockClient);
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('same voice channel'),
      })
    );
  });

  it('validates and extracts YouTube URLs cleanly with YouTubePlugin', async () => {
    const plugin = new YouTubePlugin();
    expect(plugin.type).toBe('info-extractor');

    // Positive validations
    expect(plugin.validate('https://www.youtube.com/watch?v=z5y8Clp_TdE')).toBe(true);
    expect(plugin.validate('https://youtu.be/z5y8Clp_TdE')).toBe(true);
    expect(plugin.validate('https://www.youtube.com/shorts/z5y8Clp_TdE')).toBe(true);
    expect(plugin.validate('https://music.youtube.com/watch?v=z5y8Clp_TdE')).toBe(true);

    // Negative validations
    expect(plugin.validate('https://open.spotify.com/track/123')).toBe(false);
    expect(plugin.validate('https://soundcloud.com/artist/track')).toBe(false);
    expect(plugin.validate('not a url')).toBe(false);

    // Resolution & search query generation
    const song = await plugin.resolve('https://www.youtube.com/watch?v=z5y8Clp_TdE');
    expect(song.source).toBe('youtube');
    expect(song.stream.playFromSource).toBe(false);
    expect(song.url).toBe('https://www.youtube.com/watch?v=z5y8Clp_TdE');
    expect(song.thumbnail).toContain('z5y8Clp_TdE');

    const query = plugin.createSearchQuery(song);
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });
});
