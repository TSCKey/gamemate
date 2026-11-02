// AI engine: combines the user's conversation, screenshots and game knowledge tools
// into a single answer from the chosen model (local, or Gemini if the player opted in).
import type { ChatMessage } from './ollamaClient'
import { complete, type LlmEngine, type LlmMessage, type LlmTool } from './llm'
import { findMentionedItems, lookupRecipe, searchItems, type RecipeView } from './games/minecraft'
import type { GameContext } from './games/current'
import { modInfo, searchMods } from './games/modpacks'
import { findWikiForGame, lookupWiki, prefetchWiki, type WikiSite, type WikiSource } from './wiki'
import type { AnsweredBy } from '../shared/types'
export type { AnsweredBy }

// Stops a confused model from looping on tool calls forever.
const MAX_TOOL_ROUNDS = 4
// Recent messages sent along with a question: older ones only slow every answer down.
const MAX_HISTORY = 12
// How long a wiki page found up-front may hold up the answer; past that the AI looks it up.
const PREFETCH_WIKI_MS = 2500
const CRAFTING_INTENT = /\b(craft\w*|recipes?|make|made|build|create|need for)\b/i

export interface AssistantReply {
  role: 'assistant'
  content: string
  recipes?: RecipeView[]
  // Wiki and mod pages the answer used.
  sources?: WikiSource[]
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

function wikiRules(ctx: AssistantContext): string {
  const { game } = ctx
  if (ctx.webLookup && game.wiki) {
    return game.minecraft
      ? `If there is no crafting recipe, or the question is about how something works, structures to build (like a Nether portal), mobs, biomes, enchantments, potions, trading or anything you are not sure about, call wiki_lookup and base your answer on the page. GameMate shows the player a link to it.`
      : `For any question about a specific boss, enemy, item, place, quest, character, recipe or game mechanic in ${game.name}, ALWAYS call wiki_lookup first and base your answer on the page; GameMate shows the player a link to it. Only skip it for small talk or questions about what is on screen.`
  }
  return game.minecraft
    ? `If there is no crafting recipe, the thing is probably built in the world or obtained another way: explain that from your general knowledge, without inventing a crafting recipe.`
    : `Answer from what you know about ${game.name}, and say so when you are not sure.`
}

function systemPrompt(ctx: AssistantContext): string {
  const { game } = ctx
  const playing = game.minecraft?.edition ? `Minecraft ${game.minecraft.edition}` : game.name
  return [
    'You are GameMate, a friendly AI companion that helps people while they play video games.',
    `The player is playing ${playing}.`,
    `If the player asks about a different game, help with that game just as well: never say you can only help with ${playing}.${ctx.webLookup ? ' For facts about another game, call game_wiki with its name (not wiki_lookup, which only covers ${playing}).' : ''}`,
    'Answer clearly and briefly (a few sentences), like a knowledgeable friend sitting next to the player.',
    'Write plain text: no Markdown, headings or bold.',
    'When the user attaches a screenshot, it shows their screen right now: base your answer on what is actually visible in it, and say so if something is unclear or not visible.',
    minecraftRules(ctx),
    wikiRules(ctx),
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
    ...(mc?.modpack && ctx.webLookup ? [MOD_INFO_TOOL] : [])
  ]
}

interface Collected {
  recipes: RecipeView[]
  sources: WikiSource[]
  // The question was about another game (game_wiki was used).
  otherGame?: boolean
}

// Small models sometimes skip the tool and guess. For crafting questions that name an item,
// look the recipe up up-front and hand it to the model as context.
function prefetchRecipes(ctx: AssistantContext, question: string, out: Collected): string | null {
  const version = ctx.game.minecraft?.recipeVersion
  if (!version || !CRAFTING_INTENT.test(question)) return null
  const texts = findMentionedItems(version, question).map((name) => {
    const result = lookupRecipe(version, name)
    out.recipes.push(...result.views)
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
  for (const page of pages) addSource(out, page.source)
  const texts = pages.map((page) => page.text).join('\n\n')
  return `GameMate looked these wiki pages up for this question (the player hasn't seen them; use them only if they fit the question, and call wiki_lookup if you need a different page):\n\n${texts}`
}

// Small models sometimes write a tool call as plain text (or start to); it is never part of the
// answer.
function withoutToolText(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?(<\/tool_call>|$)/g, '').replace(/<[a-z_]*$/, '')
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
        // Skip recipes already looked up for this question.
        for (const view of result.views) {
          if (!out.recipes.some((r) => r.item === view.item && r.count === view.count)) {
            out.recipes.push(view)
          }
        }
        return result.text
      }
      case 'minecraft_search_items':
        if (!mc?.recipeVersion) return 'No item data for this game version.'
        return searchItems(mc.recipeVersion, arg('query'))
      case 'wiki_lookup': {
        if (!ctx.webLookup || !ctx.game.wiki) return 'Wiki lookups are turned off.'
        const result = await lookupWiki(ctx.game.wiki, arg('topic'))
        addSource(out, result.source)
        return result.text
      }
      case 'game_wiki': {
        if (!ctx.webLookup) return 'Wiki lookups are turned off.'
        const name = arg('game').toLowerCase()
        if (!otherWikis.has(name)) otherWikis.set(name, await findWikiForGame(arg('game')))
        out.otherGame = true
        const site = otherWikis.get(name)
        if (!site) return `No wiki found for "${arg('game')}". Answer from what you know.`
        const result = await lookupWiki(site, arg('topic'))
        addSource(out, result.source)
        return result.text
      }
      case 'modpack_mods':
        return mc?.modpack ? searchMods(mc.modpack, arg('query')) : 'No modpack in use.'
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

  const out: Collected = { recipes: [], sources: [] }
  const question = history[lastIndex]?.content ?? ''
  const known = prefetchRecipes(ctx, question, out) ?? (await prefetchPage(ctx, question, out))
  if (known) messages.splice(messages.length - 1, 0, { role: 'system', content: known })
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
      // An answer about another game doesn't need pages from the current game's wiki.
      const sources = out.otherGame
        ? out.sources.filter((src) => src.wiki !== ctx.game.wiki?.name)
        : out.sources
      return {
        role: 'assistant',
        content,
        answeredBy: {
          provider: ctx.engine.provider === 'gemini' ? 'gemini' : 'local',
          model: ctx.engine.model
        },
        ...(out.recipes.length ? { recipes: out.recipes } : {}),
        ...(sources.length ? { sources } : {})
      }
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
      messages.push({
        role: 'tool',
        name: call.name,
        callId: call.id,
        content: await runTool(call, ctx, out)
      })
    }
  }
  throw new Error('The model did not produce an answer.')
}
