// Rocket League's Stats API: once the player turns it on in the game's own settings file, the game
// opens a local WebSocket and sends JSON messages while a match is on. GameMate only listens: it
// never sends the API's commands, and it never writes the settings file. It reads that file to
// know whether the feature is on and on which port, and the player edits it themselves (see the
// README), because GameMate doesn't modify game files.
import { readFileSync } from 'fs'
import { join } from 'path'
import type { RocketMessage } from '../companion/rocketReading'

export interface StatsApiConfig {
  // PacketSendRate above 0: the game sends data.
  enabled: boolean
  webPort: number
}

const DEFAULT_WEB_PORT = 49124
const RETRY_MS = 10_000
const MAX_QUEUE = 500
const CONFIG_FILES = ['TAStatsAPI.ini', 'DefaultStatsAPI.ini']

// The [TAGame.MatchStatsExporter_TA] section of the game's settings file.
export function parseStatsIni(text: string): StatsApiConfig {
  let section = ''
  const values = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';')) continue
    const header = /^\[(.+)\]$/.exec(line)
    if (header) {
      section = header[1].trim()
      continue
    }
    if (section !== 'TAGame.MatchStatsExporter_TA') continue
    const pair = /^([^=]+)=(.*)$/.exec(line)
    if (pair) values.set(pair[1].trim().toLowerCase(), pair[2].trim())
  }
  const rate = Number(values.get('packetsendrate') ?? '0')
  const port = Number(values.get('webport') ?? DEFAULT_WEB_PORT)
  return {
    enabled: Number.isFinite(rate) && rate > 0 && port > 0,
    webPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_WEB_PORT
  }
}

// The game's settings for the Stats API, or null when the file can't be read. The game takes
// TAStatsAPI.ini first and DefaultStatsAPI.ini when it doesn't exist.
export function readStatsConfig(installDir: string): StatsApiConfig | null {
  for (const file of CONFIG_FILES) {
    try {
      return parseStatsIni(readFileSync(join(installDir, 'TAGame', 'Config', file), 'utf8'))
    } catch {
      // Not there: the next one.
    }
  }
  return null
}

export type FeedStatus = 'off' | 'connecting' | 'open' | 'closed'

// One connection to the game, opened when wanted and tried again every few seconds while the game
// isn't listening yet (it only listens while running, and in a match).
export class StatsFeed {
  private socket: WebSocket | null = null
  private queue: RocketMessage[] = []
  private lastTry = -Infinity
  private port = DEFAULT_WEB_PORT
  status: FeedStatus = 'off'
  // Each change of status, for the developer inspector.
  onStatus: (status: FeedStatus, port: number) => void = () => {}

  constructor(private readonly open: (url: string) => WebSocket = (url) => new WebSocket(url)) {}

  ensure(port: number, now = Date.now()): void {
    if (this.socket && this.port === port) return
    if (now - this.lastTry < RETRY_MS) return
    this.close()
    this.lastTry = now
    this.port = port
    this.setStatus('connecting')
    let socket: WebSocket
    try {
      socket = this.open(`ws://127.0.0.1:${port}`)
    } catch {
      this.setStatus('closed')
      return
    }
    this.socket = socket
    socket.onopen = () => this.setStatus('open')
    socket.onmessage = (message) => this.take(message.data)
    const lost = (): void => {
      if (this.socket !== socket) return
      this.socket = null
      this.setStatus('closed')
    }
    socket.onclose = lost
    // A refused connection (the game isn't listening): Node's WebSocket reports only an error,
    // with no close after it, and would stay "connecting" for good.
    socket.onerror = () => {
      lost()
      try {
        socket.close()
      } catch {
        // Never opened: nothing to close.
      }
    }
  }

  get connected(): boolean {
    return this.status === 'open'
  }

  // The messages that came since the last call, in order.
  drain(): RocketMessage[] {
    const messages = this.queue
    this.queue = []
    return messages
  }

  close(): void {
    const socket = this.socket
    this.socket = null
    this.queue = []
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    if (this.status !== 'off') this.setStatus('off')
  }

  private take(raw: unknown): void {
    if (typeof raw !== 'string') return
    let message: unknown
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof message !== 'object' || message === null) return
    const typed = message as RocketMessage
    if (typeof typed.Event !== 'string') return
    // The state is sent many times a second: only the newest one waiting is kept.
    const last = this.queue[this.queue.length - 1]
    if (typed.Event === 'UpdateState' && last?.Event === 'UpdateState') this.queue.pop()
    this.queue.push(typed)
    if (this.queue.length > MAX_QUEUE) this.queue.shift()
  }

  private setStatus(status: FeedStatus): void {
    if (this.status === status) return
    this.status = status
    this.onStatus(status, this.port)
  }
}
