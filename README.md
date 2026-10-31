# GameMate

**Your local AI gaming companion.**

GameMate is a Windows desktop app that puts an AI assistant beside you while you play. Ask it about crafting, enemies, strategy or anything else, and it can look at your game screen so you don't have to describe what you're seeing.

Everything runs **on your own computer**. GameMate uses AI models running locally through [Ollama](https://ollama.com), so your questions, screenshots and conversations never leave your PC, there are no subscription or per-question fees, and it keeps working without an internet connection once a model is installed.

## Features

- **Chat with a local AI.** Ask questions in a simple chat window and get answers in seconds.
- **Ask about your screen.** Attach a screenshot of your game window or your whole screen and ask "What is this creature?" or "What should I do next?". GameMate picks your Minecraft window automatically when it's open.
- **Choose your model.** Pick any model you've installed in Ollama, and switch between them at any time. Models that can see images are marked with 👁.
- **Private by design.** No accounts, no cloud services, nothing uploaded.
- **Starts fresh whenever you like.** Clear the conversation with one click.

## Requirements

- Windows 10 or 11
- [Ollama](https://ollama.com/download), installed and running
- At least one Ollama model. We recommend **Qwen 3.5 2B**, which is small, fast and works well on most NVIDIA GPUs.
- A dedicated NVIDIA GPU is recommended for fast answers, especially while a game is running.

## Getting started

1. **Install Ollama** from [ollama.com/download](https://ollama.com/download) and start it.
2. **Download a model.** Open a terminal and run:

   ```bash
   ollama pull qwen3.5:2b
   ```

   If answers aren't good enough and your GPU has more memory available, try the larger `qwen3.5:4b`.

3. **Install GameMate.** Download the latest installer from the [Releases](https://github.com/TSCKey/gamemate/releases) page and run it.
4. **Open GameMate** and start asking questions.

## Using GameMate

- Pick a model from the drop-down at the top of the window.
- Type your question and press **Enter** to send it. Use **Shift + Enter** for a new line.
- To ask about what's on screen, tick **Include screenshot of** and choose your game window or screen. GameMate takes a fresh screenshot each time you send a question. With the box ticked, you can also press **Enter** with an empty message to ask "What is happening on my screen?".
- On a new chat, click **📷 What's on my screen?** for a quick description of your screen.
- Click **New chat** to clear the conversation.
- Click **↻** to refresh the model list after installing a new model in Ollama.

## Troubleshooting

**"Could not reach Ollama. Is it running?"**
Make sure Ollama is running. You should see its icon in the system tray. If not, start Ollama from the Start menu, then click **↻** in GameMate.

**"No models installed"**
Download a model with `ollama pull qwen3.5:2b`, then click **↻**.

**"Include screenshot of" is greyed out**
The selected model can't see images. Pick a model marked with 👁, such as `qwen3.5:2b`.

**My game window isn't in the list**
Make sure the game is open and not minimized, then click the **↻** next to the list. If it still doesn't appear, choose your whole screen instead.

**Answers are slow**
Your game and the AI model share your GPU. Try a smaller model, close other GPU-heavy apps, or lower your game's graphics settings.

## Privacy

GameMate talks only to Ollama on your own computer (`127.0.0.1`). It only takes a screenshot when you send a question with **Include screenshot of** ticked, and that screenshot goes only to your local model. It doesn't save screenshots to disk, send your conversations anywhere, collect usage data or require an account.

## What GameMate won't do

GameMate is an assistant, not a bot. It never plays games for you, controls your keyboard or mouse, provides cheats, or modifies game files or processes.

## Building from source

For developers who want to run GameMate from the code:

```bash
git clone https://github.com/TSCKey/gamemate.git
cd gamemate
npm install
npm run dev
```

To build a Windows installer, run `npm run build:win`.

Built with Electron, React, TypeScript and Ollama.
