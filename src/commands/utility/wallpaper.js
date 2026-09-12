/*
 * Peace✘ - Discord Bot
 * Developed by Smith.Code
 *
 * /wallpaper [category] [name] - live Wallhaven API search (official API,
 * SFW purity, no scraping). Results are fetched ONCE and cached in memory
 * keyed by the message ID; the 🎲 Next button walks the cached list without
 * re-hitting the API (Wallhaven caps at 45 req/min). Works with
 * $wallpaper <query> too. All component customIds start with "wp_" so
 * interactionCreate.js routes them here via handleComponent().
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { COLORS, reply } = require('../../utils/helpers');
const { FOOTER_TEXT } = require('../../utils/decorations');

// --- Categories (Wallhaven: q = search term, bitmask = general/anime/people) ---
const CATEGORY_META = {
  anime: { label: 'Anime', emoji: '<a:anime:1536278666546253865>', terms: 'anime', bitmask: '010' },
  nature: { label: 'Nature', emoji: '<a:nature:1536278677753430066>', terms: 'nature', bitmask: '100' },
  cyberpunk: { label: 'Cyberpunk', emoji: '<a:cyberpunk:1536278672351170590>', terms: 'cyberpunk neon', bitmask: '100' },
  gaming: { label: 'Gaming', emoji: '<a:gaming:1536278674943250443>', terms: 'gaming', bitmask: '100' },
  space: { label: 'Space', emoji: '<:website:1536133053754384476>', terms: 'space', bitmask: '100' },
  aesthetic: { label: 'Aesthetic', emoji: '<a:lollo_sparks:1536134279442989056>', terms: 'aesthetic', bitmask: '100' },
  cars: { label: 'Cars', emoji: '<a:car:1536278669423546368>', terms: 'cars', bitmask: '100' },
};

const QUICK_CATEGORIES = ['anime', 'cyberpunk', 'nature'];

// --- Result cache: messageId -> { userId, category, label, results, index, createdAt } ---
// One API call per search; every button click only walks this cache.
const searchCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;
const CACHE_MAX = 100;

function cacheSet(messageId, entry) {
  const now = Date.now();
  for (const [id, cached] of searchCache) {
    if (now - cached.createdAt > CACHE_TTL) searchCache.delete(id);
  }
  if (searchCache.size >= CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(messageId, entry);
}

async function searchWallhaven({ term, category }) {
  const params = new URLSearchParams({ purity: '100', sorting: 'random', page: '1' });
  params.set('categories', category && CATEGORY_META[category] ? CATEGORY_META[category].bitmask : '111');
  if (term) params.set('q', term);
  if (process.env.WALLHAVEN_API_KEY) params.set('apikey', process.env.WALLHAVEN_API_KEY);

  const res = await fetch(`https://wallhaven.cc/api/v1/search?${params}`, {
    headers: { 'User-Agent': 'PeaceX-Wallpaper/1.0' },
  });
  if (res.status === 429) throw new Error('Wallhaven rate limit reached (45/min) — try again shortly.');
  if (!res.ok) throw new Error(`Wallhaven API error (HTTP ${res.status}).`);
  const json = await res.json();
  return (json.data || []).map((w) => ({
    id: w.id,
    url: w.path,
    resolution: w.resolution,
    views: w.views,
  }));
}

function buildSearch({ category, name }) {
  if (category && name) return null;
  const cat = category || null;
  const term = name ? name : cat ? CATEGORY_META[cat].terms : null;
  const label = name
    ? `Search: "${name}"`
    : cat
      ? `${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label}`
      : '<a:redplaying:1536133618399977577> Random wallpaper';
  return { category: cat, term, label };
}

function buildEmbed(entry, user) {
  const item = entry.results[entry.index];
  const meta = entry.category ? CATEGORY_META[entry.category] : null;
  return new EmbedBuilder()
    .setColor(COLORS.main)
    .setTitle(entry.label)
    .addFields(
      { name: 'Category', value: meta ? `${meta.emoji} ${meta.label}` : '<a:lollo_sparks:1536134279442989056> Custom', inline: true },
      { name: 'Requested by', value: `${user}`, inline: true },
      { name: 'Resolution', value: item.resolution, inline: true }
    )
    .setImage(item.url)
    .setFooter({
      text: `${FOOTER_TEXT} • Wallhaven #${item.id} • ${entry.index + 1}/${entry.results.length}`,
    })
    .setTimestamp();
}

function buildComponents(entry) {
  const atEnd = entry.index >= entry.results.length - 1;
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wp_next')
      .setLabel(atEnd ? 'No more results' : 'Next Wallpaper')
      .setEmoji('<a:next:1536278679708237856>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(atEnd),
    ...QUICK_CATEGORIES.map((cat) =>
      new ButtonBuilder()
        .setCustomId(`wp_${cat}`)
        .setLabel(CATEGORY_META[cat].label)
        .setStyle(ButtonStyle.Secondary)
    )
  );
  const menuRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('wp_select_category')
      .setPlaceholder('Switch category…')
      .addOptions(
        Object.keys(CATEGORY_META).map((cat) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(CATEGORY_META[cat].label)
            .setValue(cat)
            .setEmoji(CATEGORY_META[cat].emoji)
            .setDescription(`${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label} wallpapers`)
        )
      )
  );
  return [controlRow, menuRow];
}

async function handleComponent(interaction) {
  const entry = searchCache.get(interaction.message.id);
  try {
    if (interaction.customId === 'wp_next') {
      if (!entry) {
        return interaction.reply({ content: 'This search has expired — run `/wallpaper` again.', flags: MessageFlags.Ephemeral });
      }
      if (entry.userId !== interaction.user.id) {
        return interaction.reply({ content: "This isn't your search — run your own `/wallpaper`.", flags: MessageFlags.Ephemeral });
      }
      if (entry.index >= entry.results.length - 1) {
        return interaction.reply({ content: 'No more results for this search.', flags: MessageFlags.Ephemeral });
      }
      entry.index += 1;
      await interaction.update({ embeds: [buildEmbed(entry, interaction.user)], components: buildComponents(entry) });
      return;
    }

    const isQuickButton = interaction.isButton() && QUICK_CATEGORIES.includes(interaction.customId.slice(3));
    const isMenu = interaction.isStringSelectMenu() && interaction.customId === 'wp_select_category';
    if (!isQuickButton && !isMenu) return;

    if (entry && entry.userId !== interaction.user.id) {
      return interaction.reply({ content: "This isn't your search — run your own `/wallpaper`.", flags: MessageFlags.Ephemeral });
    }

    const category = isMenu ? interaction.values[0] : interaction.customId.slice(3);
    const search = buildSearch({ category });
    await interaction.deferUpdate();
    const results = await searchWallhaven(search);
    if (!results.length) {
      return interaction.editReply({
        content: `No wallpapers found for **"${category}"**. Wallhaven works best for themes like **anime, gaming, nature, abstract, cars, space** — try one of those instead of a person's name.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const next = { ...search, userId: interaction.user.id, results, index: 0, createdAt: Date.now() };
    await interaction.editReply({ embeds: [buildEmbed(next, interaction.user)], components: buildComponents(next) });
    cacheSet(interaction.message.id, next);
  } catch (err) {
    console.error('[PeaceX] [Wallpaper] Component error:', err);
    const content = { content: `<a:08_whiteexmark:1536133341965848668> ${err.message}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred) await interaction.editReply(content).catch(() => {});
    else await interaction.reply(content).catch(() => {});
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wallpaper')
    .setDescription('Search high-quality wallpapers (Wallhaven API)')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Wallpaper category')
        .setRequired(false)
        .addChoices(
          { name: 'Anime', value: 'anime' },
          { name: 'Nature', value: 'nature' },
          { name: 'Cyberpunk', value: 'cyberpunk' },
          { name: 'Gaming', value: 'gaming' },
          { name: 'Space', value: 'space' },
          { name: 'Aesthetic', value: 'aesthetic' },
          { name: 'Cars', value: 'cars' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Free-text search term (e.g. "purple skyline"); overrides category')
        .setRequired(false)
        .setMaxLength(64)
        .setAutocomplete(true)
    ),
  async execute(interaction, client) {
    const category = interaction.options.getString('category');
    const name = interaction.options.getString('name');
    if (category && name) {
      return reply(interaction, { content: 'Pick **one** — either a **category** or a free-text **name**, not both.', ephemeral: true });
    }

    const search = buildSearch({ category, name });
    await interaction.deferReply();
    try {
      const results = await searchWallhaven(search);
      if (!results.length) {
        const query = search.term || search.label;
        return interaction.editReply({
          content: `No wallpapers found for **"${query}"**. Wallhaven works best for themes like **anime, gaming, nature, abstract, cars, space** — try one of those instead of a person's name.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const entry = { ...search, userId: interaction.user.id, results, index: 0, createdAt: Date.now() };
      await interaction.editReply({ embeds: [buildEmbed(entry, interaction.user)], components: buildComponents(entry) });
      const message = await interaction.fetchReply();
      cacheSet(message.id, entry);
    } catch (err) {
      await interaction.editReply({ content: `<a:08_whiteexmark:1536133341965848668> ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
  async executePrefix(message, args, client) {
    const query = args.join(' ').trim().toLowerCase();
    let search;
    if (query && CATEGORY_META[query]) search = buildSearch({ category: query });
    else if (query) search = buildSearch({ name: query });
    else search = buildSearch({});

    try {
      const results = await searchWallhaven(search);
      if (!results.length) {
        const query = search.term || search.label;
        return message.channel
          .send(`No wallpapers found for **"${query}"**. Wallhaven works best for themes like **anime, gaming, nature, abstract, cars, space** — try one of those instead of a person's name.`)
          .catch(() => {});
      }
      const entry = { ...search, userId: message.author.id, results, index: 0, createdAt: Date.now() };
      const sent = await message.channel.send({
        embeds: [buildEmbed(entry, message.author)],
        components: buildComponents(entry),
      });
      cacheSet(sent.id, entry);
    } catch (err) {
      await message.channel.send(`<a:08_whiteexmark:1536133341965848668> ${err.message}`).catch(() => {});
    }
  },
  handleComponent,
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'name') return;
    const suggestions = ['anime', 'gaming', 'nature', 'abstract', 'cars', 'space', 'minimal', 'cyberpunk neon', 'aesthetic purple skyline', 'dark night city rain'];
    const input = focused.value.trim().toLowerCase();
    const matches = suggestions
      .filter((s) => s.toLowerCase().includes(input))
      .sort((a, b) => a.indexOf(input) - b.indexOf(input))
      .slice(0, 10)
      .map((s) => ({ name: s, value: s }));
    await interaction.respond(matches);
  },
};
