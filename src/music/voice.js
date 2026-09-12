/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * Shared helpers for music commands: voice state checks.
 */

/** Returns the member's voice channel or null. */
function getVoiceChannel(interaction) {
  return interaction.member?.voice?.channel ?? null;
}

/** Balanced gate: require the user + bot to be in a (compatible) voice channel.
 *  Returns { ok, channel, reply } so commands can short-circuit. */
function requireVoice(interaction, client) {
  const voiceChannel = getVoiceChannel(interaction);
  if (!voiceChannel) {
    return {
      ok: false,
      reply: { content: 'You need to be in a voice channel to use this command.', ephemeral: true },
    };
  }
  const me = interaction.guild?.members?.me;
  const myChannel = me?.voice?.channel;
  if (myChannel && myChannel.id !== voiceChannel.id) {
    return {
      ok: false,
      reply: { content: 'You must be in the same voice channel as me to use this command.', ephemeral: true },
    };
  }
  return { ok: true, channel: voiceChannel, reply: null };
}

function botInVoice(guild) {
  return guild?.members?.me?.voice?.channel ?? null;
}

module.exports = { getVoiceChannel, requireVoice, botInVoice };
