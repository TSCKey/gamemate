// AI engine: combines the user's conversation, screenshots and game knowledge tools
// into a single answer from the chosen model (local, or Gemini if the player opted in).
import type { ChatMessage } from './ollamaClient'
import { complete, type LlmEngine, type LlmMessage, type LlmTool } from './llm'
import { findMentionedItems, lookupRecipe, searchItems, type RecipeView } from './games/minecraft'
import type { GameContext } from './games/current'
import { modInfo, searchMods } from './games/modpacks'
import { lookupWiki, type WikiSource } from './wiki'

// Stops a confused model from looping on tool calls forever.
const MAX_TOOL_ROUNDS = 4
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

export interface AnsweredBy {
  provider: 'local' | 'gemini'
  model: string
  reason?: string
}

export interface AssistantContext {
  engine: LlmEngine
  game: GameContext
  // What the always-on companion noticed recently, newest last.
  observations?: string[]
  // Allow looking things up online (the game's wiki, mod pages).
  webLookup: boolean
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
  const playing = game.minecraft ? `Minecraft ${game.minecraft.edition}` : game.name
  return [
    'You are GameMate, a friendly AI companion that helps people while they play video games.',
    `The player is playing ${playing}.`,
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
    ...(mc?.modpack ? [MODPACK_TOOL] : []),
    ...(mc?.modpack && ctx.webLookup ? [MOD_INFO_TOOL] : [])
  ]
}

interface Collected {
  recipes: RecipeView[]
  sources: WikiSource[]
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

async function answer(ctx: AssistantContext, history: ChatMessage[]): Promise<AssistantReply> {
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
  const known = prefetchRecipes(ctx, history[lastIndex]?.content ?? '', out)
  if (known) messages.splice(messages.length - 1, 0, { role: 'system', content: known })
  const tools = toolsFor(ctx)

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last round, withhold tools so the model has to answer.
    const reply = await complete(ctx.engine, messages, {
      tools: round < MAX_TOOL_ROUNDS && tools.length ? tools : undefined
    })
    if (reply.toolCalls.length === 0) {
      return {
        role: 'assistant',
        content: reply.content,
        answeredBy: {
          provider: ctx.engine.provider === 'gemini' ? 'gemini' : 'local',
          model: ctx.engine.model
        },
        ...(out.recipes.length ? { recipes: out.recipes } : {}),
        ...(out.sources.length ? { sources: out.sources } : {})
      }
    }
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
