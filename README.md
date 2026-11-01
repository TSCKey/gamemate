# GameMate

**Your local AI gaming companion.**

GameMate is a Windows desktop app that puts an AI assistant beside you while you play. Press **Alt + Space** in the middle of a game, type your question, and get an answer without leaving the game. It recognizes the game you're playing, can look at your screen so you don't have to describe what you're seeing, reads your game's wiki when it isn't sure, knows the real Minecraft crafting recipes and your CurseForge modpacks, and if you like, it can watch your game and speak up when something important happens. You can even ask out loud and hear the answer.

By default everything runs **on your own computer**. GameMate comes with its own AI engine: download a model once from inside the app and it answers right on your PC, so your questions, screenshots and conversations stay there, there are no subscription or per-question fees, and it keeps working without an internet connection. Already use [Ollama](https://ollama.com)? GameMate can use your Ollama models instead. If you want smarter answers, you can switch on Google's Gemini with your own API key, and let GameMate look things up on your game's wiki.

## Features

- **Ask without leaving your game.** Press **Alt + Space** and a small window appears on top of your game. Type a question, read the answer, and press **Esc** to get back to playing.
- **Many games.** GameMate recognizes Minecraft (Java and Bedrock), Terraria, Valheim, Elden Ring, Baldur's Gate 3, Satisfactory, Factorio, RimWorld, Don't Starve, Subnautica, No Man's Sky, Hollow Knight, Hades, Skyrim, The Witcher 3, Cyberpunk 2077 and Palworld, and you can add any other game, with its wiki.
- **Knows your modpack.** GameMate reads your CurseForge modpacks (and the pack that's running in other launchers), so it knows which mods you have, and can read what a mod does.
- **Real Minecraft recipes.** Ask "How do I craft a bookshelf?" and GameMate looks up the actual recipe for your Minecraft version and shows it as a crafting grid, instead of guessing. Supports Minecraft Java Edition 26.1, 1.21.11, 1.21.4 and 1.20.4.
- **Always-on companion (optional).** Turn on Commentary mode and GameMate watches your game, popping up a short comment when it spots danger, low health, a death or a great find. You decide how chatty it is.
- **Talk to it.** Press **Alt + V** and ask your question out loud. GameMate can read its answers and comments aloud, too. Speech recognition and the voice both run on your PC.
- **Ask about your screen.** Attach a screenshot of your game window or your whole screen and ask "What is this creature?" or "What should I do next?". GameMate picks your Minecraft window automatically when it's open.
- **Download and play.** No other installs: GameMate downloads its AI with one click the first time you open it. Choose from three models, from fast to best, or use your Ollama models.
- **Nothing left running.** GameMate's AI starts when you ask something, frees your graphics card after a few idle minutes, and stops completely when GameMate quits.
- **Chat window.** A full chat window for longer conversations.
- **Runs in the background.** Closing the window keeps GameMate in the system tray, ready for **Alt + Space**.
- **Looks things up.** Turn on lookups and GameMate reads your game's wiki (for example [minecraft.wiki](https://minecraft.wiki), the Terraria Wiki or Eldenpedia) for bosses, items, places and mechanics, and links to the page it used.
- **Local or cloud, your choice.** Use the local model for everything, or Gemini for questions, the companion, or both.
- **Private by default.** No accounts, nothing uploaded, unless you choose Gemini or online lookups.

## Requirements

- Windows 10 or 11
- A graphics card is recommended for fast answers, especially while a game is running. NVIDIA, AMD and Intel cards all work, and GameMate picks your dedicated card automatically. Without one, GameMate uses the processor, which is slower.
- 2 to 7 GB of free disk space for the AI model, depending on which one you choose.

## Getting started

1. **Install GameMate.** Download the latest installer from the [Releases](https://github.com/TSCKey/gamemate/releases) page and run it.
2. **Open GameMate** and click **Download Qwen3.5 2B (1.9 GB)**. You only do this once. After that, GameMate's AI works offline.
3. **Start asking questions.**

Already use Ollama? Click **I use Ollama** instead, or switch any time in **⚙ Settings → Models**.

## Using GameMate

### In-game: Alt + Space

1. While playing, press **Alt + Space**. A small GameMate window appears on top of your game.
2. Type your question and press **Enter**.
3. Press **Esc** (or **Alt + Space** again) to hide it and keep playing.

- When the **📷** button is lit, GameMate includes a screenshot of your screen, taken at the moment you pressed **Alt + Space**. Click **📷** to turn this on or off. GameMate's own window never appears in the screenshot.
- Follow-up questions continue the same conversation. Click **✕** to start a new one. The conversation starts fresh by itself if you haven't used GameMate for 10 minutes.
- Drag the 🎮 icon to move the window.
- For the window to appear over your game, set the game to **windowed** or **borderless/windowed fullscreen**. Windows doesn't let other apps draw over exclusive fullscreen.

### Games and modpacks

GameMate always helps with one game, shown at the top of the chat window (for example **Terraria ▾**). Click it to switch games.

- **Follow the game I'm playing** (on by default): when you press **Alt + Space**, or while the companion is watching, GameMate switches to the game in front by itself. It recognizes games by the name of their program.
- **⚙ Settings → Games** has all the options:
  - **Minecraft modpacks:** GameMate lists the modpacks you installed with CurseForge. Choose one, or leave **Detect the one I'm playing** to use the pack that's running, from any launcher. Answers then know which mods you have, and with lookups on, the AI can read what a mod does on Modrinth.
  - **Your games:** start a game GameMate doesn't know, click **Add a game that's running…** and pick it. Add its wiki's address (any Fandom, wiki.gg or other MediaWiki wiki) so GameMate can look things up for it.
  - **Games GameMate knows:** the games it recognizes by itself, with their wikis.

### Always-on companion

Click the companion mode at the top of the chat window (for example **On-demand ▾**) to choose how much GameMate watches and talks on its own. **⚙ Settings → Companion** has the same choices plus the log:

| Mode                    | What GameMate does                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disabled**            | Never looks at your screen, not even when you press **Alt + Space**.                                                                                                    |
| **On-demand** (default) | Only looks and answers when you ask.                                                                                                                                    |
| **Observation**         | Watches your game and keeps a log of what it noticed on the Companion page, without pop-ups.                                                                            |
| **Commentary**          | Watches your game and pops up a short comment when something important happens, such as a creeper nearby, low health, dying, entering a dark cave or finding a village. |
| **Quiet**               | Watches silently and uses what it saw only to answer your questions.                                                                                                    |

- In Commentary mode, use **How often to comment** to choose how often GameMate speaks up: **Rarely** (big moments only), **Sometimes**, or **Often**. It also waits a while before commenting on the same kind of thing again.
- Comments appear in the top-right corner of the screen for a few seconds. They never take focus, so your keyboard and mouse stay in the game. Click a comment to dismiss it.
- In any watching mode, GameMate remembers what it saw recently, so questions like "What should I do next?" get better answers.
- Click **⏸ Pause** on the Companion page, or **Pause watching** in the tray icon's menu, to stop watching for a while. While GameMate is watching, the top of the chat window shows its status.
- GameMate only watches while a game it knows (or one you added) is the active window. When you alt-tab away, it stops. To spare your GPU, it only asks the AI about your screen when the picture has changed, at most every 12 seconds.

### AI models

Open **⚙ Settings → Models** to choose the AI that runs on your PC:

| Model                  | Download | Good for                                                     |
| ---------------------- | -------- | ------------------------------------------------------------ |
| **Qwen3.5 2B** (Fast)  | 1.9 GB   | Quick answers on most graphics cards                         |
| **Qwen3.5 4B** (Smart) | 3.4 GB   | Better answers, best with 6 GB or more of graphics memory    |
| **Qwen3.5 9B** (Best)  | 6.6 GB   | The best answers, best with 10 GB or more of graphics memory |

- Click **Download**, then **Use**. You can cancel a download, and if one fails, **Try again** continues where it stopped.
- All of them can see screenshots and work offline.
- GameMate's AI starts the first time you ask something, frees your graphics card after 5 idle minutes, and stops completely when GameMate quits, even if GameMate crashes.
- **Use my Ollama models:** turn this on to use models from your own Ollama install instead. Ollama must be running.
- Cloud models (Gemini) are set up in **⚙ Settings → AI & online**, see below.

### Gemini, Auto and wiki lookup

Click the AI name under the question box (for example **Qwen3.5 2B ▾**) to switch between **Auto**, a model on your PC and a Gemini model. **⚙ Settings → AI & online** has all the options:

- **Which AI answers:** choose **On this PC** or **Gemini**, separately for **Your questions** (chat and **Alt + Space**) and the **Companion** (always-on watching).
- **Auto:** once Gemini is set up, choose **Auto** for **Your questions** and GameMate picks an AI for each question:
  - **On this PC:** crafting recipes and quick questions. These are fast, free and stay on your PC.
  - **Gemini:** questions with a screenshot, and questions that need more thinking, such as builds and Nether portals, farms, redstone, strategy, bosses, "why" questions, long questions and long conversations.
  - If the chosen AI can't be reached (the AI on your PC can't start, you're offline, or Gemini's limit is used up), the other one answers.
  - A small note under each answer, and in the in-game window, shows which AI answered and why.
- **Gemini:**
  1. Read what Gemini sends to Google, tick **I'm 18 or older and agree…** and click **Turn on Gemini**.
  2. Get an API key at [aistudio.google.com](https://aistudio.google.com/apikey). If you live in the EU/EEA, Switzerland or the UK, Google's terms ask for a paid (billing-enabled) key in apps like GameMate.
  3. Paste it and click **Save**. GameMate checks it with Google, stores it encrypted on your PC, and lists the Gemini models your key can use.
  4. Pick a model. A Flash model is a good balance of speed and quality.
  5. To stop using Gemini, click **Turn off**. GameMate deletes your key and goes back to the local AI.
- **Look things up:** turn on **Look things up online**. When a question is about a boss, item, place or mechanic, the AI reads the matching page on your game's wiki (and for Minecraft mods, the mod's Modrinth page). The answer shows **Source:** with a link to it and the wiki's license.
- When questions go to Gemini, the AI name under the question box and the in-game window show **☁**.

### Voice

Open **⚙ Settings → Voice**.

**Asking by voice**

1. Turn on **Ask with your microphone**.
2. Choose a speech model and click **Download**. You only do this once, and after that voice works offline.
   - **Fast** (45 MB) understands you quicker.
   - **Accurate** (80 MB) makes fewer mistakes but takes a few seconds longer.
3. In a game, press **Alt + V** and ask your question. GameMate stops listening when you pause, then sends your question. In the chat window, click **🎤** instead.

Press **Alt + V** or click **🎤** again to stop listening early, or press **Esc** in the in-game window to cancel and hide it. The **Alt + V** shortcut only exists while voice input is turned on, so the key stays free for your games otherwise.

**GameMate's voice**

- **Read answers aloud:** Never, When I ask by voice (the default), or Always.
- **Read companion comments aloud:** speaks Commentary mode's pop-ups.
- Choose a **Voice** and set the **Volume** and **Speed**. Click **🔊 Test voice** to hear it. GameMate uses the voices built into Windows.

### Chat window

- The top of the window shows your Minecraft version and the companion mode. Click either to change it, or click **⚙** for all settings.
- Type your question and press **Enter** to send it. Use **Shift + Enter** for a new line. On a new chat, click one of the suggestions to try GameMate out.
- To ask about what's on screen, click **📷 Screenshot** under the message box and choose your game window or screen. GameMate takes a fresh screenshot each time you send a question. With it on, you can also press **Enter** with an empty message to ask "What is happening on my screen?".
- Click **New chat** to clear the conversation.
- Click the AI name under the question box to pick which AI answers. Get more models in **⚙ Settings → Models**.
- Closing the window keeps GameMate running in the system tray, so the in-game shortcuts and the companion keep working. Right-click the tray icon to open it again or to quit. To make the close button quit GameMate instead, turn off **Keep running in the tray** in **⚙ Settings → General**. When GameMate quits, it frees the AI model's memory right away.

## Troubleshooting

**Alt + Space does nothing**
Another app may already use that shortcut, for example PowerToys Run. The chat window shows a notice when this happens. Change or turn off the other app's shortcut, then restart GameMate. Also check that GameMate is still running in the system tray.

**The GameMate window doesn't show up over my game**
Switch the game to windowed or borderless fullscreen. In Minecraft, press **F11** to toggle fullscreen.

**A recipe looks wrong or is missing**
Make sure the Minecraft version matches the version you're playing (click the game at the top of the chat window). GameMate knows the crafting-table recipes of plain Minecraft. Items that are smelted, brewed, traded or built in the world (such as Nether portals) don't have a crafting recipe, and recipes for items from mods aren't included yet.

**GameMate doesn't recognize my game**
Add it in **⚙ Settings → Games → Add a game that's running…** while the game is open. You can also pick the game yourself at the top of the chat window.

**My modpack isn't listed**
GameMate lists packs installed with CurseForge in its default folder. For other launchers, start the pack and leave **Modpack** on **Detect the one I'm playing**; GameMate then reads the mods of the pack that's running.

**The first answer takes a while**
The very first time, your graphics card's driver prepares the AI for your card, which can take up to a minute. After that, answers come in seconds. Each time GameMate's AI starts, it also needs a few seconds to load the model.

**"The built-in AI couldn't start: there isn't enough graphics memory"**
Choose a smaller model in **⚙ Settings → Models**, close other programs that use the graphics card, or lower your game's graphics settings.

**A model download failed**
Check your internet connection and free disk space, then click **Try again** in **⚙ Settings → Models**. It continues where it stopped.

**"Could not reach Ollama. Is it running?"** (only if you use Ollama models)
Start Ollama from the Start menu, then click **↻** in **⚙ Settings → Models**. To download an Ollama model, run `ollama pull qwen3.5:2b`.

**There's no 📷 Screenshot button**
The selected Ollama model can't see images, or the Companion is set to **Disabled**. All of GameMate's built-in models can see screenshots.

**My game window isn't in the list**
Make sure the game is open and not minimized, then open the list again. If it still doesn't appear, choose your whole screen instead.

**Commentary mode never says anything**
Check the status on the Companion settings page. It needs Minecraft to be the active window and a model that can see screenshots. GameMate only comments on important moments, so try **How often to comment: Often**. Smaller models may miss things, and **Qwen3.5 4B** sees more if your graphics card has room for it.

**Alt + V does nothing, or the 🎤 button is missing**
Turn on **Ask with your microphone** in **⚙ Settings → Voice** and download the speech model. If another app uses **Alt + V**, the Voice page tells you, and you can still click **🎤**.

**"GameMate is not allowed to use the microphone"**
Open Windows **Settings → Privacy & security → Microphone** and allow desktop apps to use the microphone.

**GameMate doesn't understand me**
Speak after the 🎤 lights up, and pause briefly when you're done. Try the **Accurate** speech model, and check that the right microphone is set as the default in Windows sound settings.

**"Gemini rejected the API key" or "usage limit was reached"**
Check the key at aistudio.google.com and paste it again in **⚙ Settings → AI & online**. Free keys have per-minute and daily limits, and the Companion can use them up quickly, so consider setting **Companion** back to **On this PC**.

**Answers are slow**
Your game and the AI model share your graphics card. Try a smaller model, close other apps that use the graphics card, or lower your game's graphics settings.

## Privacy

GameMate is local by default. The first time you open it, it shows a short summary of how it handles your data, which you can read again in **⚙ Settings → Privacy**. Two optional features use the internet, and only when you turn them on:

- **Gemini** sends the questions and screenshots for the jobs you set to Gemini to Google, under the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [Google's Privacy Policy](https://policies.google.com/privacy). GameMate asks for your agreement before you can add a key, and Google requires you to be 18 or older. That includes recent observations from the companion and, if the Companion is set to Gemini, its screenshots. Your API key is encrypted with Windows' per-user protection, and GameMate never shows it again or sends it anywhere except Google.
- **Online lookups** send only the topic, such as "Nether Portal", to your game's wiki, and for Minecraft mods the mod's name to Modrinth.

Otherwise, GameMate's AI runs on your own computer. Its engine only accepts requests from GameMate on this PC (`127.0.0.1`, with a new random key each time it starts), and Ollama, if you use it, is local too. AI models are downloaded once from Hugging Face, and the AI engine from GitHub, when you click **Download**, and every file is checked against a known checksum. GameMate takes screenshots only:

- when you send a question with **📷 Screenshot** on,
- when you press **Alt + Space** with **📷** turned on, and
- while a game is the active window, if you've turned on Observation, Commentary or Quiet mode. These modes are off by default. The tray icon and the chat window always show whether GameMate is watching.

To recognize your game, GameMate reads the name of the program in front, and for Minecraft it reads your launcher's modpack folders. This stays on your PC.

Screenshots go only to the AI you chose and are never saved to disk. What GameMate noticed is kept in memory only, and is forgotten when you switch back to On-demand or Disabled or quit GameMate. GameMate doesn't send your conversations anywhere, collect usage data or require an account. Choose **Disabled** to turn off all screen access.

GameMate only uses the microphone while 🎤 is lit, after you press **Alt + V** or click **🎤**. Your voice is turned into text on your PC and is never recorded to disk or sent anywhere. Speech models are downloaded once from Hugging Face when you click **Download**.

**Deleting your data:** click **Delete my data** in **⚙ Settings → Privacy** to remove everything GameMate stored on your PC (settings, your Gemini key, and the AI engine, AI models and speech models you downloaded) and start fresh. Data already sent to Google is covered by Google's policies.

## What GameMate won't do

GameMate is an assistant, not a bot. It never plays games for you, controls your keyboard or mouse, provides cheats, or modifies game files or processes. Use the companion in single-player and co-op games: competitive online games may not allow AI help during matches.

## Credits

- GameMate's built-in AI engine is [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT License).
- The built-in models are [Qwen3.5](https://huggingface.co/Qwen) by the Qwen team (Apache 2.0), in versions prepared by [Unsloth](https://huggingface.co/unsloth).
- Speech recognition uses [Whisper](https://github.com/openai/whisper) (MIT), converted by [onnx-community](https://huggingface.co/onnx-community).
- Wiki answers come from each game's community wiki, such as [minecraft.wiki](https://minecraft.wiki) (CC BY-NC-SA 3.0); every answer shows its source and that wiki's license. Mod descriptions come from [Modrinth](https://modrinth.com).
- GameMate isn't affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang.

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

Built with Electron, React, TypeScript, llama.cpp and Ollama. Speech recognition uses OpenAI's Whisper (MIT), converted by [onnx-community](https://huggingface.co/onnx-community) and run with [Transformers.js](https://github.com/huggingface/transformers.js) (Apache-2.0). Minecraft item and recipe data comes from [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data) (MIT). Wiki lookups read each game's community wiki under that wiki's license. GameMate is not affiliated with Mojang or Microsoft.
