# Peace✘ Bot 🤖

A Discord bot with **moderation**, **server utility**, **music**, and **security/anti-nuke** features, built with **discord.js v14**.

## Features

### 👑 Bot ownership
`/owner list|add|remove` — the main owner (your `OWNER_ID` in `.env`) can grant **extra owners** the same powers. `/botinfo` shows public bot info only.

### 🛡️ Moderation
`/kick`, `/ban`, `/timeout`, `/untimeout`, `/purge`, `/warn`, `/warnings`, `/unwarn`

### 🛠️ Utility
`/avatar`, `/serverinfo`, `/userinfo`, `/roles`, `/role give|remove|list`, `/giverole`, `/roleicon`, `/nickname`, `/namechange`, `/welcome`, `/goodbye`, `/lock`, `/unlock`, `/say`, `/poll`, `/remind`, `/ping`, `/stats`, `/help`, `/support`

### 🎵 Music
`/play`, `/skip`, `/stop`, `/queue`, `/volume`, `/loop`, `/leave`

`/play` accepts a **song name**, a **YouTube video/playlist link**, or a **Spotify link** (single track, album, or playlist — Spotify audio is played via its YouTube match). Audio streams are produced by **yt-dlp** (bundled), so playback keeps working even when YouTube changes its player.

**Spotify setup (optional, one-time):**
1. Create a free app at https://developer.spotify.com/dashboard → copy Client ID + Secret.
2. In the app settings add Redirect URI: `http://localhost:3000`.
3. Run `npm run spotify` and follow the prompts (this links your account, saving `.data/spotify.data`).
4. Restart the bot. `/play https://open.spotify.com/track/...` now works.

### 🔐 Security
| Command | What it does |
| --- | --- |
| `/security` | Master switch + set punishment (`warn`/`timeout`/`kick`) + auto-timeout threshold |
| `/whitelist` | Trusted users who bypass **all** filters |
| `/words` | Custom blocked-word filter |
| `/antilink` | Block all links except allow-listed domains + automatic scam-link blocking |
| `/antispam` | Auto-block message spam (configurable rate) |
| `/antinuke` | Detects rapid channel/role deletes or mass bans/kicks → auto **lockdown** |
| `/lockdown` | Manually lock every text channel (run again to lift) |

All security features are **automatic**:
- **Auto-warn** — rule breakers get warnings; at the threshold they are auto-timed-out.
- **Scam links** — common Discord-nitro / gift / freebie scam patterns are deleted instantly.
- **Custom word filter** — your own list of banned words/phrases.
- **Anti-nuke** — if someone nukes channels/roles or mass-bans, the bot locks the server, strips the attacker's roles and timeouts them.

### 📊 Server stats
`/stats setup` creates live member/bot counter channels that update automatically.

### 💬 Welcome & goodbye
`/welcome set channel:#welcome message:"Welcome {user} to {server}!" role:@Member`
`/goodbye set channel:#goodbye message:"Goodbye {user}!"`

### 📣 /say
`/say message:"hello"` — your command message is automatically deleted and the bot posts the text instead.

## Requirements

- **Node.js 18+** (https://nodejs.org)
- **ffmpeg** on your `PATH` (required for music playback).
  - Windows: `winget install Gyan.FFmpeg` or https://ffmpeg.org/download.html
  - Linux/macOS: `sudo apt install ffmpeg` / `brew install ffmpeg`
- **yt-dlp** — audio is streamed with yt-dlp for reliable YouTube playback. The binary is bundled automatically via `yt-dlp-exec` during `npm install` (if the postinstall is blocked, run `npm rebuild yt-dlp-exec`).

## Setup

1. **Create a bot** at https://discord.com/developers/applications
   - New Application → Bot → copy the **Token**.
   - Enable these **Privileged Gateway Intents**: `SERVER MEMBERS INTENT` and `MESSAGE CONTENT INTENT`.
2. **Invite the bot** with Administrator permissions:
   - `https://discord.com/api/oauth2/`
3. **Configure the environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_bot_application_id_here
   OWNER_ID=your_discord_user_id_here
   # Optional: set to a server ID to deploy commands instantly (recommended while testing)
   DEV_GUILD_ID=
   ```
4. **Install and run:**
   ```bash
   npm install
   npm start
   ```
   Slash commands are registered automatically on startup.

## Quick start for security

```text
/security on
/antispam on
/antilink on
/antinuke on
/words add <word>
/whitelist add @friend
```

## Project structure

```
src/
├── index.js              # Bot entry point, client setup, command/event loader
├── commands/
│   ├── moderation/       # kick, ban, timeout, purge, warn, warnings, unwarn
│   ├── utility/          # avatar, poll, reminder, say, stats, role, welcome, goodbye...
│   ├── music/            # play, skip, stop, queue, volume, loop, leave
│   └── security/         # security, whitelist, words, antispam, antilink, antinuke
├── events/               # interactionCreate, guildMemberAdd/Remove, messageCreate, antiNuke
├── music/manager.js      # Voice queue & playback manager (play-dl)
└── utils/                # helpers, settings store, security checks, stats counters
```

Settings are persisted in `data/settings.json`.