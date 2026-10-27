/*
 * Peace✘ - Music Engine (DisTube v5)
 * Developed by Smith.Code
 *
 * Full-featured, secure music system with interactive button controls:
 * - YouTube, Spotify, SoundCloud & Direct Audio Stream playback
 * - Real-time Button Control Panel (Pause, Resume, Skip, Stop, Loop, Shuffle, Volume)
 * - Safe error handling (Zero backdoors, zero token leaks, zero unauthorized eval)
 * - DisTube v5 compatible (DisTubeOptions clean of legacy keys)
 * - Custom voiceStateUpdate auto-leave handler (respects 24/7 mode)
 */
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { DirectLinkPlugin } = require('@distube/direct-link');
const { YouTubePlugin } = require('./youtubePlugin');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');
const ffmpeg = require('ffmpeg-static');
const { BRAND, footer, successEmbed, errorEmbed, warningEmbed } = require('../utils/decorations');
const { get: getSetting } = require('../utils/settings');
const { destroyConnection } = require('../utils/voice247');
const { E } = require('../utils/emojis');

// Set FFMPEG_PATH environment variable so DisTube always locates the bundled binary
if (ffmpeg) {
  process.env.FFMPEG_PATH = ffmpeg;
}

let distubeInstance = null;
const emptyTimers = new Map();

function getDisTube() {
  return distubeInstance;
}

function buildMusicButtons(queue) {
  const isPaused = queue.paused;
  const loopMode = queue.repeatMode; // 0 = off, 1 = song, 2 = queue
  const loopEmoji = loopMode === 1 ? E.loop : loopMode === 2 ? E.Repeat : E.loop;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_pause_resume')
      .setEmoji(isPaused ? E.play : E.pause)
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji(E.skip)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setEmoji(loopEmoji)
      .setStyle(loopMode > 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setEmoji(E.shuffle)
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_voldown')
      .setEmoji(E.volumedown)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_volup')
      .setEmoji(E.volumeup)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_queue')
      .setEmoji(E.music)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_filters_menu')
      .setEmoji(E.audioFilter)
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

function buildNowPlayingEmbed(queue, song) {
  const loopMode = queue.repeatMode === 1 ? `${E.loop} Track Repeat` : queue.repeatMode === 2 ? `${E.Repeat} Queue Repeat` : 'Off';
  const pausedText = queue.paused ? `${E.pause} paused` : `${E.play} playing`;
  const currentFormatted = queue.formattedCurrentTime || '0:00';
  const totalFormatted = song.formattedDuration || '∞';
  const uploaderText = song.uploader?.name ? ` — **${song.uploader.name}**` : '';
  const userTag = song.user?.id ? `<@${song.user.id}>` : (song.user?.username || 'Unknown');

  const authorObj = {
    name: 'Now Playing',
    iconURL: queue.client?.user?.displayAvatarURL?.({ dynamic: true }) || undefined,
  };

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor(authorObj)
    .setDescription(
      `[**${song.name ? String(song.name).slice(0, 200) : 'Unknown Track'}**](${song.url || 'https://discord.com'})${uploaderText}\n` +
      `\`${currentFormatted} / ${totalFormatted}\` ${pausedText} · ${loopMode}\n` +
      `${E.volumeup} Volume \`${queue.volume}%\` · Requested by ${userTag}`
    )
    .setFooter({ text: `Peace✘ · ${song.url ? 'Music' : 'Local track'}` })
    .setTimestamp();

  if (song.thumbnail) {
    embed.setThumbnail(song.thumbnail);
  }

  return embed;
}

function initMusic(client) {
  if (distubeInstance) return distubeInstance;

  distubeInstance = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    plugins: [
      new SpotifyPlugin(),
      new YouTubePlugin(),
      new SoundCloudPlugin(),
      new DirectLinkPlugin(),
    ],
  });

  client.distube = distubeInstance;

  // DisTube Events
  distubeInstance.on('playSong', async (queue, song) => {
    try {
      if (queue._nowPlayingMessage) {
        const prevMsg = queue._nowPlayingMessage;
        queue._nowPlayingMessage = null;
        prevMsg.delete().catch(() => {});
      }
      const embed = buildNowPlayingEmbed(queue, song);
      const components = buildMusicButtons(queue);
      const msg = await queue.textChannel?.send({ embeds: [embed], components });
      queue._nowPlayingMessage = msg;
    } catch (err) {
      console.error('[PeaceX] [Music] Failed to send playSong embed:', err.message);
    }
  });

  distubeInstance.on('finishSong', async (queue, song) => {
    if (queue._nowPlayingMessage) {
      const prevMsg = queue._nowPlayingMessage;
      queue._nowPlayingMessage = null;
      prevMsg.delete().catch(() => {});
    }
  });

  // Song queue notifications are handled directly by the /play command reply
  distubeInstance.on('addSong', () => {});
  distubeInstance.on('addList', () => {});

  distubeInstance.on('finish', (queue) => {
    if (queue._nowPlayingMessage) {
      const prevMsg = queue._nowPlayingMessage;
      queue._nowPlayingMessage = null;
      prevMsg.delete().catch(() => {});
    }
    const { channelId } = getSetting(queue.id, 'vc247') || {};
    if (!channelId) {
      queue.textChannel?.send({
        embeds: [warningEmbed({ title: 'Queue Finished', description: 'Queue has ended. Use `/play` to play more songs!' })],
      }).catch(() => {});
    }
  });

  distubeInstance.on('deleteQueue', (queue) => {
    if (queue._nowPlayingMessage) {
      const prevMsg = queue._nowPlayingMessage;
      queue._nowPlayingMessage = null;
      prevMsg.delete().catch(() => {});
    }
  });

  distubeInstance.on('error', (error, queue, song) => {
    console.error('[PeaceX] [Music Error]:', error?.message || error);
    const textChannel = queue?.textChannel;
    if (textChannel?.send) {
      textChannel.send({
        embeds: [errorEmbed({ title: 'Music Playback Error', description: `An error occurred: \`${(error?.message || String(error)).slice(0, 150)}\`` })],
      }).catch(() => {});
    }
  });

  // Native voiceStateUpdate auto-disconnect when VC is empty of human members (respects 24/7)
  client.on('voiceStateUpdate', (oldState, newState) => {
    const guild = oldState.guild || newState.guild;
    const me = guild?.members?.me;
    if (!me?.voice?.channelId) return;

    const botChannel = me.voice.channel;
    if (!botChannel) return;

    const humanCount = botChannel.members.filter((m) => !m.user.bot).size;
    const { channelId: is247 } = getSetting(guild.id, 'vc247') || {};

    if (humanCount === 0 && !is247) {
      if (!emptyTimers.has(guild.id)) {
        const timer = setTimeout(() => {
          emptyTimers.delete(guild.id);
          const currentBotChannel = guild.members?.me?.voice?.channel;
          if (!currentBotChannel) return;
          const currentHumans = currentBotChannel.members.filter((m) => !m.user.bot).size;
          const { channelId: current247 } = getSetting(guild.id, 'vc247') || {};
          if (currentHumans === 0 && !current247) {
            const queue = distubeInstance?.getQueue(guild.id);
            if (queue) queue.stop();
            destroyConnection(guild);
            guild.members.me?.voice?.disconnect().catch(() => {});
            queue?.textChannel?.send({
              embeds: [warningEmbed({ title: 'Voice Channel Empty', description: 'Left the voice channel because everyone left.' })],
            }).catch(() => {});
          }
        }, 60000); // 1 minute delay before leaving
        emptyTimers.set(guild.id, timer);
      }
    } else {
      if (emptyTimers.has(guild.id)) {
        clearTimeout(emptyTimers.get(guild.id));
        emptyTimers.delete(guild.id);
      }
    }
  });

  console.log('[PeaceX] ✓ DisTube Music Engine initialized (Spotify, SoundCloud, YouTube, Direct Streams).');
  return distubeInstance;
}

/**
 * Handles all interactive button presses from the Now Playing control panel.
 */
async function handleMusicButton(interaction, client) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;
  const queue = client.distube?.getQueue(interaction.guildId);

  if (!queue) {
    return interaction.reply({
      content: '<a:wrong:1550504971303395430> No active music queue found in this server.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Caller must be in the same voice channel as the bot
  const botVoiceId = interaction.guild?.members?.me?.voice?.channelId;
  if (!voiceChannel || voiceChannel.id !== botVoiceId) {
    return interaction.reply({
      content: `<a:wrong:1550504971303395430> You must be in the same voice channel (<#${botVoiceId}>) to use the music controls!`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const action = interaction.customId;

  try {
    switch (action) {
      case 'music_pause_resume': {
        if (queue.paused) {
          queue.resume();
          await interaction.reply({ content: `${E.play} Resumed playback.`, flags: MessageFlags.Ephemeral });
        } else {
          queue.pause();
          await interaction.reply({ content: `${E.pause} Paused playback.`, flags: MessageFlags.Ephemeral });
        }
        // Update now playing buttons if message exists
        if (queue._nowPlayingMessage?.edit && queue.songs[0]) {
          const embed = buildNowPlayingEmbed(queue, queue.songs[0]);
          const components = buildMusicButtons(queue);
          queue._nowPlayingMessage.edit({ embeds: [embed], components }).catch(() => {});
        }
        break;
      }

      case 'music_skip': {
        if (queue.songs.length <= 1 && !queue.autoplay) {
          queue.stop();
          await interaction.reply({ content: `${E.skip} Skipped track. No more songs left in queue.`, flags: MessageFlags.Ephemeral });
        } else {
          await queue.skip();
          await interaction.reply({ content: `${E.skip} Skipped to the next track.`, flags: MessageFlags.Ephemeral });
        }
        break;
      }

      case 'music_stop': {
        if (queue._nowPlayingMessage) {
          const prevMsg = queue._nowPlayingMessage;
          queue._nowPlayingMessage = null;
          prevMsg.delete().catch(() => {});
        }
        queue.stop();
        const { channelId } = getSetting(interaction.guildId, 'vc247') || {};
        if (!channelId) {
          destroyConnection(interaction.guild);
          interaction.guild.members.me?.voice?.disconnect().catch(() => {});
        }
        await interaction.reply({ content: `${E.wrong} Stopped music playback and cleared the queue.`, flags: MessageFlags.Ephemeral });
        break;
      }

      case 'music_loop': {
        // Cycle mode: 0 -> 1 -> 2 -> 0
        const current = queue.repeatMode;
        const next = (current + 1) % 3;
        queue.setRepeatMode(next);
        const modeName = next === 1 ? `${E.loop} Track Repeat` : next === 2 ? `${E.Repeat} Queue Repeat` : 'Disabled';
        await interaction.reply({ content: `🔁 Loop mode set to: **${modeName}**`, flags: MessageFlags.Ephemeral });
        if (queue._nowPlayingMessage?.edit && queue.songs[0]) {
          const embed = buildNowPlayingEmbed(queue, queue.songs[0]);
          const components = buildMusicButtons(queue);
          queue._nowPlayingMessage.edit({ embeds: [embed], components }).catch(() => {});
        }
        break;
      }

      case 'music_shuffle': {
        queue.shuffle();
        await interaction.reply({ content: `${E.shuffle} Shuffled the song queue.`, flags: MessageFlags.Ephemeral });
        break;
      }

      case 'music_voldown': {
        const newVol = Math.max(0, queue.volume - 10);
        queue.setVolume(newVol);
        await interaction.reply({ content: `${E.volumedown} Volume decreased to **${newVol}%**.`, flags: MessageFlags.Ephemeral });
        break;
      }

      case 'music_volup': {
        const newVol = Math.min(100, queue.volume + 10);
        queue.setVolume(newVol);
        await interaction.reply({ content: `${E.volumeup} Volume increased to **${newVol}%**.`, flags: MessageFlags.Ephemeral });
        break;
      }

      case 'music_queue': {
        const songs = queue.songs;
        const current = songs[0];
        const upcoming = songs.slice(1, 10);
        const currentReq = current.user ? `<@${current.user.id}>` : 'Unknown';
        const currentLine = `-# ${E.dot} 1: ${(current.name || 'Unknown Track').slice(0, 30)} | ${currentReq} ${current.formattedDuration} ${E.yes}`;

        const upcomingLines = upcoming.map((t, i) => {
          const req = t.user ? `<@${t.user.id}>` : 'Unknown';
          return `-# ${E.dot} ${i + 2}: ${(t.name || 'Unknown Track').slice(0, 30)} | ${req} ${t.formattedDuration}`;
        });

        const list = [currentLine, ...upcomingLines];
        const extra = songs.length > 10 ? `\n...and **${songs.length - 10}** more track(s)` : '';

        const queueEmbed = new EmbedBuilder()
          .setColor(0x353535)
          .setAuthor({ name: 'Queue For Current Player', iconURL: interaction.client.user.displayAvatarURL() })
          .setDescription(list.join('\n') + extra)
          .setFooter({ text: `Total: ${songs.length} tracks ┆ ${queue.formattedDuration}` });

        await interaction.reply({ embeds: [queueEmbed], flags: MessageFlags.Ephemeral });
        break;
      }

      case 'music_filters_menu': {
        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('music_filter_select')
            .setPlaceholder(`Select Filter`)
            .addOptions([
              { label: 'Reset (Clear Filters)', value: 'off', emoji: E.Autoplay },
              { label: 'BassBoost', value: 'bassboost', emoji: E.volumeup },
              { label: '8D Audio', value: '8d', emoji: '🌀' },
              { label: 'Nightcore', value: 'nightcore', emoji: E.nightmode },
              { label: 'Vaporwave', value: 'vaporwave', emoji: E.sparkles },
              { label: 'Karaoke', value: 'karaoke', emoji: '🎤' },
              { label: 'Tremolo', value: 'tremolo', emoji: '〰️' },
              { label: 'Vibrato', value: 'vibrato', emoji: E.music },
              { label: 'Surround', value: 'surround', emoji: E.volumeup },
            ])
        );
        await interaction.reply({
          content: `${E.audioFilter} Choose an audio filter to apply:`,
          components: [selectMenu],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case 'music_filter_select': {
        const preset = interaction.values?.[0] || 'off';
        if (preset === 'off') {
          queue.filters.clear();
          await interaction.reply({ content: `${E.audioFilter} All audio filters cleared.`, flags: MessageFlags.Ephemeral });
        } else {
          queue.filters.clear();
          queue.filters.add(preset);
          await interaction.reply({ content: `${E.audioFilter} Applied filter: **${preset}**`, flags: MessageFlags.Ephemeral });
        }
        if (queue._nowPlayingMessage?.edit && queue.songs[0]) {
          const embed = buildNowPlayingEmbed(queue, queue.songs[0]);
          const components = buildMusicButtons(queue);
          queue._nowPlayingMessage.edit({ embeds: [embed], components }).catch(() => {});
        }
        break;
      }

      default:
        await interaction.reply({ content: 'Unknown music action.', flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error(`[PeaceX] [Music Button ${action} Error]:`, err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `<a:wrong:1550504971303395430> Action failed: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }
}

module.exports = {
  initMusic,
  getDisTube,
  buildMusicButtons,
  buildNowPlayingEmbed,
  handleMusicButton,
};
