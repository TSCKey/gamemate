// AI engine: combines the user's conversation, screenshots and game knowledge tools
// into a single answer from the local model.
import { chatOnce, type ChatMessage, type OllamaMessage, type ToolDefinition } from './ollamaClient'
import { findMentionedItems, lookupRecipe, searchItems, type RecipeView } from './games/minecraft'

// Stops a confused model from looping on tool calls forever.
const MAX_TOOL_ROUNDS = 4
const CRAFTING_INTENT = /\b(craft\w*|recipes?|make|made|build|create|need for)\b/i

export interface AssistantReply {
  role: 'assistant'
  content: string
  recipes?: RecipeView[]
}

export interface AssistantContext {
  model: string
  minecraftVersion: string
}

function systemPrompt(minecraftVersion: string): string {
  return `You are GameMate, a friendly AI companion that helps people while they play video games.
The player is playing Minecraft Java Edition ${minecraftVersion}.
Answer clearly and briefly (a few sentences), like a knowledgeable friend sitting next to the player.
Write plain text: no Markdown, headings or bold.
When the user attaches a screenshot, it shows their screen right now: base your answer on what is actually visible in it, and say so if something is unclear or not visible.
For any question about crafting or what an item is made of, ALWAYS call minecraft_recipe first (unless the recipe is already given below) and answer only from the recipe data; never guess a recipe.
GameMate shows the player each recipe you look up as a crafting grid picture, so do not write out the rows. Answer recipe questions in one or two sentences that only restate the recipe data (ingredients, amounts, whether a crafting table is needed); do not add any other facts.
If there is no crafting recipe, the thing is probably built in the world or obtained another way: explain that from your general knowledge, without inventing a crafting recipe.
Never invent game facts you are unsure about.`
}

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
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
    }
  },
  {
    type: 'function',
    function: {
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
  }
]

// Small models sometimes skip the tool and guess. For crafting questions that name an item,
// look the recipe up up-front and hand it to the model as context.
function prefetchRecipes(
  ctx: AssistantContext,
  question: string,
  recipes: RecipeView[]
): string | null {
  if (!CRAFTING_INTENT.test(question)) return null
  const texts = findMentionedItems(ctx.minecraftVersion, question).map((name) => {
    const result = lookupRecipe(ctx.minecraftVersion, name)
    recipes.push(...result.views)
    return result.text
  })
  return texts.length ? `Recipe data for this question:\n\n${texts.join('\n\n')}` : null
}

function runTool(
  call: { name: string; arguments: Record<string, unknown> },
  ctx: AssistantContext,
  recipes: RecipeView[]
): string {
  const arg = (key: string): string => String(call.arguments?.[key] ?? '').trim()
  try {
    switch (call.name) {
      case 'minecraft_recipe': {
        const result = lookupRecipe(ctx.minecraftVersion, arg('item'))
        // Skip recipes already looked up for this question.
        for (const view of result.views) {
          if (!recipes.some((r) => r.item === view.item && r.count === view.count))
            recipes.push(view)
        }
        return result.text
      }
      case 'minecraft_search_items':
        return searchItems(ctx.minecraftVersion, arg('query'))
      default:
        return `Unknown tool ${call.name}.`
    }
  } catch (error) {
    return `Tool failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

export async function ask(ctx: AssistantContext, history: ChatMessage[]): Promise<AssistantReply> {
  // Only the latest message keeps its screenshot: older ones would slow every reply
  // and describe a screen that has since changed.
  const lastIndex = history.length - 1
  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt(ctx.minecraftVersion) },
    ...history.map((m, i) => ({
      role: m.role,
      content: m.content,
      ...(i === lastIndex && m.images?.length ? { images: m.images } : {})
    }))
  ]

  const recipes: RecipeView[] = []
  const known = prefetchRecipes(ctx, history[lastIndex]?.content ?? '', recipes)
  if (known) messages.splice(messages.length - 1, 0, { role: 'system', content: known })

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last round, withhold tools so the model has to answer.
    const reply = await chatOnce(ctx.model, messages, round < MAX_TOOL_ROUNDS ? TOOLS : undefined)
    if (!reply.tool_calls?.length) {
      // Keep only the answer: drop fields such as `thinking` from reasoning models.
      return { role: 'assistant', content: reply.content, ...(recipes.length ? { recipes } : {}) }
    }
    messages.push({ role: 'assistant', content: reply.content, tool_calls: reply.tool_calls })
    for (const call of reply.tool_calls) {
      messages.push({
        role: 'tool',
        tool_name: call.function.name,
        content: runTool(call.function, ctx, recipes)
      })
    }
  }
  throw new Error('The model did not produce an answer.')
}
