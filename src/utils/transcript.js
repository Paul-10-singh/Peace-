/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function styleColor(user) {
  const palette = ['#faa61a', '#45ddc0', '#5965f3', '#8a63d2', '#0e48e4', '#3ba55d', '#eb459e', '#f9455a'];
  const str = user?.id || user?.username || 'x';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function avatarFor(user) {
  return user?.displayAvatarURL?.({ extension: 'png', size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function escapeWithLinks(content) {
  const urlRe = /(https?:\/\/[^\s<]+)/g;
  return escapeHtml(content).replace(urlRe, (m) => `<a href="${m}">${m}</a>`);
}

function messageBlock(client, message) {
  if (message.system) return '';
  const author = message.author;
  if (!author || author.bot && author.id === client?.user?.id && !message.content && !message.embeds.length && !message.attachments.size) return '';
  const timestamp = new Date(message.createdTimestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const parts = [];
  if (message.content) {
    parts.push(`<div class="msg-body">${escapeWithLinks(message.content)}</div>`);
  }

  for (const embed of message.embeds) {
    if (embed.title) parts.push(`<div class="embed-title">${escapeHtml(embed.title)}</div>`);
    if (embed.description) parts.push(`<div class="embed-desc">${escapeHtml(embed.description)}</div>`);
    if (embed.url && embed.title) parts.push(`<div class="embed-link"><a href="${escapeHtml(embed.url)}">Open link</a></div>`);
  }

  for (const att of message.attachments.values()) {
    parts.push(`<div class="msg-attachment"><a href="${escapeHtml(att.url)}" download>📎 ${escapeHtml(att.name)}</a></div>`);
  }

  if (!parts.length) return '';

  return `<div class="msg">
    <img class="msg-avatar" src="${avatarFor(author)}" alt="">
    <div class="msg-content">
      <div class="msg-meta"><span class="msg-author" style="color:${styleColor(author)}">${escapeHtml(author.username || 'Unknown')}</span> <span class="msg-time">${timestamp}</span></div>
      ${parts.join('')}
    </div>
  </div>\n`;
}

function header(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif; background: #36393f; color: #dcddde; margin: 0; padding: 24px; }
  .page-title { font-size: 22px; font-weight: 700; color: #fff; margin: 0 0 16px; }
  .msg { display: flex; margin-bottom: 12px; }
  .msg-avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 14px; flex-shrink: 0; }
  .msg-content { flex: 1; min-width: 0; }
  .msg-meta { margin-bottom: 2px; }
  .msg-author { font-weight: 600; }
  .msg-time { color: #72767d; font-size: 12px; margin-left: 8px; }
  .msg-body { white-space: pre-wrap; word-wrap: break-word; }
  .embed-title { font-weight: 600; color: #00b0f4; margin-top: 4px; }
  .embed-desc { color: #dbdee1; }
  .embed-link a, .msg-attachment a { color: #00a0f3; text-decoration: none; }
</style>
</head>
<body>
<h1 class="page-title">${escapeHtml(title)}</h1>
`;
}

async function generateTranscript(client, channel) {
  const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const messages = fetched ? [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp) : [];

  const title = `Ticket Transcript — ${channel.name}`;
  const body = messages.map((m) => messageBlock(client, m)).join('');
  const footer = `</body>\n</html>`;
  return header(title) + body + footer;
}

module.exports = { generateTranscript };