/*
 * Peace✘ - Shared command loader.
 *
 * THE single source of truth for what gets registered. Used by:
 *   - scripts/deploy.js       (global + guild deploys)
 *   - /refresh command         (instant per-guild register)
 *
 * Applying the exclusions (scripts/exclude.js) here means every registration
 * path deploys the exact same set — never the raw file count, which exceeds
 * Discord's 100-command cap and makes the API return 400.
 *
 * NOTE: this module has no side effects and uses __dirname (not cwd), so it is
 * safe to require from anywhere in the codebase or from scripts.
 */
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { isCommandExcluded } = require('./exclude');
const { applyCommandGroups } = require('../src/utils/commandGroups');

/**
 * Returns an array of serialized slash-command payloads (ready for REST PUT),
 * loaded from src/commands (all subfolders), with excluded commands filtered out
 * and command groups applied so the deployed set matches the runtime collection
 * (e.g. the separate vcstats/vctask/vcstats_custom/vchart files are only exposed
 * as the /vc stats, /vc task, /vc custom_stats and /vc chart subcommands).
 */
function loadCommands() {
  const collection = new Collection();
  const commandsDir = path.join(__dirname, '..', 'src', 'commands');
  fs.readdirSync(commandsDir, { withFileTypes: true }).forEach((dir) => {
    if (!dir.isDirectory()) return;
    for (const file of fs.readdirSync(path.join(commandsDir, dir.name))) {
      if (!file.endsWith('.js')) continue;
      const command = require(path.join(commandsDir, dir.name, file));
      if (command?.data?.name && !isCommandExcluded(command.data.name)) collection.set(command.data.name, command);
    }
  });

  applyCommandGroups(collection);

  return [...collection.values()].map((command) => command.data.toJSON());
}

module.exports = { loadCommands };