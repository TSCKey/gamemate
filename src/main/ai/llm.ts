// One interface over the two AI engines: the local Ollama model and, if the player opts in,
// Google Gemini. Callers build a provider-neutral conversation; each adapter translates it.
import { chatOnce, type OllamaMessage } from './ollamaClient'
import { generate, type GeminiContent, type GeminiPart, type GeminiRequest } from './gemini'
import { chatCompletion } from './llamaClient'
import { withEngine } from './llamaEngine'
import { t } from '../system/i18n'

// GameMate's built-in engine (llama.cpp), an Ollama install, or Google Gemini.
export type Provider = 'builtin' | 'ollama' | 'gemini'

export interface LlmToolCall {
  id?: string
  name: string
  arguments: Record<string, unknown>
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string; images?: string[] }
  // raw: the provider's own copy of this turn, sent back unchanged (Gemini thought signatures).
  | { role: 'assistant'; content: string; toolCalls?: LlmToolCall[]; raw?: unknown }
  | { role: 'tool'; name: string; content: string; callId?: string }

export interface LlmTool {
  name: string
  description: string
  // JSON Schema for the arguments.
  parameters: object
}

export interface LlmOptions {
  tools?: LlmTool[]
  // JSON Schema the reply must follow.
  jsonSchema?: object
  // Skip slow reasoning (used for frequent background checks).
  fast?: boolean
  // Receives the answer's text as it is written (engines that can stream it).
  onText?: (delta: string) => void
}

export interface LlmReply {
  content: string
  toolCalls: LlmToolCall[]
  raw?: unknown
}

export interface LlmEngine {
  provider: Provider
  // Built-in: the catalog id (see localModels.ts). Ollama and Gemini: the model name.
  model: string
  // Gemini only.
  apiKey?: string
}

async function viaOllama(
  model: string,
  messages: LlmMessage[],
  options: LlmOptions
): Promise<LlmReply> {
  const converted: OllamaMessage[] = messages.map((m) => {
    switch (m.role) {
      case 'system':
        return { role: 'system', content: m.content }
      case 'user':
        return {
          role: 'user',
          content: m.content,
          ...(m.images?.length ? { images: m.images } : {})
        }
      case 'assistant':
        return {
          role: 'assistant',
          content: m.content,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  function: { name: c.name, arguments: c.arguments }
                }))
              }
            : {})
        }
      case 'tool':
        return { role: 'tool', tool_name: m.name, content: m.content }
    }
  })
  const reply = await chatOnce(model, converted, {
    tools: options.tools?.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters as never }
    })),
    format: options.jsonSchema,
    ...(options.fast ? { think: false } : {}),
    onText: options.onText
  })
  return {
    content: reply.content,
    toolCalls: (reply.tool_calls ?? []).map((c) => ({
      name: c.function.name,
      arguments: c.function.arguments ?? {}
    }))
  }
}

// Gemini's response schema uses OpenAPI-style upper-case types.
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema)
  if (typeof schema !== 'object' || schema === null) return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') out.type = value.toUpperCase()
    else if (key === 'properties' && typeof value === 'object' && value !== null) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)])
      )
    } else out[key] = toGeminiSchema(value)
  }
  return out
}

async function viaGemini(
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  options: LlmOptions
): Promise<LlmReply> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content)
  const contents: GeminiContent[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const parts: GeminiPart[] = [{ text: m.content }]
      for (const data of m.images ?? [])
        parts.push({ inlineData: { mimeType: 'image/jpeg', data } })
      contents.push({ role: 'user', parts })
    } else if (m.role === 'assistant') {
      if (m.raw) contents.push(m.raw as GeminiContent)
      else {
        contents.push({
          role: 'model',
          parts: [
            ...(m.content ? [{ text: m.content }] : []),
            ...(m.toolCalls ?? []).map((c) => ({
              functionCall: { ...(c.id ? { id: c.id } : {}), name: c.name, args: c.arguments }
            }))
          ]
        })
      }
    } else if (m.role === 'tool') {
      const part: GeminiPart = {
        functionResponse: {
          ...(m.callId ? { id: m.callId } : {}),
          name: m.name,
          response: { result: m.content }
        }
      }
      // Results of one turn's calls go together in a single user turn.
      const last = contents.at(-1)
      if (last?.role === 'user' && last.parts.every((p) => p.functionResponse))
        last.parts.push(part)
      else contents.push({ role: 'user', parts: [part] })
    }
  }

  const request: GeminiRequest = {
    ...(system.length ? { systemInstruction: { parts: [{ text: system.join('\n\n') }] } } : {}),
    contents,
    ...(options.tools?.length
      ? {
          tools: [
            {
              functionDeclarations: options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parametersJsonSchema: t.parameters
              }))
            }
          ]
        }
      : {}),
    ...(options.jsonSchema
      ? {
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: toGeminiSchema(options.jsonSchema) as object
          }
        }
      : {})
  }
  const content = await generate(apiKey, model, request)
  return {
    // Thought summaries are not part of the answer.
    content: content.parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join(''),
    toolCalls: content.parts
      .filter((p) => p.functionCall)
      .map((p) => ({
        id: p.functionCall?.id,
        name: p.functionCall?.name ?? '',
        arguments: p.functionCall?.args ?? {}
      })),
    raw: content
  }
}

export function complete(
  engine: LlmEngine,
  messages: LlmMessage[],
  options: LlmOptions = {}
): Promise<LlmReply> {
  if (engine.provider === 'gemini') {
    if (!engine.apiKey) throw new Error(t('errors.gemini.addKey'))
    return viaGemini(engine.apiKey, engine.model, messages, options)
  }
  if (engine.provider === 'builtin') {
    return withEngine(engine.model, (server) => chatCompletion(server, messages, options))
  }
  return viaOllama(engine.model, messages, options)
}
