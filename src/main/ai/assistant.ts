// AI engine: combines the user's conversation, screenshots and game knowledge tools
// into a single answer from the chosen model (local, or Gemini if the player opted in).
import type { ChatMessage } from './ollamaClient'
import { complete, type LlmEngine, type LlmMessage, type LlmTool } from './llm'
import { findMentionedItems, lookupRecipe, searchItems, type RecipeView } from '../games/minecraft'
import type { GameContext } from '../games/current'
import { modInfo, searchMods } from '../games/modpacks'
import {
  findWikiForGame,
  lookupWiki,
  prefetchWiki,
  searchTerms,
  type WikiSite,
  type WikiSource
} from '../games/wiki'
import { minecraftIcons, pagePicture } from '../games/pictures'
import { searchWeb, type WebSearchResult } from './gemini'
import { allowWiki } from '../system/links'
import type { AnsweredBy, WikiPicture } from '../../shared/types'
import { t } from '../system/i18n'
export type { AnsweredBy }

// Stops a confused model from looping on tool calls forever.
const MAX_TOOL_ROUNDS = 4
// Recent messages sent along with a question: older ones only slow every answer down.
const MAX_HISTORY = 12
// How long a wiki page found up-front may hold up the answer; past that the AI looks it up.
const PREFETCH_WIKI_MS = 2500
// Questions about what's current or what players think, which wikis rarely keep up with: with
// web search on, GameMate searches before asking the AI (small models often don't call the tool).
const WEB_INTENT =
  /\b(meta|tier ?lists?|current(ly)?|right now|nowadays|latest|newest|recent(ly)?|this (season|patch|update)|seasons? \d+|patch(es)?|updates?|nerf(s|ed)?|buff(s|ed)?|reddit|community|trending|popular|pros?|news|release date|best (builds?|loadouts?|teams?|comps?|heroes|hero|characters?|weapons?|decks?|class(es)?|agents?|legends?|picks?))\b/i
// How long that search may hold up the answer.
const PREFETCH_SEARCH_MS = 15_000
const CRAFTING_INTENT = /\b(craft\w*|recipes?|make|made|build|create|need for)\b/i
// Questions that want a map rather than a picture of the place.
const MAP_INTENT = /\b(maps?|where (?:is|are)|location of|how (?:do i|to) get to)\b/i
// How long pictures may still be loading once the answer is written; slow ones are left out.
const PICTURE_WAIT_MS = 4000
const MAX_PICTURES = 2

export interface AssistantReply {
  role: 'assistant'
  content: string
  recipes?: RecipeView[]
  // Wiki and mod pages the answer used.
  sources?: WikiSource[]
  // Pictures from those wikis.
  pictures?: WikiPicture[]
  // Google's Search Suggestions, shown whenever the answer used a web search.
  searchSuggestions?: string
  // Which AI answered, and in Auto mode why.
  answeredBy?: AnsweredBy
}

export interface AssistantContext {
  engine: LlmEngine
  game: GameContext
  // What the always-on companion noticed recently, newest last.
  observations?: string[]
  // Allow looking things up online (the game's wiki, mod pages).
  webLookup: boolean
  // The player prefers long, detailed answers over short, direct ones.
  detailed?: boolean
  // Web search through Gemini with Google Search (only with the player's consent and key).
  search?: { apiKey: string; model: string }
  // Receives the answer so far while it is written; an empty string means it starts over.
  onText?: (text: string) => void
}

let asking = 0

// True while the player is waiting for an answer, so background work can hold off.
export function isAsking(): boolean {
  return asking > 0
}

function minecraftRules(ctx: AssistantContext): string {
  const mc = ctx.game.minecraft
  if (!mc) return ''
  const rules: string[] = []
  const pack = mc.modpack
  if (pack) {
    rules.push(
      `The player uses the modpack "${pack.name}"${pack.loader ? ` (${pack.loader})` : ''} with ${pack.mods.length} mods, so there are items, blocks and mechanics that aren't in plain Minecraft. Call modpack_mods to check whether a mod is installed${ctx.webLookup ? ', and mod_info to read what a mod does and how to start with it' : ''}.`
    )
  }
  if (mc.recipeVersion) {
    rules.push(
      `For any question about crafting or what an item is made of, ALWAYS call minecraft_recipe first (unless the recipe is already given below) and answer only from the recipe data; never guess a recipe.${pack ? ' The recipe data covers plain Minecraft only: for items from mods say you don’t have their recipe instead of guessing, and remember the modpack may change some recipes.' : ''}`,
      'GameMate shows the player each recipe you look up as a crafting grid picture, so do not write out the rows. Answer recipe questions in one or two sentences that only restate the recipe data (ingredients, amounts, whether a crafting table is needed); do not add any other facts.'
    )
  }
  return rules.join('\n')
}

// GameMate attaches the wiki's pictures itself; the AI must not claim it can't show them.
const PICTURE_RULE =
  'GameMate shows the player pictures from the wiki pages you use, such as the area map when they ask for a map or where a place is. Never say you cannot show a map or picture; describe the way in words and let the picture do the rest.'

function wikiRules(ctx: AssistantContext): string {
  const { game } = ctx
  if (ctx.webLookup && game.wiki) {
    return [wikiLookupRule(ctx), PICTURE_RULE].join('\n')
  }
  return game.minecraft
    ? `If there is no crafting recipe, the thing is probably built in the world or obtained another way: explain that from your general knowledge, without inventing a crafting recipe.`
    : `Answer from what you know about ${game.name}, and say so when you are not sure.`
}

function wikiLookupRule(ctx: AssistantContext): string {
  const { game } = ctx
  return game.minecraft
    ? `If there is no crafting recipe, or the question is about how something works, structures to build (like a Nether portal), mobs, biomes, enchantments, potions, trading or anything you are not sure about, call wiki_lookup and base your answer on the page. GameMate shows the player a link to it.`
    : `For any question about a specific boss, enemy, item, place, quest, character, recipe or game mechanic in ${game.name}, ALWAYS call wiki_lookup first and base your answer on the page; GameMate shows the player a link to it. Only skip it for small talk or questions about what is on screen.`
}

// How answers are written. Players asked for direct answers: small models otherwise restate the
// question, say where they looked and add tips nobody asked for.
const DIRECT_STYLE = [
  'Answer like a friend next to the player who just glanced at the screen: put the answer itself in the first sentence, and stop once the question is answered.',
  'Most answers are one to three short sentences. Only when the player asks how to do something that takes several steps, list the steps briefly.',
  'Do not repeat the question, do not say where the information comes from ("the wiki says", "I found"), and do not add tips or facts the player did not ask for.'
]
const DETAILED_STYLE = [
  'The player likes detailed answers: answer the question in the first sentence, then explain the details, steps and useful tips in a few short paragraphs.'
]
// Small models without an answer sometimes reply with the search they would run instead.
const NO_ANSWER_RULE =
  'If what you know and what you looked up do not answer the question, say in one sentence that you could not find a reliable answer. Never reply with a search query, a tool call or a list of things to look up.'

// Shown instead of a reply that isn't an answer (see isNonAnswer).
// What the player sees when the AI found nothing it can stand behind.
export const noAnswer = (): string => t('answers.noAnswer')

function systemPrompt(ctx: AssistantContext): string {
  const { game } = ctx
  const playing = game.minecraft?.edition ? `Minecraft ${game.minecraft.edition}` : game.name
  return [
    'You are GameMate, a friendly AI companion that helps people while they play video games.',
    `The player is playing ${playing}.`,
    `If the player asks about a different game, help with that game just as well: never say you can only help with ${playing}.${ctx.webLookup ? ` For facts about another game, call game_wiki with its name (not wiki_lookup, which only covers ${playing}).` : ''}`,
    ...(ctx.detailed ? DETAILED_STYLE : DIRECT_STYLE),
    NO_ANSWER_RULE,
    'Write plain text: no Markdown, headings or bold.',
    'When the user attaches a screenshot, it shows their screen right now: base your answer on what is actually visible in it, and say so if something is unclear or not visible.',
    minecraftRules(ctx),
    wikiRules(ctx),
    ctx.search
      ? 'When the wiki has no answer, or the question is about what is current (the meta, tier lists, the latest patch or season, nerfs and buffs) or what players recommend (strategies, builds, tips), call web_search with a short query that names the game.'
      : '',
    'Never invent game facts you are unsure about.'
  ]
    .filter(Boolean)
    .join('\n')
}

function observationsPrompt(observations: string[]): string {
  const list = observations.map((o) => `- ${o}`).join('\n')
  return `While the player was playing, GameMate noticed (use this as background for questions like "what should I do next?"):\n${list}`
}

const RECIPE_TOOLS: LlmTool[] = [
  {
    name: 'minecraft_recipe',
    description:
      'Look up the exact crafting recipe for a Minecraft item: ingredients, amounts and grid layout.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item name in English, e.g. "bookshelf"' }
      },
      required: ['item']
    }
  },
  {
    name: 'minecraft_search_items',
    description:
      'Search Minecraft items by name to find exact item names, stack sizes and whether they can be crafted.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of an item name, e.g. "copper"' }
      },
      required: ['query']
    }
  }
]

function wikiTool(ctx: AssistantContext): LlmTool {
  const wiki = ctx.game.wiki?.name ?? 'wiki'
  return {
    name: 'wiki_lookup',
    description: `Read the ${wiki} page about a ${ctx.game.name} topic: items, enemies, bosses, places, quests, crafting and game mechanics.`,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Short page-style topic name, e.g. a boss, item or place name'
        }
      },
      required: ['topic']
    }
  }
}

const OTHER_GAME_TOOL: LlmTool = {
  name: 'game_wiki',
  description:
    "Read a page from another game's community wiki, for questions about a game other than the one the player is playing.",
  parameters: {
    type: 'object',
    properties: {
      game: { type: 'string', description: 'Name of the game, e.g. "VALORANT"' },
      topic: { type: 'string', description: 'Short page-style topic, e.g. "Operator"' }
    },
    required: ['game', 'topic']
  }
}

// Wikis found for games named in questions, so each is only looked up once.
const otherWikis = new Map<string, WikiSite | null>()

const MODPACK_TOOL: LlmTool = {
  name: 'modpack_mods',
  description:
    "Check which mods in the player's modpack match a name, e.g. whether a mod is installed.",
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Part of a mod name, e.g. "create"' } },
    required: ['query']
  }
}

const MOD_INFO_TOOL: LlmTool = {
  name: 'mod_info',
  description:
    'Read the description of a Minecraft mod: what it adds and how to get started with it.',
  parameters: {
    type: 'object',
    properties: { mod: { type: 'string', description: 'The mod name, e.g. "Mekanism"' } },
    required: ['mod']
  }
}

function toolsFor(ctx: AssistantContext): LlmTool[] {
  const mc = ctx.game.minecraft
  return [
    ...(mc?.recipeVersion ? RECIPE_TOOLS : []),
    ...(ctx.webLookup && ctx.game.wiki ? [wikiTool(ctx)] : []),
    ...(ctx.webLookup ? [OTHER_GAME_TOOL] : []),
    ...(mc?.modpack ? [MODPACK_TOOL] : []),
    ...(mc?.modpack && ctx.webLookup ? [MOD_INFO_TOOL] : []),
    ...(ctx.search ? [WEB_SEARCH_TOOL] : [])
  ]
}

const WEB_SEARCH_TOOL: LlmTool = {
  name: 'web_search',
  description:
    "Search the web with Google for what the game's wiki doesn't cover: recent patches and changes, community strategies, builds and tips (for example from Reddit), or games without a wiki.",
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A short search query that names the game, e.g. "Silksong Last Judge tips"'
      }
    },
    required: ['query']
  }
}

interface Collected {
  recipes: RecipeView[]
  sources: WikiSource[]
  // The question was about another game (game_wiki was used).
  otherGame?: boolean
  // The player asked for a map.
  wantMap: boolean
  // Pictures of the wiki pages used, and recipe icons, loading while the AI writes.
  pictures: Promise<WikiPicture | null>[]
  recipeArt: Promise<void>[]
  // Google's Search Suggestions from a web search.
  searchSuggestions?: string
  // The searches and lookups made for this question (queries, topics, item names).
  asked: string[]
}

// Starts loading the picture of a wiki page the answer uses (online lookups only).
function addPagePicture(
  ctx: AssistantContext,
  out: Collected,
  site: WikiSite,
  title: string
): void {
  // When the player wants a map, a page about the map item itself isn't the place they mean.
  if (out.wantMap && /^maps?$/i.test(title.trim())) return
  if (ctx.webLookup && out.pictures.length < MAX_PICTURES) {
    out.pictures.push(pagePicture(site, title, out.wantMap))
  }
}

// Adds a recipe card, and starts loading its game icons and the crafted item's picture.
function addRecipe(ctx: AssistantContext, out: Collected, view: RecipeView): void {
  if (out.recipes.some((r) => r.item === view.item && r.count === view.count)) return
  out.recipes.push(view)
  const site = ctx.game.wiki
  if (!ctx.webLookup || !ctx.game.minecraft || !site) return
  out.recipeArt.push(
    (async () => {
      const [icons, picture] = await Promise.all([
        minecraftIcons(site, Object.values(view.iconItems)),
        pagePicture(site, view.item, false)
      ])
      view.icons = Object.fromEntries(
        Object.entries(view.iconItems)
          .filter(([, item]) => icons[item])
          .map(([label, item]) => [label, icons[item]])
      )
      if (picture) view.picture = picture
    })().catch(() => undefined)
  )
}

// Waits a little for the pictures still loading, then keeps the ones that arrived.
async function finishPictures(ctx: AssistantContext, out: Collected): Promise<WikiPicture[]> {
  const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), PICTURE_WAIT_MS))
  await Promise.all(out.recipeArt.map((art) => Promise.race([art, deadline])))
  // A recipe card already shows the item's picture.
  if (out.recipes.length) return []
  const found = await Promise.all(out.pictures.map((p) => Promise.race([p, deadline])))
  const pictures: WikiPicture[] = []
  for (const picture of found) {
    if (!picture || pictures.some((p) => p.url === picture.url)) continue
    // An answer about another game doesn't need the current game's pictures.
    if (out.otherGame && picture.wiki === ctx.game.wiki?.name) continue
    pictures.push(picture)
  }
  // A map question gets one map: the place asked about (looked up first).
  return out.wantMap ? pictures.slice(0, 1) : pictures
}

// Small models sometimes skip the tool and guess. For crafting questions that name an item,
// look the recipe up up-front and hand it to the model as context.
function prefetchRecipes(ctx: AssistantContext, question: string, out: Collected): string | null {
  const version = ctx.game.minecraft?.recipeVersion
  if (!version || !CRAFTING_INTENT.test(question)) return null
  const texts = findMentionedItems(version, question).map((name) => {
    const result = lookupRecipe(version, name)
    for (const view of result.views) addRecipe(ctx, out, view)
    return result.text
  })
  return texts.length ? `Recipe data for this question:\n\n${texts.join('\n\n')}` : null
}

// Reads the wiki page the question is clearly about before asking the AI, saving it a whole
// lookup round. Slow wikis are skipped; the AI can still call wiki_lookup itself.
async function prefetchPage(
  ctx: AssistantContext,
  question: string,
  out: Collected
): Promise<string | null> {
  const site = ctx.game.wiki
  if (!ctx.webLookup || !site || !question.trim()) return null
  const timeout = new Promise<[]>((resolve) => setTimeout(() => resolve([]), PREFETCH_WIKI_MS))
  const pages = await Promise.race([
    prefetchWiki(site, question, ctx.game.name).catch(() => []),
    timeout
  ])
  if (!pages.length) return null
  for (const page of pages) {
    addSource(out, page.source)
    if (page.source) addPagePicture(ctx, out, site, page.source.title)
  }
  const texts = pages.map((page) => page.text).join('\n\n')
  const more = ctx.search
    ? 'call wiki_lookup for a different page, or web_search for current or community information'
    : 'call wiki_lookup if you need a different page'
  return `GameMate looked these wiki pages up for this question (the player hasn't seen them; use them only if they fit the question, and ${more}):\n\n${texts}`
}

// The search GameMate runs before asking the AI, for questions about what's current or what
// players think: the question's own key words and the game's name ("Overwatch characters
// currently meta"). Null when the question isn't that kind.
export function webSearchQuery(question: string, gameName: string): string | null {
  if (!WEB_INTENT.test(question)) return null
  const terms = searchTerms(question)
  if (!terms.length) return null
  // Name the game unless the question already does.
  const named = searchTerms(gameName).every((w) => terms.includes(w))
  return [...(named ? [] : [gameName]), ...terms].join(' ').slice(0, 120)
}

// Runs a web search and records what it used. Logs only whether it worked, never the query.
async function runSearch(
  ctx: AssistantContext,
  out: Collected,
  query: string
): Promise<WebSearchResult | null> {
  if (!ctx.search) return null
  try {
    const result = await searchWeb(ctx.search.apiKey, ctx.search.model, query)
    console.info(`Web search ran (${result.sources.length} pages)`)
    out.asked.push(query)
    for (const source of result.sources) {
      addSource(out, { title: source.title, url: source.url, wiki: 'Google Search', license: '' })
    }
    out.searchSuggestions ??= result.suggestions
    return result
  } catch (error) {
    console.warn('Web search failed:', error instanceof Error ? error.message : error)
    throw error
  }
}

// Searches the web before asking the AI when the question is about what's current or what
// players think. A slow search is skipped; the AI can still search itself.
async function prefetchSearch(
  ctx: AssistantContext,
  question: string,
  out: Collected
): Promise<string | null> {
  const query = ctx.search ? webSearchQuery(question, ctx.game.name) : null
  if (!query) return null
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), PREFETCH_SEARCH_MS)
  )
  const result = await Promise.race([runSearch(ctx, out, query).catch(() => null), timeout])
  if (!result) return null
  return `GameMate searched the web for "${query}" (Google results, more current than the wiki; prefer them for what is current):\n\n${result.text}`
}

// Small models sometimes write a tool call as plain text (or start to); it is never part of the
// answer.
function withoutToolText(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '')
    .replace(/<function=[\s\S]*?(<\/function>|$)/g, '')
    .replace(/<[a-z_]*$/, '')
}

const TOOL_NAMES =
  /\b(web_search|wiki_lookup|game_wiki|minecraft_recipe|minecraft_search_items|modpack_mods|mod_info)\b/
const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

// A reply that isn't an answer: nothing, a tool call written out as text (JSON, "web_search(…)",
// Qwen's <function=…> tags), or just one of the searches or lookups made for this question.
export function isNonAnswer(text: string, asked: string[] = []): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^[{[]/.test(t) && /"(name|arguments|query|topic|parameters)"\s*:/.test(t)) return true
  if (/<\/?(tool_call|function|parameter)\b|<function=/.test(t)) return true
  if (TOOL_NAMES.test(t) && t.length < 300) return true
  const said = plain(t)
  return asked.some((q) => plain(q) === said)
}

function addSource(out: Collected, source: WikiSource | null): void {
  if (source && !out.sources.some((s) => s.url === source.url)) out.sources.push(source)
}

async function runTool(
  call: { name: string; arguments: Record<string, unknown> },
  ctx: AssistantContext,
  out: Collected
): Promise<string> {
  const arg = (key: string): string => String(call.arguments?.[key] ?? '').trim()
  const mc = ctx.game.minecraft
  try {
    switch (call.name) {
      case 'minecraft_recipe': {
        if (!mc?.recipeVersion) return 'No recipe data for this game version.'
        const result = lookupRecipe(mc.recipeVersion, arg('item'))
        for (const view of result.views) addRecipe(ctx, out, view)
        return result.text
      }
      case 'minecraft_search_items':
        if (!mc?.recipeVersion) return 'No item data for this game version.'
        return searchItems(mc.recipeVersion, arg('query'))
      case 'wiki_lookup': {
        if (!ctx.webLookup || !ctx.game.wiki) return 'Wiki lookups are turned off.'
        const result = await lookupWiki(ctx.game.wiki, arg('topic'))
        addSource(out, result.source)
        if (result.source) addPagePicture(ctx, out, ctx.game.wiki, result.source.title)
        return result.text
      }
      case 'game_wiki': {
        if (!ctx.webLookup) return 'Wiki lookups are turned off.'
        const name = arg('game').toLowerCase()
        if (!otherWikis.has(name)) otherWikis.set(name, await findWikiForGame(arg('game')))
        out.otherGame = true
        const site = otherWikis.get(name)
        if (!site) return `No wiki found for "${arg('game')}". Answer from what you know.`
        // Its pages may be opened from the answer.
        allowWiki(site)
        const result = await lookupWiki(site, arg('topic'))
        addSource(out, result.source)
        if (result.source) addPagePicture(ctx, out, site, result.source.title)
        return result.text
      }
      case 'modpack_mods':
        return mc?.modpack ? searchMods(mc.modpack, arg('query')) : 'No modpack in use.'
      case 'web_search': {
        if (!ctx.search) return 'Web search is turned off.'
        const result = await runSearch(ctx, out, arg('query'))
        if (!result) return 'Web search is turned off.'
        return `Web search results for "${arg('query')}":\n\n${result.text}`
      }
      case 'mod_info': {
        if (!ctx.webLookup) return 'Online lookups are turned off.'
        const result = await modInfo(arg('mod'))
        addSource(out, result.source)
        return result.text
      }
      default:
        return `Unknown tool ${call.name}.`
    }
  } catch (error) {
    return `Tool failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

export async function ask(ctx: AssistantContext, history: ChatMessage[]): Promise<AssistantReply> {
  asking++
  try {
    return await answer(ctx, history)
  } finally {
    asking--
  }
}

async function answer(ctx: AssistantContext, full: ChatMessage[]): Promise<AssistantReply> {
  let history = full.slice(-MAX_HISTORY)
  // Start at a question, not halfway through an exchange.
  while (history.length > 1 && history[0].role !== 'user') history = history.slice(1)
  // Only the latest message keeps its screenshot: older ones would slow every reply
  // and describe a screen that has since changed.
  const lastIndex = history.length - 1
  const messages: LlmMessage[] = [
    { role: 'system', content: systemPrompt(ctx) },
    ...(ctx.observations?.length
      ? [{ role: 'system' as const, content: observationsPrompt(ctx.observations) }]
      : []),
    ...history.map((m, i): LlmMessage =>
      m.role === 'user'
        ? {
            role: 'user',
            content: m.content,
            ...(i === lastIndex && m.images?.length ? { images: m.images } : {})
          }
        : { role: 'assistant', content: m.content }
    )
  ]

  const question = history[lastIndex]?.content ?? ''
  const out: Collected = {
    recipes: [],
    sources: [],
    wantMap: MAP_INTENT.test(question),
    pictures: [],
    recipeArt: [],
    asked: []
  }
  // Recipes, or the wiki page the question is about, and a web search for what's current.
  const recipes = prefetchRecipes(ctx, question, out)
  const [page, web] = await Promise.all([
    recipes ? null : prefetchPage(ctx, question, out),
    prefetchSearch(ctx, question, out)
  ])
  for (const known of [recipes ?? page, web]) {
    if (known) messages.splice(messages.length - 1, 0, { role: 'system', content: known })
  }
  const tools = toolsFor(ctx)

  let written = ''
  let shown = ''
  const onText = ctx.onText
    ? (delta: string): void => {
        written += delta
        const text = withoutToolText(written)
        if (text !== shown) ctx.onText?.((shown = text))
      }
    : undefined
  const startOver = (): void => {
    written = ''
    if (shown) ctx.onText?.((shown = ''))
  }

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last round, withhold tools so the model has to answer.
    if (round === MAX_TOOL_ROUNDS) {
      messages.push({
        role: 'system',
        content:
          'You have looked up enough. Answer the player now from what you found; no more lookups.'
      })
    }
    const reply = await complete(ctx.engine, messages, {
      tools: round < MAX_TOOL_ROUNDS && tools.length ? tools : undefined,
      onText
    })
    if (reply.toolCalls.length === 0) {
      // Small models sometimes put the whole answer in their thinking; ask once more without it.
      const answered = withoutToolText(reply.content).trim()
      if (!answered) startOver()
      const content =
        answered ||
        withoutToolText((await complete(ctx.engine, messages, { fast: true, onText })).content)
      return finish(ctx, out, content)
    }
    // Text written before a tool call was only a lead-in; the real answer follows the lookup.
    startOver()
    messages.push({
      role: 'assistant',
      content: reply.content,
      toolCalls: reply.toolCalls,
      raw: reply.raw
    })
    for (const call of reply.toolCalls) {
      for (const value of Object.values(call.arguments ?? {})) {
        if (typeof value === 'string') out.asked.push(value)
      }
      messages.push({
        role: 'tool',
        name: call.name,
        callId: call.id,
        content: await runTool(call, ctx, out)
      })
    }
  }
  // Still looking things up after every round: no answer.
  return finish(ctx, out, '')
}

// The reply, with what the answer used. A reply that isn't an answer becomes a plain "couldn't
// find a reliable answer" (and loses the pictures, which would suggest otherwise).
async function finish(
  ctx: AssistantContext,
  out: Collected,
  content: string
): Promise<AssistantReply> {
  const empty = isNonAnswer(content, out.asked)
  if (empty) ctx.onText?.(noAnswer())
  // An answer about another game doesn't need pages from the current game's wiki.
  const sources = out.otherGame
    ? out.sources.filter((src) => src.wiki !== ctx.game.wiki?.name)
    : out.sources
  const pictures = empty ? [] : await finishPictures(ctx, out)
  return {
    role: 'assistant',
    content: empty ? noAnswer() : content,
    answeredBy: {
      provider: ctx.engine.provider === 'gemini' ? 'gemini' : 'local',
      model: ctx.engine.model
    },
    ...(out.recipes.length && !empty ? { recipes: out.recipes } : {}),
    ...(sources.length ? { sources } : {}),
    ...(pictures.length ? { pictures } : {}),
    ...(out.searchSuggestions ? { searchSuggestions: out.searchSuggestions } : {})
  }
}
