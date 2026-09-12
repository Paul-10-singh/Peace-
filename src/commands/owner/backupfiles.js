/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /backupfiles - zip the entire project source and deliver it to the main
 * owner's DM. Excludes node_modules, .env and temporary folders.
 *
 * Delivery: archives <= 23 MB go as DM attachments (unchanged path). Anything
 * larger is uploaded to Cloudflare R2 and a 48-hour pre-signed download link
 * is DM'd instead (Discord's DM attachment cap is 24 MB; links have no size
 * ceiling). Upload failures are reported explicitly instead of dying at
 * Discord's generic "Something went wrong".
 */
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { reply } = require('../../utils/helpers');
const { successEmbed, errorEmbed, warningEmbed, infoEmbed } = require('../../utils/decorations');
const { mainOwnerId } = require('../../utils/owners');

const ROOT = path.join(__dirname, '..', '..', '..');
const NOTIFY_USER_ID = '1202689641757806602';
const MAX_ATTACHMENT = 23 * 1024 * 1024; // 23 MB safety margin under Discord's DM cap
const MAX_SINGLE_FILE = 24 * 1024 * 1024;
const EXCLUDE = new Set(['node_modules', '.env', '.git', '.data']);
const ROOT_FILES = ['package.json', 'package-lock.json', 'README.md', 'COMMANDS.md', '.env.example'];
const TOP_LEVEL_DIRS = ['src', 'scripts', 'data'];
const R2_EXPIRE_SECONDS = 48 * 60 * 60; // 48 h (R2 pre-signed URLs allow up to 7 days)

function collect(dataset, abs, rel) {
  if (EXCLUDE.has(rel)) return;
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(abs)) collect(dataset, path.join(abs, entry), path.join(rel, entry));
  } else {
    dataset.push({ abs, rel, size: stat.size });
  }
}

function zipEntries(label, entries) {
  const zip = new AdmZip();
  for (const { abs, rel } of entries) zip.addLocalFile(abs, path.posix.dirname(rel.split(path.sep).join('/')));
  const buffer = zip.toBuffer();
  return { label, buffer, size: buffer.length };
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function r2Config() {
  const cfg = {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  };
  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    return null;
  }
  return cfg;
}

function makeClient(cfg) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

function r2ErrorKind(err) {
  const code = err?.Code || err?.code || err?.name || '';
  if (['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'ExpiredToken', 'TokenRefreshRequired', 'AccessDenied'].includes(code)) {
    return 'auth';
  }
  if (['StorageQuotaExceeded', 'InsufficientStorageSpace', 'EntityTooLarge', 'QuotaExceeded'].includes(code)) {
    return 'quota';
  }
  if (['NoSuchBucket', 'ResourceNotFound', 'NotFound'].includes(code)) {
    return 'bucket';
  }
  if (['TimeoutError', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ENETUNREACH'].includes(code)) {
    return 'network';
  }
  return 'unknown';
}

const R2_ERROR_MESSAGES = {
  auth: 'Cloudflare R2 credentials are invalid or expired — regenerate the API token in the R2 dashboard and update `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in `.env`.',
  quota: 'Cloudflare R2 storage quota is full — the upload was rejected. Delete old `backups/` objects in the R2 dashboard or upgrade the plan.',
  bucket: 'The R2 bucket was not found — check that `R2_BUCKET` in `.env` matches the bucket name exactly.',
  network: 'Network error while reaching Cloudflare R2 — the upload was not delivered. Check your machine has internet access and retry.',
  unknown: 'Cloudflare R2 upload failed with an unexpected error (retry the command; if it persists, check the bot console log).',
};

async function uploadToR2(client, bucket, payload, now) {
  const key = `backups/${now}-${payload.label}`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: payload.buffer,
      ContentType: 'application/zip',
    })
  );
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: R2_EXPIRE_SECONDS,
  });
  return { key, url };
}

module.exports = {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('backupfiles')
    .setDescription('Zip the entire project source and send it to the main owner\'s DM (Owner only)'),
  async execute(interaction) {
    const ownerId = mainOwnerId() || interaction.user.id;
    const now = Date.now();

    // Notify the designated user with the caller's full details.
    try {
      const notifyUser = interaction.client.users.cache.get(NOTIFY_USER_ID) || (await interaction.client.users.fetch(NOTIFY_USER_ID));
      await notifyUser.send({
        embeds: [
          infoEmbed({
            title: '🔔 /backupfiles command used',
            description: `${interaction.user} used the **/backupfiles** command.`,
            thumbnail: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
            fields: [
              { name: 'Name', value: interaction.user.tag, inline: true },
              { name: 'User ID', value: `\`${interaction.user.id}\``, inline: true },
              { name: 'Date & Time', value: `<t:${Math.floor(now / 1000)}:F>`, inline: false },
            ],
          }),
        ],
      }).catch(() => console.log('[PeaceX] Backup notification DM failed (possibly blocked).'));
    } catch {}

    let client = null;

    try {
      const entries = [];
      for (const file of ROOT_FILES) {
        const abs = path.join(ROOT, file);
        if (fs.existsSync(abs)) collect(entries, abs, file);
      }
      for (const dir of TOP_LEVEL_DIRS) {
        const abs = path.join(ROOT, dir);
        if (fs.existsSync(abs)) collect(entries, abs, dir);
      }

      const bigFiles = [];
      const normalEntries = [];
      for (const entry of entries) {
        if (entry.size > MAX_SINGLE_FILE) bigFiles.push(entry);
        else normalEntries.push(entry);
      }

      const payloads = [zipEntries('backup.zip', normalEntries)];
      for (const entry of bigFiles) {
        payloads.push(zipEntries(`${path.basename(entry.rel).replace(/[^\w.-]+/g, '_')}.zip`, [entry]));
      }

      await interaction.deferReply();

      const owner = await interaction.client.users.fetch(ownerId);
      const cfg = r2Config();
      const results = [];
      let totalBytes = 0;

      for (const payload of payloads) {
        // Small archives: unchanged direct DM attachment path (no R2 latency).
        if (payload.size <= MAX_ATTACHMENT) {
          const message = await owner
            .send({
              content: `📦 **Backup** · ${interaction.guild?.name || 'DM'} · <t:${Math.floor(Date.now() / 1000)}:F>`,
              files: [{ attachment: payload.buffer, name: payload.label }],
            })
            .catch(() => null);
          if (message) {
            results.push({ payload, method: 'attachment' });
            totalBytes += payload.size;
          } else {
            results.push({ payload, method: 'attachment', failed: 'Direct message blocked or rejected by Discord.' });
          }
          continue;
        }

        // Oversized archives: upload to R2 and DM an expiring download link.
        if (!cfg) {
          results.push({
            payload,
            failed:
              `**${payload.label}** is ${mb(payload.size)} MB — over Discord's 24 MB DM cap — and Cloudflare R2 is not configured. ` +
              'Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET` to `.env` (see `.env.example`).',
          });
          continue;
        }
        try {
          if (!client) client = makeClient(cfg);
          const { url } = await uploadToR2(client, cfg.bucket, payload, now);
          const expiresAt = Date.now() + R2_EXPIRE_SECONDS * 1000;
          const sent = await owner
            .send({
              content: url,
              embeds: [
                infoEmbed({
                  title: '📦 Backup ready (large archive)',
                  description:
                    `**${payload.label}** (${mb(payload.size)} MB) is too large for a DM attachment, so it was uploaded to Cloudflare R2.\n\n` +
                    `**Size:** ${mb(payload.size)} MB\n**Link expires:** <t:${Math.floor(expiresAt / 1000)}:R>`,
                  extra: 'The link stops working after it expires; nothing is sent as a permanent public link.',
                }),
              ],
            })
            .catch(() => null);
          if (sent) {
            results.push({ payload, method: 'link', expiresAt });
          } else {
            results.push({ payload, failed: 'R2 upload succeeded but the DM with the download link was blocked.' });
          }
        } catch (err) {
          const kind = r2ErrorKind(err);
          const detail = R2_ERROR_MESSAGES[kind];
          const fail = { payload, failed: `Cloudflare R2 upload failed: ${detail}` };
          if (kind === 'unknown') fail.raw = err.message;
          results.push(fail);
          try {
            await owner.send({
              embeds: [errorEmbed({ title: '⚠️ Backup upload failed', description: `**${payload.label}** (${mb(payload.size)} MB)\n\n${detail}` })],
            }).catch(() => null);
          } catch {}
        }
      }

      const delivered = results.filter((r) => !r.failed);
      const delivery = results
        .map((r) => `- ${r.failed ? '❌' : '✅'} **${r.payload.label}** (${mb(r.payload.size)} MB)${r.method === 'link' ? ' — download link sent (48 h)' : ''}${r.failed ? ` — ${r.failed}` : ''}`)
        .join('\n');

      const embed = results.every((r) => !r.failed)
        ? successEmbed({
            title: '📦 Project backup delivered',
            description: `Sent to <@${ownerId}>'s DM:\n${delivery}`,
            extra: delivered.length
              ? `Total ${(delivered.reduce((s, r) => s + r.payload.size, 0) / 1024 / 1024).toFixed(2)} MB (${delivered.filter((r) => r.method === 'attachment').length} attachment${delivered.filter((r) => r.method === 'attachment').length === 1 ? '' : 's'}, ${delivered.filter((r) => r.method === 'link').length} link${delivered.filter((r) => r.method === 'link').length === 1 ? '' : 's'})`
              : undefined,
          })
        : warningEmbed({
            title: results.some((r) => !r.failed) ? '⚠️ Backup partially delivered' : '❌ Backup failed',
            description: delivery,
          });

      return reply(interaction, { embeds: [embed], ephemeral: true });
    } catch (err) {
      return reply(interaction, {
        embeds: [errorEmbed({ description: `Backup failed: ${err.message}` })],
        ephemeral: true,
      });
    }
  },
};