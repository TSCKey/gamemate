# GameMate

**Your local AI gaming companion.**

GameMate is a Windows desktop app that puts an AI assistant beside you while you play. Press **Alt + Space** in the middle of a game, type your question, and get an answer without leaving the game. It can look at your screen so you don't have to describe what you're seeing, and it knows the real Minecraft crafting recipes.

Everything runs **on your own computer**. GameMate uses AI models running locally through [Ollama](https://ollama.com), so your questions, screenshots and conversations never leave your PC, there are no subscription or per-question fees, and it keeps working without an internet connection once a model is installed.

## Features

- **Ask without leaving your game.** Press **Alt + Space** and a small window appears on top of your game. Type a question, read the answer, and press **Esc** to get back to playing.
- **Real Minecraft recipes.** Ask "How do I craft a bookshelf?" and GameMate looks up the actual recipe for your Minecraft version and shows it as a crafting grid, instead of guessing. Supports Minecraft Java Edition 26.1, 1.21.11, 1.21.4 and 1.20.4.
- **Ask about your screen.** Attach a screenshot of your game window or your whole screen and ask "What is this creature?" or "What should I do next?". GameMate picks your Minecraft window automatically when it's open.
- **Choose your model.** Pick any model you've installed in Ollama, and switch between them at any time. Models that can see images are marked with 👁.
- **Chat window.** A full chat window for longer conversations.
- **Runs in the background.** Closing the window keeps GameMate in the system tray, ready for **Alt + Space**.
- **Private by design.** No accounts, no cloud services, nothing uploaded.

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

### In-game: Alt + Space

1. While playing, press **Alt + Space**. A small GameMate window appears on top of your game.
2. Type your question and press **Enter**.
3. Press **Esc** (or **Alt + Space** again) to hide it and keep playing.

- When the **📷** button is lit, GameMate includes a screenshot of your screen, taken at the moment you pressed **Alt + Space**. Click **📷** to turn this on or off. GameMate's own window never appears in the screenshot.
- Follow-up questions continue the same conversation. Click **✕** to start a new one. The conversation starts fresh by itself if you haven't used GameMate for 10 minutes.
- Drag the 🎮 icon to move the window.
- For the window to appear over your game, set the game to **windowed** or **borderless/windowed fullscreen**. Windows doesn't let other apps draw over exclusive fullscreen.

### Chat window

- Pick your Minecraft version and AI model from the drop-downs at the top. Both are remembered, and the in-game window uses the same choices.
- Type your question and press **Enter** to send it. Use **Shift + Enter** for a new line.
- To ask about what's on screen, tick **Include screenshot of** and choose your game window or screen. GameMate takes a fresh screenshot each time you send a question. With the box ticked, you can also press **Enter** with an empty message to ask "What is happening on my screen?".
- On a new chat, click **📷 What's on my screen?** for a quick description of your screen.
- Click **New chat** to clear the conversation.
- Click **↻** to refresh the model list after installing a new model in Ollama.
- Closing the window keeps GameMate running in the system tray. Right-click the tray icon to open it again or to quit.

## Troubleshooting

**Alt + Space does nothing**
Another app may already use that shortcut, for example PowerToys Run. The chat window shows a notice when this happens. Change or turn off the other app's shortcut, then restart GameMate. Also check that GameMate is still running in the system tray.

**The GameMate window doesn't show up over my game**
Switch the game to windowed or borderless fullscreen. In Minecraft, press **F11** to toggle fullscreen.

**A recipe looks wrong or is missing**
Make sure the Minecraft version at the top of the chat window matches the version you're playing. GameMate knows crafting-table recipes. Items that are smelted, brewed, traded or built in the world (such as Nether portals) don't have a crafting recipe.

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

GameMate talks only to Ollama on your own computer (`127.0.0.1`). It only takes screenshots when you ask for them: when you send a question with **Include screenshot of** ticked, or when you press **Alt + Space** with **📷** turned on. Screenshots go only to your local model. It doesn't save screenshots to disk, send your conversations anywhere, collect usage data or require an account.

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

To refresh the bundled Minecraft data, run `node scripts/build-minecraft-data.mjs`.

Built with Electron, React, TypeScript and Ollama. Minecraft item and recipe data comes from [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data) (MIT). GameMate is not affiliated with Mojang or Microsoft.
