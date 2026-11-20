// Every way GameMate can follow a game, best first. A static list: GameMate ships as one app,
// so there is nothing to load at run time.
import type { AdapterHost, GameAdapter } from '../adapter'
import { createApex } from './apex'
import { createKillfeed } from './killfeed'
import { createSilksong } from './silksong'
import { createVisionLook } from './visionLook'

export function createAdapters(host: AdapterHost): GameAdapter[] {
  return [createSilksong(host), createApex(host), createKillfeed(host), createVisionLook(host)]
}
