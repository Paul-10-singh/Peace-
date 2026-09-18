const OWNER_MERGES = [
  'addroleall',
  'dm',
  'embed',
  'idban',
  'leaveserver',
  'mention',
  'removeroll',
  'removerollall',
  'serverlist',
  'setprofile',
  'snipe',
];

const UTILITY_MERGES = ['all', 'ping', 'support'];

function asSubcommand(command) {
  const data = command.data.toJSON();
  const options = data.options || [];
  if (options.some((option) => option.type === 1 || option.type === 2)) return null;
  return {
    type: 1,
    name: data.name,
    description: data.description || `Run ${data.name}`,
    options,
  };
}

function mergeInto(collection, groupName, names) {
  const group = collection.get(groupName);
  if (!group) return;

  const merged = {};
  const subcommands = [];
  for (const name of names) {
    const command = collection.get(name);
    const subcommand = command && asSubcommand(command);
    if (!command || !subcommand) continue;
    merged[name] = command;
    subcommands.push(subcommand);
    collection.delete(name);
  }

  if (!subcommands.length) return;
  const originalData = group.data.toJSON();
  const existingNames = new Set((originalData.options || []).map((option) => option.name));
  const data = {
    ...originalData,
    options: [...(originalData.options || []), ...subcommands.filter((option) => !existingNames.has(option.name))],
  };
  group.data = { toJSON: () => data };
  group.__mergedCommands = { ...(group.__mergedCommands || {}), ...merged };
}

function applyCommandGroups(collection) {
  mergeInto(collection, 'owner', OWNER_MERGES);
  mergeInto(collection, 'utility', UTILITY_MERGES);
  return collection;
}

function getCommandForInteraction(command, subcommand) {
  return command?.__mergedCommands?.[subcommand] || command;
}

module.exports = { applyCommandGroups, getCommandForInteraction };
