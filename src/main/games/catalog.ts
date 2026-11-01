// Games GameMate knows: how to recognise them on screen, their wiki, and what the companion
// should watch for. Players can add any other game themselves (see CustomGame).
import type { WikiSite } from '../wiki'

export interface GameProfile {
  id: string
  name: string
  // Lower-case program names of the running game.
  exes: (string | RegExp)[]
  // For games that run as a generic program (Minecraft runs on Java): the window title or the
  // program's folder must also match one of these.
  title?: RegExp
  pathHint?: RegExp
  wiki?: WikiSite
  // What matters on screen in this game, for the companion.
  watchFor: string
  // Example questions for an empty chat.
  examples: [string, string]
}

// A game the player added: the program they picked, and optionally a wiki address.
export interface CustomGame {
  id: string
  name: string
  exe: string
  wiki?: WikiSite
}

const wiki = (name: string, api: string, articlePath: string, license: string): WikiSite => ({
  name,
  api,
  articlePath,
  license
})

export const GAMES: GameProfile[] = [
  {
    id: 'minecraft',
    name: 'Minecraft',
    // Java Edition runs on Java; Bedrock is Minecraft.Windows.exe.
    exes: ['javaw.exe', 'java.exe', 'minecraft.windows.exe'],
    title: /^minecraft(\*?\s+\d|$)/i,
    // Modpacks often change the window title; their Java comes from the launcher's folder.
    pathHint: /minecraft|curseforge|modrinth|prismlauncher|multimc|atlauncher|gdlauncher/i,
    wiki: wiki(
      'Minecraft Wiki',
      'https://minecraft.wiki/api.php',
      'https://minecraft.wiki/w/$1',
      'CC BY-NC-SA 3.0'
    ),
    watchFor:
      'the "You Died!" screen, the health bar dropping to 3 hearts or fewer, creepers, zombies, skeletons or spiders close by, dark caves where mobs can spawn, villages, structures and diamonds',
    examples: ['How do I craft a piston?', 'How do I build a Nether portal?']
  },
  {
    id: 'terraria',
    name: 'Terraria',
    exes: ['terraria.exe', 'tmodloader.exe'],
    wiki: wiki(
      'Terraria Wiki',
      'https://terraria.wiki.gg/api.php',
      'https://terraria.wiki.gg/wiki/$1',
      'CC BY-NC-SA 4.0'
    ),
    watchFor:
      'bosses and strong enemies, low health, events like the Blood Moon or invasions, rare drops and chests',
    examples: ['How do I summon the Eye of Cthulhu?', 'What should I do after beating Skeletron?']
  },
  {
    id: 'valheim',
    name: 'Valheim',
    exes: ['valheim.exe'],
    wiki: wiki(
      'Valheim Wiki',
      'https://valheim.fandom.com/api.php',
      'https://valheim.fandom.com/wiki/$1',
      'CC BY-SA'
    ),
    watchFor:
      'trolls, bosses and other enemies close by, low health or stamina, raids, being cold or wet',
    examples: ['How do I beat Eikthyr?', 'Where do I find copper?']
  },
  {
    id: 'eldenring',
    name: 'Elden Ring',
    exes: ['eldenring.exe'],
    wiki: wiki(
      'Eldenpedia',
      'https://eldenring.wiki.gg/api.php',
      'https://eldenring.wiki.gg/wiki/$1',
      'CC BY-SA 4.0'
    ),
    watchFor: 'boss fights, low HP, being surrounded, Sites of Grace and notable items',
    examples: ['How do I beat Margit, the Fell Omen?', 'Where can I upgrade my flask?']
  },
  {
    id: 'bg3',
    name: "Baldur's Gate 3",
    exes: ['bg3.exe', 'bg3_dx11.exe'],
    wiki: wiki(
      'bg3.wiki',
      'https://bg3.wiki/w/api.php',
      'https://bg3.wiki/wiki/$1',
      'CC BY-NC-SA 4.0 or CC BY-SA 4.0'
    ),
    watchFor:
      'party members with low HP in combat, dangerous enemies, important dialogue choices and loot',
    examples: ['How does Bardic Inspiration work?', 'Where is the Owlbear cave?']
  },
  {
    id: 'satisfactory',
    name: 'Satisfactory',
    exes: [/^factorygame.*-win64-shipping\.exe$/],
    wiki: wiki(
      'Satisfactory Wiki',
      'https://satisfactory.wiki.gg/api.php',
      'https://satisfactory.wiki.gg/wiki/$1',
      'CC BY-NC-SA 4.0'
    ),
    watchFor: 'power failures, hostile creatures close by, low health and notable resource nodes',
    examples: ['How do I make Reinforced Iron Plates?', 'How do I unlock coal power?']
  },
  {
    id: 'factorio',
    name: 'Factorio',
    exes: ['factorio.exe'],
    wiki: wiki(
      'Official Factorio Wiki',
      'https://wiki.factorio.com/api.php',
      'https://wiki.factorio.com/$1',
      'CC BY-NC-SA 3.0'
    ),
    watchFor:
      'biters attacking, damaged buildings, power or production stopping, low ammo in turrets',
    examples: ['How do I make red circuits?', 'How do I set up oil processing?']
  },
  {
    id: 'rimworld',
    name: 'RimWorld',
    exes: ['rimworldwin64.exe'],
    wiki: wiki(
      'RimWorld Wiki',
      'https://rimworldwiki.com/api.php',
      'https://rimworldwiki.com/wiki/$1',
      'CC BY-SA 3.0'
    ),
    watchFor: 'raids, colonists in danger, mental breaks, fires, low food and bad events',
    examples: ['How do I stop food poisoning?', 'How do I defend against raids?']
  },
  {
    id: 'dontstarve',
    name: "Don't Starve",
    exes: ['dontstarve_steam_x64.exe', 'dontstarve_steam.exe', 'dontstarve.exe'],
    wiki: wiki(
      "Don't Starve Wiki",
      'https://dontstarve.wiki.gg/api.php',
      'https://dontstarve.wiki.gg/wiki/$1',
      'CC BY-SA 4.0'
    ),
    watchFor:
      'low health, hunger or sanity, night falling, hounds, bosses and other dangers close by',
    examples: ['How do I survive my first winter?', 'How do I make a Science Machine?']
  },
  {
    id: 'subnautica',
    name: 'Subnautica',
    exes: ['subnautica.exe', 'subnauticazero.exe'],
    wiki: wiki(
      'Subnautica Wiki',
      'https://subnautica.fandom.com/api.php',
      'https://subnautica.fandom.com/wiki/$1',
      'CC BY-SA'
    ),
    watchFor: 'low oxygen, leviathans and hostile creatures close by, low health and new biomes',
    examples: ['Where do I find lithium?', 'How do I build the Seamoth?']
  },
  {
    id: 'nomanssky',
    name: "No Man's Sky",
    exes: ['nms.exe'],
    wiki: wiki(
      "No Man's Sky Wiki",
      'https://nomanssky.fandom.com/api.php',
      'https://nomanssky.fandom.com/wiki/$1',
      'CC BY-NC-SA'
    ),
    watchFor:
      'sentinels attacking, hazard protection or life support running low, low health and notable discoveries',
    examples: ['How do I get a better starship?', 'How do I make antimatter?']
  },
  {
    id: 'hollowknight',
    name: 'Hollow Knight',
    exes: ['hollow_knight.exe'],
    wiki: wiki(
      'Hollow Knight Wiki',
      'https://hollowknight.fandom.com/api.php',
      'https://hollowknight.fandom.com/wiki/$1',
      'CC BY-SA'
    ),
    watchFor: 'boss fights, few masks (health) left, benches and new areas',
    examples: ['How do I beat the False Knight?', 'Where do I find the Mothwing Cloak?']
  },
  {
    id: 'hades',
    name: 'Hades',
    exes: ['hades.exe', 'hades2.exe'],
    wiki: wiki(
      'Hades Wiki',
      'https://hades.fandom.com/api.php',
      'https://hades.fandom.com/wiki/$1',
      'CC BY-NC-SA'
    ),
    watchFor: 'boss fights, low health, boon choices and notable rewards',
    examples: ['Which weapon is best for beginners?', 'How do I beat Megaera?']
  },
  {
    id: 'skyrim',
    name: 'Skyrim',
    exes: ['skyrimse.exe', 'tesv.exe'],
    wiki: wiki(
      'UESP',
      'https://en.uesp.net/w/api.php',
      'https://en.uesp.net/wiki/$1',
      'CC BY-SA 2.5'
    ),
    watchFor: 'dragons and strong enemies, low health, notable loot and quest moments',
    examples: ['How do I join the Companions?', 'Where can I learn the Fire Breath shout?']
  },
  {
    id: 'witcher3',
    name: 'The Witcher 3',
    exes: ['witcher3.exe'],
    wiki: wiki(
      'Witcher Wiki',
      'https://witcher.fandom.com/api.php',
      'https://witcher.fandom.com/wiki/$1',
      'CC BY-SA'
    ),
    watchFor: 'monsters and strong enemies, low vitality, contracts and notable loot',
    examples: ['Which oil works against drowners?', 'How do I get the Griffin armor?']
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk 2077',
    exes: ['cyberpunk2077.exe'],
    wiki: wiki(
      'Cyberpunk Wiki',
      'https://cyberpunk.fandom.com/api.php',
      'https://cyberpunk.fandom.com/wiki/$1',
      'CC BY-SA'
    ),
    watchFor: 'enemies, low health, police wanted level and notable loot',
    examples: ['Which perks are good for a netrunner?', 'How do I get the Mantis Blades?']
  },
  {
    id: 'palworld',
    name: 'Palworld',
    exes: ['palworld-win64-shipping.exe'],
    wiki: wiki(
      'Palworld Wiki',
      'https://palworld.wiki.gg/api.php',
      'https://palworld.wiki.gg/wiki/$1',
      'CC BY-SA 4.0'
    ),
    watchFor: 'raids and hostile Pals close by, low health or hunger, rare Pals and bosses',
    examples: ['Where do I find Anubis?', 'How do I breed Pals?']
  }
]

// What a player-added game looks like to the rest of GameMate.
export function customGameProfile(game: CustomGame): GameProfile {
  return {
    id: game.id,
    name: game.name,
    exes: [game.exe.toLowerCase()],
    wiki: game.wiki,
    watchFor: 'danger, enemies or bosses close by, low health, death and notable finds',
    examples: ['What should I do next?', 'Any tips for where I am?']
  }
}
