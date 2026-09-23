> 📦 **Deploy new/changed commands:** `npm run deploy` — registration happens
> from exactly ONE place (`scripts/deploy.js`), global scope only. See
> [DEPLOY.md](DEPLOY.md) for details.

# Peace✘ - Command Reference
All commands are slash (`/`) commands.

# 🎯Permission Tiers

    Tier	        Access	            Gate
🟢 Everyone	    No restriction	         —
🟡 Admin	    whitelisted         /whitelisted
🟠 Trusted	    owner or /trusted list   current server only
🔴 Owner	    Owner/co-owner      only	OWNER_ID global; /extraowner add current server

# Denied → <a:wrong:1550504971303395430> You don't have permission to use this command.
## Discord-native permissions (ManageRoles, ManageChannels, etc.) still apply on top of the tier.


# 🟢 Everyone

`General`   :  /avatar /serverinfo /userinfo /roles /poll /remind /ping /support /help
`Personal`  :  /note add/edit/list/remove /afk
`Voice`     :  /vc stats /stop /disconnect (warn if 24/7 mode is on)
`VC gated`  :  /vc task /vc custom_stats /vc chart (require a role set via /vcrole)

# 🟡 Admin (owner/co-owner or whitelisted)

/leave /timeout /untimeout /warn /warnings /security status /whitelist list /words 
* /antiwords * /ignore list /antispam on/off /lock lock/unlock /say /role list

# 🔴 Owner / Co-owner only

`Owner mgmt`    : /extraowner list/add/remove/temp /trusted list/add/remove (current server) /setprofile /dm /mention
`Moderation`    : /kick /ban /unban /purge /purge_user /purge_all_server_user /unwarn /nuke /idban /removeroll /removerollall /quarantine jail/release/bypass*
`Channel`       : /vc kick/kickall/mute/muteall/unmute/unmuteall/deafen/undeafen/list/moveall/lock/unlock/hide/show /channel hide/show/nsfw/slowmode
`24/7 voice`    : /247 on/end/status [channel] /vc247 set/off/status — bot stays in a VC around the clock & auto-rejoins on kick/move/disconnect
`Tickets`       : /ticket setup/setlog/panel/close
`Roles/emoji`   : /giverole /roleicon /stealemoji /rolemanage info/all/strip/inrole
`Server config` : /autorole add/remove /addrole all mem /invite log set/remove /setup_tempvc set/remove /nickname /stats setup/disable/status /vcrole /setlog /embed /announce /backup /leaveserver /serverlist
`Extras`        : /snipe /purgebots /picture user/server/icon
`Security`      : /safety on/off/status /security on/off/action/threshold /whitelist add/remove /antilink * /antinuke on/off /scamdetect on/off /lockdown /ignore add/remove

Context menu (Owner): right-click a message → `Translate Message` (Google translate, no key)




                                             `Command Details`


# 👑 Owner

/extraowner list	Show all extra owners in this server
/extraowner add user:<user>	Grant owner powers in this server (main owner only)
/extraowner remove user:<user>	Revoke owner powers in this server (main owner only)
/extraowner temp user:<user> minutes:<n>	Grant temporary owner powers in this server (main owner only)
/setprofile [username] [avatar]	Change bot's username/avatar
/dm user:<user> message:<text>	DM a server member
/autorole add role:<role>	Auto-assign a role to every new member (removes with /autorole remove)
/addrole all mem role:<role>	Add a role to EVERY member of the server
/invite log set channel:<channel>	Set the invite-tracking log channel
/invite log remove	Disable invite logging
/setup_tempvc set creation_channel:<vc>	Members joining that VC get a private temp VC below it plus an owner-only control-panel chat (both auto-deleted when empty)
/setup_tempvc remove	Disable temporary VCs
/mention user:<user> count:<1-10>	Ping a user repeatedly (owner only)

## 👑 Owner — Moderation

/idban user_id:<id> [reason] [delete_messages]	Ban a user by ID (not in server)
/quarantine jail user:<user> [duration:min] [reason]	Jail: strip roles + assign jail role (timed auto-release)
/quarantine release user:<user> [reason]	Release and restore all stripped roles
/quarantine role <role>	Set the jail role (required before jail)
/quarantine bypass-add / bypass-remove <role>	Exempt roles from quarantine
/quarantine bypass-status	Show config + jailed count
## 👑 Owner — Voice & Channels

/vc kick user:<user> [reason]	Disconnect a user from voice
/vc kickall [channel]	Disconnect everyone in a VC
/vc mute / unmute user:<user>	Server-mute / unmute a user
/vc muteall / unmuteall [channel]	Server-mute / unmute a whole VC
/vc deafen / undeafen user:<user>	Server-deafen / undeafen a user
/vc list [channel]	List everyone in a VC (mute/deafen states + time in VC)
/vc moveall target:<vc> [channel]	Move everyone from one VC to another
/vc lock / unlock [channel]	Block / allow @everyone joining a VC
/vc hide / show [channel]	Hide / show a VC from @everyone
/vc247 set channel:<vc>	Bot stays in that VC 24/7 (auto-rejoins on kick/move/disconnect)
/vc247 off	Disable 24/7 and leave voice
/vc247 status	Show the 24/7 setup
/247 mode:<on|end|status> [channel]	Short 24/7 toggle: on = bot joins & stays, end = free the bot, status = current setup
/channel hide / show [channel]	Hide / show any channel from @everyone
/channel nsfw enabled:<bool> [channel]	Toggle NSFW on a text channel
/channel slowmode seconds:<0-21600> [channel]	Set channel slowmode
/channel status vc:<vc> name:<name>	Set a custom status for a voice channel

## 👑 Owner — Roles

/removeroll member:<member>	Remove all removable roles from one member
/removerollall role:<role>	Remove a role from every member who has it

/rolemanage info role:<role>	Role details: color, position, members, key permissions
/rolemanage all source:<role> target:<role>	Give target role to everyone holding source role
/rolemanage strip user:<user> [include_bots]	Strip every role from a member
/rolemanage inrole role:<role>	List all members holding a role

## 👑 Owner — Extras

/snipe [channel] [index]	Show a recently deleted message (up to 10 cached)
/purgebots [channel] [amount]	Delete all bot messages in a channel
/embed title:<t> [description] [color] [thumbnail] [image] [footer] [fields]	Send a custom embed (fields: "Name;Value|Name;Value")
/announce channel:<ch> title:<t> message:<m> [ping]	Post an announcement embed (optional role ping)
/picture user [user]	Show a user's banner (Nitro required)
/picture server	Show the server banner (Boosting level 2 required)
/picture icon	Show the server icon
/leaveserver guild_id:<id>	Make the bot leave a server
/serverlist	List every server the bot is in
/backup	Export server structure + bot settings as JSON
/namestyle	Customize how the bot's name appears (font, color)

Owners stored in data/owners.json. Extra owners (via /extraowner add) get full Tier 2 + Tier 3 access in the current server only. Only the main owner edits the owner list.


# 🛡️ Moderation

Command	Description
/kick user:<user> [reason]	Kick a member (owner or trusted member)
/ban user:<user> [reason] [days:0-7]	Ban a member, optionally purge messages (owner or trusted member)
/unban [user] [all:True] [reason]	Unban one member, or unban everyone (all: True)
/timeout user:<user> duration:<1-40320>	Timeout (minutes, max 28 days; owner or trusted member)
/untimeout user:<user> [reason]	Remove timeout
/purge amount:<1-100> [user]	Bulk-delete messages (<14 days old)
/purge_user user:<user> count:<1-100>	Delete that user's messages in the current channel (Owner only)
/purge_all_server_user user:<user>	Delete that user's messages across every channel (Owner only)
/warn user:<user> [reason]	Warn a member
/warnings [user]	Show warning count
/unwarn user:<user>	Clear all warnings
/nuke	Delete + recreate current channel

# 🎫 Tickets

/ticket setup role:<role>	Set staff role for tickets
/ticket setlog channel:<channel>	Set transcript log channel
/ticket panel channel:<channel>	Post ticket panel embed
/ticket close	Close ticket + save transcript

One open ticket per user per category. @everyone denied; creator + staff role allowed. Closing saves HTML transcript → log channel → deletes channel.

# 🛠️ Utility

/ping	Latency + uptime
/avatar [user]	Show avatar
/serverinfo / /userinfo [user]	Server / user stats
/roles	List server roles
/role list [user]	List a member's roles
/giverole user:<user> role:<role> [action]	Add/remove role (alt syntax)
/roleicon role:<role> [icon] [clear]	Set/clear role icon
/nickname nickname:<name> [user]	Change nickname
/say message:<text> [channel]	Bot posts your message (admin; message deleted)
/poll question:<text> option1..9	Emoji-reaction poll
/remind time:<duration> what:<text>	DM reminder
/note add/edit/list/remove	Personal notes (max 15)
/afk [reason]	Set AFK status
/stats setup/disable/status	Live member/bot counters
/setlog category:<category> channel:<channel>	Route event logs
/stealemoji emoji:<emoji> [name]	Add emoji to server
/support	Support info/link
/stop	Leave voice. While 24/7 mode is on → refuses with a warning (only /247 mode:end frees it)
/disconnect	Leave voice. While 24/7 mode is on → refuses with a warning (only /247 mode:end frees it)
/vc stats [member]	Weekly VC time + hours needed to reach the active goal (open to **everyone**)
/vc custom_stats start_date:<YYYY-MM-DD> end_date:<YYYY-MM-DD> [member]	VC time for a custom date period (requires the role set with /vcrole)
/vc task role:<role>	Weekly VC time for every member with a role (leaderboard) (requires the role set with /vcrole)
/vc chart [period]	Server-wide weekly VC activity chart (this / last week) (requires the role set with /vcrole)
/vcrole set role:<role>	Give ONLY that role access to /vc task, /vc custom_stats and /vc chart (owner only; /vc stats stays open to everyone)
/vcrole remove	Remove the role restriction → the three commands become owner-only until a role is set again
/vcrole status	Show the current VC role restriction
/counter	Setup and manage the premium counting game
/verification <enable/disable>	Drop an interactive verification panel in the current channel

# 🛠 Owner tools (new)

Translate Message (context menu)	Right-click a message → translate to English (free Google endpoint, no key)

# 🔐 Security

/safety on	Turn ON every safety protection with one command (anti-spam, anti-link, scam detect, anti-nuke, profanity)
/safety off	Turn OFF every safety protection with one command
/safety status	Show each protection as a Protocol-status line
/security on/off	Toggle auto-moderation (message filters)
/security action <warn|timeout|kick>	Set punishment
/security threshold count:<1-10>	Warnings before auto-timeout
/security status	Overview
/whitelist add/remove/list	Manage trusted users (bypass all filters)
/words add/remove/list (alias /antiwords)	Manage blocked words
/ignore add/remove/list [channel]	Exempt channels from moderation
/antispam on/off [max] [interval]	Auto-block message spam
/antilink on/off/allow/disallow/list	Link filtering + domain allow-list
/antinuke on/off/punishment/whitelist-role/lockdown/status	Instant-action anti-nuke (single unauthorized action → punish executor at once)
/scamdetect on/off/status	Scam-link scanning
/lockdown	Lock/unlock all text channels (toggle)

Automatic (no command): scam-link deletion, auto-warn → auto-timeout at threshold, escalating profanity timeout (blocked words delete instantly: 1st=2min, 2nd=12hr, 3rd+=1day timeout — counts survive restarts, logged under /setlog security), **instant-action anti-nuke** (any unauthorized ban/unban/kick/channel/role/webhook/sticker/emoji/server change, bot add, or @everyone → executor punished instantly + optional lockdown; guild owner / bot owners / security-whitelist / whitelist-roles bypass), whitelist bypass.

# Placeholders

{user} → member mention · {server} → server name

`[Discord-native permission requirements]`

ManageMessages	/purge, /say, /lock lock/unlock (partial)
ModerateMembers	/warn, /warnings, /unwarn, /timeout
KickMembers/BanMembers	/kick, /ban, /unban
ManageRoles	/role, /roleicon, /giverole
ManageChannels	/lock lock/unlock, /nuke, /ticket *
ManageGuild	/stats, /setlog
Administrator	/security*, /whitelist, /words, /lockdown, /dm



# Peace✘ - Developed by <smith.code>