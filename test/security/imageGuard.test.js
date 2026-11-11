import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const { openDatabase } = require('../../src/security/db.js');
const imageGuard = require('../../src/security/intel/imageGuard.js');
const gateway = require('../../src/security/gateway.js');
const messageUpdateEvent = require('../../src/events/messageUpdate.js');
const settings = require('../../src/utils/settings.js');
const scamdetectCmd = require('../../src/commands/security/scamdetect.js');
const securityPanel = require('../../src/utils/securityPanel.js');

const TEST_GUILD = '__TEST_IMAGE_GUARD__';
const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'settings.json');

function genImageBuffer(filter, format = 'image2', vcodec = 'png', extraArgs = []) {
  return execFileSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', filter,
    '-frames:v', '1',
    ...extraArgs,
    '-f', format,
    '-vcodec', vcodec,
    'pipe:1',
  ]);
}

function reencodeAsJpeg(pngBuffer, scale = '160:90', quality = '10') {
  return execFileSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vf', `scale=${scale}`,
      '-frames:v', '1',
      '-q:v', quality,
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ],
    { input: pngBuffer }
  );
}

// Generate real test images once via ffmpeg-static (zero hardcoded large blobs)
const IMG_A_PNG = genImageBuffer('testsrc=size=320x180:rate=1');
const IMG_A_RESIZED_JPG = reencodeAsJpeg(IMG_A_PNG, '160:90', '12');
const IMG_B_PNG = genImageBuffer('smptebars=size=320x180:rate=1');
const IMG_SOLID_BLACK = genImageBuffer('color=c=black:s=64x64:r=1');
const IMG_SOLID_WHITE = genImageBuffer('color=c=white:s=64x64:r=1');

let db;
let originalSettingsRaw = null;
const realFetch = globalThis.fetch;

beforeEach(() => {
  originalSettingsRaw = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf8') : null;
  db = openDatabase(':memory:');
  imageGuard.init(db);
  imageGuard.enable();
  settings.set(TEST_GUILD, 'security', {
    enabled: true,
    autoWarn: true,
    action: 'warn',
    warnThreshold: 3,
    whitelist: [],
    warns: {},
    antiSpam: { enabled: false, maxMessages: 5, intervalMs: 5000 },
    antiLink: { enabled: false, allow: [], blockScam: true },
    antiNuke: { enabled: false, punishment: 'ban', extraOwners: [], whitelistRoles: [], lockdown: true },
    words: [],
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  try { db?.close?.(); } catch {}
  if (originalSettingsRaw !== null) {
    fs.writeFileSync(SETTINGS_FILE, originalSettingsRaw, 'utf8');
  }
});

describe('imageGuard hybrid SHA-256 + 64-bit dHash', () => {
  it('blocks exact reposts via SHA-256 and resized/recompressed copies via dHash', async () => {
    const { entry, alreadyExists } = await imageGuard.blockFromBuffer(TEST_GUILD, IMG_A_PNG, {
      label: 'Fake Nitro Banner',
      addedBy: 'OWNER_1',
    });

    expect(alreadyExists).toBe(false);
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.dhash).toMatch(/^[0-9a-f]{16}$/);
    expect(entry.low_var).toBe(0);
    expect(entry.label).toBe('Fake Nitro Banner');

    // Duplicate upload updates metadata instead of creating duplicate row
    const dup = await imageGuard.blockFromBuffer(TEST_GUILD, IMG_A_PNG, { label: 'Updated Label' });
    expect(dup.alreadyExists).toBe(true);
    expect(imageGuard.list(TEST_GUILD)).toHaveLength(1);
    expect(dup.entry.label).toBe('Updated Label');

    // Exact buffer match -> SHA-256
    const exactMatch = await imageGuard.matchBuffer(TEST_GUILD, IMG_A_PNG);
    expect(exactMatch).toBeTruthy();
    expect(exactMatch.method).toBe('sha256');
    expect(exactMatch.distance).toBe(0);
    expect(exactMatch.similarity).toBe(100);

    // Resized + compressed JPEG variant -> dHash perceptual match
    const variantMatch = await imageGuard.matchBuffer(TEST_GUILD, IMG_A_RESIZED_JPG);
    expect(variantMatch).toBeTruthy();
    expect(variantMatch.method).toBe('dhash');
    expect(variantMatch.distance).toBeLessThanOrEqual(imageGuard.DEFAULT_MAX_DISTANCE);
    expect(variantMatch.similarity).toBeGreaterThanOrEqual(90);

    // Unrelated image -> safe (null)
    const unrelated = await imageGuard.matchBuffer(TEST_GUILD, IMG_B_PNG);
    expect(unrelated).toBeNull();

    // Hit counter persisted to SQLite
    const persisted = db.prepare('SELECT hits FROM blocked_images WHERE id = ?').get(entry.id);
    expect(persisted.hits).toBe(2);
  });

  it('prevents solid/blank low-variance images from false-matching via dHash', async () => {
    const { entry } = await imageGuard.blockFromBuffer(TEST_GUILD, IMG_SOLID_BLACK, { label: 'Solid Black' });
    expect(entry.low_var).toBe(1);

    // Exact solid black matches via SHA-256
    const exact = await imageGuard.matchBuffer(TEST_GUILD, IMG_SOLID_BLACK);
    expect(exact?.method).toBe('sha256');

    // Different solid color has identical zero-gradient dHash (all 0s),
    // but low_var guard must skip dHash so it does NOT false-positive.
    const solidWhite = await imageGuard.matchBuffer(TEST_GUILD, IMG_SOLID_WHITE);
    expect(solidWhite).toBeNull();
  });

  it('supports removing and clearing blocked images and disable/enable toggles', async () => {
    const { entry } = await imageGuard.blockFromBuffer(TEST_GUILD, IMG_A_PNG, { label: 'Scam 1' });
    await imageGuard.blockFromBuffer(TEST_GUILD, IMG_B_PNG, { label: 'Scam 2' });
    expect(imageGuard.list(TEST_GUILD)).toHaveLength(2);

    imageGuard.disable();
    expect(await imageGuard.matchBuffer(TEST_GUILD, IMG_A_PNG)).toBeNull();
    imageGuard.enable();
    expect((await imageGuard.matchBuffer(TEST_GUILD, IMG_A_PNG))?.matched).toBe(true);

    expect(imageGuard.remove(TEST_GUILD, entry.id)).toBe(true);
    expect(imageGuard.list(TEST_GUILD)).toHaveLength(1);

    expect(imageGuard.clear(TEST_GUILD)).toBe(1);
    expect(imageGuard.list(TEST_GUILD)).toHaveLength(0);
  });
});

describe('imageGuard SSRF & message URL extraction', () => {
  it('blocks private/localhost URLs and SSRF redirects', async () => {
    expect(imageGuard.isSafeRemoteUrl('http://localhost/x.png')).toBe(false);
    expect(imageGuard.isSafeRemoteUrl('http://127.0.0.1:8080/x.png')).toBe(false);
    expect(imageGuard.isSafeRemoteUrl('http://192.168.0.1/x.png')).toBe(false);
    expect(imageGuard.isSafeRemoteUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(imageGuard.isSafeRemoteUrl('file:///etc/passwd')).toBe(false);
    expect(imageGuard.isSafeRemoteUrl('https://cdn.discordapp.com/attachments/1/2/a.png')).toBe(true);

    globalThis.fetch = vi.fn(async () => ({
      status: 302,
      ok: false,
      headers: { get: (k) => (k.toLowerCase() === 'location' ? 'http://127.0.0.1/internal.png' : null) },
    }));

    await expect(imageGuard.downloadImage('https://example.com/redirect.png')).rejects.toThrow(/unsafe/i);
  });

  it('extracts image attachments/embeds/URLs while ignoring video attachments', () => {
    const urls = imageGuard.extractMessageImageUrls({
      content: 'Look at https://example.com/promo.webp?size=512 and http://127.0.0.1/evil.png',
      attachments: [
        { url: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4', contentType: 'video/mp4', width: 1920 },
        { url: 'https://cdn.discordapp.com/attachments/1/2/scam.png', contentType: 'image/png', width: 400 },
      ],
      embeds: [
        { image: { url: 'https://i.imgur.com/fake.jpg' } },
      ],
    });

    expect(urls).toEqual([
      'https://cdn.discordapp.com/attachments/1/2/scam.png',
      'https://i.imgur.com/fake.jpg',
      'https://example.com/promo.webp?size=512',
    ]);
  });

  it('skips pending uploads and explicitly ignored messages', async () => {
    await imageGuard.blockFromBuffer(TEST_GUILD, IMG_A_PNG);
    globalThis.fetch = vi.fn(async () => new Response(IMG_A_PNG, { status: 200 }));

    const msg = {
      id: 'MSG_IGNORE_TEST',
      guild: { id: TEST_GUILD },
      author: { id: 'ADMIN_1' },
      content: '',
      attachments: [{ url: 'https://cdn.discordapp.com/attachments/1/2/a.png', contentType: 'image/png' }],
      embeds: [],
    };

    imageGuard.markPendingUpload(TEST_GUILD, 'ADMIN_1');
    expect(await imageGuard.checkMessageImages(msg)).toBeNull();
    imageGuard.clearPendingUpload(TEST_GUILD, 'ADMIN_1');

    imageGuard.ignoreMessage('MSG_IGNORE_TEST');
    expect(await imageGuard.checkMessageImages(msg)).toBeNull();
  });
});

describe('gateway + /scamdetect + securityPanel integration', () => {
  it('blocks a scam image variant in chat via gateway.onMessage', async () => {
    await imageGuard.blockFromBuffer(TEST_GUILD, IMG_A_PNG, { label: 'Nitro Phish' });
    globalThis.fetch = vi.fn(async () => new Response(IMG_A_RESIZED_JPG, { status: 200 }));

    const recorded = [];
    const client = {
      user: { id: 'BOT' },
      channels: { cache: new Map() },
      guilds: { cache: new Map(), fetch: async () => null },
      security: {
        enabled: true,
        engine: {},
        intel: {
          feeds: { knownBad: () => false },
          reputation: { recordSender: (...args) => recorded.push(args) },
          imageGuard,
        },
        ratelimit: { redis: { slidingWindow: async () => ({ allowed: true }) } },
        metrics: { registry: { threats: () => {} } },
      },
    };

    const deleted = [];
    const notices = [];
    const message = {
      id: 'MSG_100',
      guild: { id: TEST_GUILD, name: 'Test Guild', ownerId: 'OWNER', channels: { cache: new Map() } },
      channel: {
        id: 'CH_1',
        send: async (p) => {
          notices.push(p);
          return { delete: async () => {} };
        },
      },
      author: { id: 'SCAMMER_1', bot: false, send: async () => {} },
      member: { moderatable: false, kickable: false, permissions: { has: () => false } },
      content: '',
      attachments: [{ url: 'https://cdn.discordapp.com/attachments/1/2/reupload.jpg', contentType: 'image/jpeg' }],
      embeds: [],
      delete: async () => { deleted.push(true); },
    };

    const res = await gateway.onMessage(client, message);
    expect(res.action).toBe('blocked');
    expect(res.reason).toContain('blocked scam image');
    expect(res.reason).toContain('Nitro Phish');
    expect(res.reason).toContain('% visual match');
    expect(deleted).toHaveLength(1);
    expect(notices).toHaveLength(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0][1]).toBe('scam-image');
  });

  it('catches delayed embed-unfurled scam images on messageUpdate', async () => {
    await imageGuard.blockFromBuffer(TEST_GUILD, IMG_A_PNG, { label: 'Unfurled Scam' });
    globalThis.fetch = vi.fn(async () => new Response(IMG_A_PNG, { status: 200 }));

    const client = {
      user: { id: 'BOT' },
      channels: { cache: new Map() },
      guilds: { cache: new Map(), fetch: async () => null },
      security: {
        enabled: true,
        engine: {},
        intel: {
          feeds: { knownBad: () => false },
          reputation: { recordSender: () => {} },
          imageGuard,
        },
        ratelimit: { redis: { slidingWindow: async () => ({ allowed: true }) } },
        metrics: { registry: { threats: () => {} } },
      },
    };

    const deleted = [];
    const oldMsg = {
      id: 'MSG_UNFURL',
      content: 'https://imgur.com/abc',
      embeds: [],
    };
    const newMsg = {
      id: 'MSG_UNFURL',
      guild: { id: TEST_GUILD, name: 'Test Guild', ownerId: 'OWNER', channels: { cache: new Map() } },
      channel: { id: 'CH_1', send: async () => ({ delete: async () => {} }) },
      author: { id: 'SCAMMER_2', bot: false, send: async () => {} },
      member: { moderatable: false, kickable: false, permissions: { has: () => false } },
      content: 'https://imgur.com/abc',
      attachments: [],
      embeds: [{ thumbnail: { url: 'https://i.imgur.com/abc.png' } }],
      partial: false,
      delete: async () => { deleted.push(true); },
    };

    await messageUpdateEvent.execute(client, oldMsg, newMsg);
    expect(deleted).toHaveLength(1);
  });

  it('opens the panel with no options and blocks an attached image via /scamdetect', async () => {
    globalThis.fetch = vi.fn(async () => new Response(IMG_A_PNG, { status: 200 }));

    // 1) No options -> opens Scam Detect panel
    const replies = [];
    await scamdetectCmd.execute({
      guild: { id: TEST_GUILD, roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      options: {
        getAttachment: () => null,
        getString: () => null,
      },
      reply: async (payload) => { replies.push(payload); },
    });
    expect(replies).toHaveLength(1);
    expect(replies[0].embeds[0].data.title).toBe('Scam Detect Configuration');

    // 2) With image attachment -> blocks image and edits deferred reply
    let edited = null;
    await scamdetectCmd.execute({
      guild: { id: TEST_GUILD, roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      options: {
        getAttachment: () => ({
          url: 'https://cdn.discordapp.com/attachments/1/2/scam.png',
          name: 'scam.png',
          contentType: 'image/png',
        }),
        getString: (name) => (name === 'label' ? 'QR Scam' : null),
      },
      deferReply: async () => {},
      editReply: async (payload) => { edited = payload; },
    });

    expect(edited?.embeds?.[0]?.data?.title).toBe('Scam Image Blocked');
    const stored = imageGuard.list(TEST_GUILD);
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe('QR Scam');

    // 3) Panel list button & pick-remove select work cleanly
    const listReplies = [];
    await securityPanel.handleComponent({
      customId: 'sec:list:scamDetect',
      guild: { id: TEST_GUILD, ownerId: 'OWNER', roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      reply: async (p) => { listReplies.push(p); },
    });
    expect(listReplies[0].embeds[0].data.description).toContain('QR Scam');

    let updated = null;
    await securityPanel.handleComponent({
      customId: 'sec:pick:scamDetect:image',
      values: [String(stored[0].id)],
      guild: { id: TEST_GUILD, ownerId: 'OWNER', roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      update: async (p) => { updated = p; },
    });
    expect(imageGuard.list(TEST_GUILD)).toHaveLength(0);
    expect(updated?.embeds?.[0]?.data?.description).toContain('**Blocked Images:** `0`');
  });

  it('supports Block Image (URL) modal and Block Image (Upload) collector in securityPanel', async () => {
    globalThis.fetch = vi.fn(async () => new Response(IMG_B_PNG, { status: 200 }));

    // 1) Show modal for Block Image (URL)
    let shownModal = null;
    await securityPanel.handleComponent({
      customId: 'sec:modal:scamDetect:image',
      guild: { id: TEST_GUILD, ownerId: 'OWNER', roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      showModal: async (m) => { shownModal = m; },
    });
    expect(shownModal?.data?.custom_id).toBe('sec:add:scamDetect:image');

    // 2) Submit modal (blank optional label should not break)
    let deferred = false;
    let modalEdit = null;
    const modalFollowUps = [];
    await securityPanel.handleComponent({
      customId: 'sec:add:scamDetect:image',
      guild: { id: TEST_GUILD, ownerId: 'OWNER', roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      fields: {
        getTextInputValue: (k) => (k === 'sec_value_imageurl' ? 'https://cdn.discordapp.com/attachments/1/2/b.png' : ''),
      },
      deferReply: async () => { deferred = true; },
      editReply: async (p) => { modalEdit = p; },
      followUp: async (p) => { modalFollowUps.push(p); },
    });
    expect(deferred).toBe(true);
    expect(modalEdit?.embeds?.[0]?.data?.title).toBe('Scam Image Blocked');
    expect(modalFollowUps).toHaveLength(1);
    expect(imageGuard.list(TEST_GUILD)).toHaveLength(1);

    // 3) Block Image (Upload) collector flow
    globalThis.fetch = vi.fn(async () => new Response(IMG_A_PNG, { status: 200 }));
    const handlers = {};
    const collector = {
      on: (ev, fn) => { handlers[ev] = fn; return collector; },
      stop: (reason) => { handlers.end?.(new Map(), reason); },
    };
    const uploadEdits = [];
    const uploadFollowUps = [];
    let msgDeleted = false;

    await securityPanel.handleComponent({
      customId: 'sec:upload:scamDetect:image',
      guild: { id: TEST_GUILD, ownerId: 'OWNER', roles: { cache: new Map() } },
      user: { id: 'OWNER' },
      channel: { createMessageCollector: () => collector },
      reply: async () => {},
      editReply: async (p) => { uploadEdits.push(p); },
      followUp: async (p) => { uploadFollowUps.push(p); },
    });

    await handlers.collect({
      id: 'UPLOAD_MSG_1',
      author: { id: 'OWNER' },
      content: 'Crypto Drainer',
      attachments: {
        first: () => ({ url: 'https://cdn.discordapp.com/attachments/1/2/drainer.png', name: 'drainer.png', contentType: 'image/png' }),
        values: () => [{ url: 'https://cdn.discordapp.com/attachments/1/2/drainer.png', name: 'drainer.png', contentType: 'image/png' }].values(),
      },
      embeds: [],
      delete: async () => { msgDeleted = true; },
    });
    handlers.end?.(new Map(), 'limit');

    expect(msgDeleted).toBe(true);
    expect(uploadEdits).toHaveLength(1);
    expect(uploadEdits[0].embeds[0].data.title).toBe('Scam Image Blocked');
    expect(uploadFollowUps).toHaveLength(1);
    expect(imageGuard.list(TEST_GUILD).some((e) => e.label === 'Crypto Drainer')).toBe(true);
  });
});
