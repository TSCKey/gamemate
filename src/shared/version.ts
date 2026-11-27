// GameMate's version, from package.json at build time (the same as app.getVersion() in the
// installed app), for the main process and the windows alike.
import { version } from '../../package.json'

export const APP_VERSION: string = version
