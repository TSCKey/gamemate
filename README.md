# GameMate

**Your local AI gaming companion.**

GameMate is a Windows desktop app that puts an AI assistant beside you while you play. Press **Alt + Space** in the middle of a game, type your question, and get an answer without leaving the game. It can look at your screen so you don't have to describe what you're seeing, it knows the real Minecraft crafting recipes, and if you like, it can watch your game and speak up when something important happens. You can even ask out loud and hear the answer.

By default everything runs **on your own computer**. GameMate uses AI models running locally through [Ollama](https://ollama.com), so your questions, screenshots and conversations stay on your PC, there are no subscription or per-question fees, and it keeps working without an internet connection once a model is installed. If you want smarter answers, you can switch on Google's Gemini with your own API key, and let GameMate look things up on the Minecraft Wiki.

## Features

- **Ask without leaving your game.** Press **Alt + Space** and a small window appears on top of your game. Type a question, read the answer, and press **Esc** to get back to playing.
- **Real Minecraft recipes.** Ask "How do I craft a bookshelf?" and GameMate looks up the actual recipe for your Minecraft version and shows it as a crafting grid, instead of guessing. Supports Minecraft Java Edition 26.1, 1.21.11, 1.21.4 and 1.20.4.
- **Always-on companion (optional).** Turn on Commentary mode and GameMate watches your game, popping up a short comment when it spots danger, low health, a death or a great find. You decide how chatty it is.
- **Talk to it.** Press **Alt + V** and ask your question out loud. GameMate can read its answers and comments aloud, too. Speech recognition and the voice both run on your PC.
- **Ask about your screen.** Attach a screenshot of your game window or your whole screen and ask "What is this creature?" or "What should I do next?". GameMate picks your Minecraft window automatically when it's open.
- **Choose your model.** Pick any model you've installed in Ollama, and switch between them at any time. Models that can see images are marked with 👁.
- **Chat window.** A full chat window for longer conversations.
- **Runs in the background.** Closing the window keeps GameMate in the system tray, ready for **Alt + Space**.
- **Looks things up.** Turn on wiki lookup and GameMate reads [minecraft.wiki](https://minecraft.wiki) for things that aren't crafted, like building a Nether portal, taming a wolf or what an enchantment does, and links to the page it used.
- **Local or cloud, your choice.** Use the local model for everything, or Gemini for questions, the companion, or both.
- **Private by default.** No accounts, nothing uploaded, unless you choose Gemini or wiki lookup.

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

### Always-on companion

Click **🎮 Companion** at the top of the chat window to choose how much GameMate watches and talks on its own:

| Mode                    | What GameMate does                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disabled**            | Never looks at your screen, not even when you press **Alt + Space**.                                                                                                    |
| **On-demand** (default) | Only looks and answers when you ask.                                                                                                                                    |
| **Observation**         | Watches your game and keeps a log of what it noticed in the Companion panel, without pop-ups.                                                                           |
| **Commentary**          | Watches your game and pops up a short comment when something important happens, such as a creeper nearby, low health, dying, entering a dark cave or finding a village. |
| **Quiet**               | Watches silently and uses what it saw only to answer your questions.                                                                                                    |

- In Commentary mode, use **Comments** to choose how often GameMate speaks up: **Rarely** (big moments only), **Sometimes**, or **Often**. It also waits a while before commenting on the same kind of thing again.
- Comments appear in the top-right corner of the screen for a few seconds. They never take focus, so your keyboard and mouse stay in the game. Click a comment to dismiss it.
- In any watching mode, GameMate remembers what it saw recently, so questions like "What should I do next?" get better answers.
- Click **⏸ Pause** in the Companion panel, or **Pause watching** in the tray icon's menu, to stop watching for a while.
- GameMate only watches while the Minecraft game window is the active window. When you alt-tab away, it stops. To spare your GPU, it only asks the AI about your screen when the picture has changed, at most every 12 seconds.

### AI engine and wiki lookup

Click **🧠 AI** at the top of the chat window (it shows **☁ AI** while Gemini is in use).

- **Which AI answers:** choose **Local model** or **Gemini**, separately for **Questions** (chat and **Alt + Space**) and the **Companion** (always-on watching).
- **Gemini:**
  1. Get a free API key at [aistudio.google.com](https://aistudio.google.com).
  2. Paste it and click **Save key**. GameMate checks it with Google, stores it encrypted on your PC, and lists the Gemini models your key can use.
  3. Pick a model. A Flash model is a good balance of speed and quality.
- **Look things up:** tick **Let the AI read minecraft.wiki**. When a question needs more than a crafting recipe, the AI reads the matching wiki page. The answer shows **Source:** with a link to it.
- When questions go to Gemini, the in-game window shows **☁ Gemini**.

### Voice

Click **🔊 Voice** at the top of the chat window.

**Asking by voice**

1. Tick **Ask questions with your microphone**.
2. Choose a speech model and click **Download**. You only do this once, and after that voice works offline.
   - **Fast** (45 MB) understands you quicker.
   - **Accurate** (80 MB) makes fewer mistakes but takes a few seconds longer.
3. In a game, press **Alt + V** and ask your question. GameMate stops listening when you pause, then sends your question. In the chat window, click **🎤** instead.

Press **Alt + V** or click **🎤** again to stop listening early, or press **Esc** in the in-game window to cancel and hide it. The **Alt + V** shortcut only exists while voice input is turned on, so the key stays free for your games otherwise.

**GameMate's voice**

- **Read answers aloud:** Never, When I ask by voice (the default), or Always.
- **Read companion comments aloud:** speaks Commentary mode's pop-ups.
- Choose a **Voice** and set the **Volume** and **Speed**. Click **🔊 Test** to hear it. GameMate uses the voices built into Windows.

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

**Commentary mode never says anything**
Check the status line in the Companion panel. It needs Minecraft to be the active window and a model marked with 👁. GameMate only comments on important moments, so try **Comments: Often**. Smaller models may miss things, and `qwen3.5:4b` sees more if your GPU has room for it.

**Alt + V does nothing, or the 🎤 button is missing**
Turn on **Ask questions with your microphone** in **🔊 Voice** and download the speech model. If another app uses **Alt + V**, the Voice panel tells you, and you can still click **🎤**.

**"GameMate is not allowed to use the microphone"**
Open Windows **Settings → Privacy & security → Microphone** and allow desktop apps to use the microphone.

**GameMate doesn't understand me**
Speak after the 🎤 lights up, and pause briefly when you're done. Try the **Accurate** speech model, and check that the right microphone is set as the default in Windows sound settings.

**"Gemini rejected the API key" or "usage limit was reached"**
Check the key at aistudio.google.com and paste it again in **🧠 AI**. Free keys have per-minute and daily limits, and the Companion can use them up quickly, so consider setting **Companion** back to **Local model**.

**Answers are slow**
Your game and the AI model share your GPU. Try a smaller model, close other GPU-heavy apps, or lower your game's graphics settings.

## Privacy

GameMate is local by default. Two optional features use the internet, and only when you turn them on:

- **Gemini** sends the questions and screenshots for the jobs you set to Gemini to Google, under [Google's terms](https://ai.google.dev/gemini-api/terms). That includes recent observations from the companion and, if the Companion is set to Gemini, its screenshots. Your API key is encrypted with Windows' per-user protection, and GameMate never shows it again or sends it anywhere except Google.
- **Wiki lookup** sends only the topic, such as "Nether Portal", to minecraft.wiki.

Otherwise, GameMate talks only to Ollama on your own computer (`127.0.0.1`). It takes screenshots only:

- when you send a question with **Include screenshot of** ticked,
- when you press **Alt + Space** with **📷** turned on, and
- while Minecraft is the active window, if you've turned on Observation, Commentary or Quiet mode. These modes are off by default. The tray icon and the Companion panel always show whether GameMate is watching.

Screenshots go only to the AI you chose and are never saved to disk. What GameMate noticed is kept in memory only, and is forgotten when you switch back to On-demand or Disabled or quit GameMate. GameMate doesn't send your conversations anywhere, collect usage data or require an account. Choose **Disabled** to turn off all screen access.

GameMate only uses the microphone while 🎤 is lit, after you press **Alt + V** or click **🎤**. Your voice is turned into text on your PC and is never recorded to disk or sent anywhere. Speech models are downloaded once from Hugging Face when you click **Download**.

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

Built with Electron, React, TypeScript and Ollama. Speech recognition uses OpenAI's Whisper (MIT), converted by [onnx-community](https://huggingface.co/onnx-community) and run with [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0). Minecraft item and recipe data comes from [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data) (MIT). Wiki lookups read [minecraft.wiki](https://minecraft.wiki), whose content is licensed CC BY-NC-SA 3.0. GameMate is not affiliated with Mojang or Microsoft.
