# Peace✘ Bot 🤖

A Discord bot with **moderation**, **server utility**, **security/anti-nuke**, and **owner tooling**, built with **discord.js v14**.

> 🎵 **Music moved out.** All music commands now live in the separate **Peace music** bot
> (folder `Peace music`, its own token/application). This bot is security + regular use only.

## Features

### 👑 Bot ownership
`/owner list|add|remove` — the main owner (your `OWNER_ID` in `.env`) can grant **extra owners** the same powers. `/botinfo` shows public bot info only.

### 🛡️ Moderation
`/kick`, `/ban`, `/timeout`, `/untimeout`, `/purge`, `/warn`, `/warnings`, `/unwarn`

### 🛠️ Utility
`/avatar`, `/serverinfo`, `/userinfo`, `/roles`, `/role give|remove|list`, `/giverole`, `/roleicon`, `/nickname`, `/welcome`, `/goodbye`, `/lock`, `/unlock`, `/say`, `/poll`, `/remind`, `/ping`, `/stats`, `/help`, `/support`

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

## Music ➜ separate bot

All `/play`, `/skip`, `/stop`, `/queue`, `/volume`, `/loop`, `/radio`, playlists, filters, and the now-playing card
now run in the **Peace music** bot (`D:\DISCORD BOT\Peace music`). See that folder's README for its own setup —
audio is streamed with **yt-dlp**, so it needs **ffmpeg** on `PATH` and the **Voice States** intent.

## Requirements

- **Node.js 18+** (https://nodejs.org)
- No **ffmpeg** needed for this bot anymore (music lives in the Peace music bot).

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
5. **Register (or update) slash commands:**
   ```bash
   npm run deploy
   ```
   Command registration happens in exactly one place — `scripts/deploy.js` (global scope, single occurrence per server).
   Run it again after adding/changing commands. Verified against Discord's 100-command global cap.

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
│   ├── owner/            # owner mgmt, moderation, voice/channel, roles, extras
│   ├── security/         # security, whitelist, words, antispam, antilink, antinuke
│   └── utility/          # avatar, poll, reminder, say, stats, role, welcome, goodbye...
├── events/               # interactionCreate, guildMemberAdd/Remove, messageCreate, antiNuke
└── utils/                # helpers, settings store, security checks, stats counters
```

Settings are persisted in `data/settings.json`.