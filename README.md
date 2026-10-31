# GameMate – Local AI Gaming Companion

An intelligent, context-aware desktop assistant powered by lightweight local language and vision models.

GameMate is a Windows desktop application that runs in the background while you play, understands what's happening in your game, answers questions about what you see, and can proactively comment on important gameplay events. Think of it as an intelligent companion sitting next to you while you play.

It initially focuses on **Minecraft**, but the architecture is modular so other games — and eventually general desktop assistance — can be added without redesigning the AI engine.

All AI runs **locally** through [Ollama](https://ollama.com). No cloud API is required: screenshots, questions and conversations stay on your computer.

## How it works

### Mode 1 – On-demand assistant

Press a global shortcut (e.g. `Alt + Space`) and a small floating window appears over your game. Ask things like:

- _"What is happening on my screen?"_ / _"What is this creature?"_
- _"How do I craft a bookshelf?"_ / _"How do I make a Nether portal?"_
- _"Which items are visible in my inventory?"_

GameMate can capture the game window and send it to a vision-capable model, so you don't have to describe everything yourself. Close the window and keep playing.

### Mode 2 – Always-on companion

Optionally, GameMate observes your gameplay and comments when something important happens — entering a dark cave, a creeper approaching, finding a village, low health, dying.

| Setting          | Behaviour                                        |
| ---------------- | ------------------------------------------------ |
| Disabled         | GameMate stops observing                         |
| On-demand        | Only responds when called                        |
| Observation mode | Observes gameplay without automatically speaking |
| Commentary mode  | Observes and comments on important events        |
| Quiet mode       | Observes but only responds to direct questions   |

Commentary frequency is adjustable so the assistant doesn't become annoying.

## Architecture

```
Game / Desktop environment
        │
1. Capture Module      – screenshots, active window, user-provided context
        │
   ┌────┴─────────────┐
2A. Vision Module    2B. Game Knowledge
   (scenes, objects)     (recipes, items, mobs, rules)
   └────┬─────────────┘
3. AI Engine           – local LLM: interprets questions, calls tools, generates answers
        │
4. Response Module     – floating UI, chat, notifications, commentary, (later) voice
```

- **Capture** – captures the game window on demand or periodically; only invokes the AI when needed.
- **Vision** – multimodal model (Qwen 3.5 2B, with 4B as a fallback) to understand screenshots.
- **Game Knowledge** – structured local data (recipes, items, blocks, mobs, biomes, enchantments…). Factual answers like crafting recipes come from the database, not from the LLM guessing.
- **AI Engine** – a small local model made useful by giving it relevant context and tools.
- **Response** – text overlay first; local text-to-speech and speech-to-text later.

## Roadmap

### Phases 1–4 – Foundation ✅

- [x] Electron + React + TypeScript desktop app (electron-vite)
- [x] Ollama client connecting to `http://127.0.0.1:11434`
- [x] IPC handlers in the main process with input validation
- [x] Minimal, sandboxed preload API (`window.api`)
- [x] Basic chat interface with model selection

### Phase 5 – Screen understanding

- [ ] Implement desktop screenshot capture
- [ ] Send screenshot to vision model
- [ ] Ask questions about gameplay

### Phase 6 – Minecraft knowledge

- [ ] Load Minecraft recipe data
- [ ] Implement recipe lookup
- [ ] Connect lookup functions to LLM

### Phase 7 – Always-on mode

- [ ] Implement background observation
- [ ] Detect important gameplay events
- [ ] Generate contextual commentary
- [ ] Add pause and cooldown controls

### Phase 8 – Voice

- [ ] Implement local speech-to-text
- [ ] Implement local text-to-speech
- [ ] Add voice settings

### Releases

| Version | Main capabilities                                                                           |
| ------- | ------------------------------------------------------------------------------------------- |
| 1.0     | Desktop app, local LLM, floating assistant, keyboard shortcut, screenshot questions         |
| 2.0     | Minecraft knowledge database, background observation, event detection, automatic commentary |
| 3.0     | Voice interaction, multiple games, advanced context understanding, game integrations        |

## What GameMate is not

GameMate is an assistant, not a bot. It does not play games for you, control your keyboard or mouse, provide cheats, manipulate game processes, or continuously record or upload your screen. Screen and microphone access is transparent, user-controlled and easy to disable. For games with anti-cheat systems, integrations respect their rules and use supported interfaces.

## Getting started

Requirements: Windows, Node.js, [Ollama](https://ollama.com) running locally, and a model pulled:

```bash
ollama pull qwen3.5:2b
```

```bash
npm install
npm run dev
```

Build a Windows installer:

```bash
npm run build:win
```

## Tech stack

Electron · React · TypeScript · electron-vite · Ollama · Qwen 3.5 (2B / 4B)
