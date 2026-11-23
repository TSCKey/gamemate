// The Stats API client over a real local socket: a minimal WebSocket server stands in for Rocket
// League (the handshake and one unmasked text frame per message, as the protocol has it).
import { createHash } from 'crypto'
import { createServer, type Server } from 'http'
import type { AddressInfo, Socket } from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import { StatsFeed } from '../src/main/games/rocketStats'

let server: Server | null = null
afterEach(() => server?.close())

function frame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const head =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
  return Buffer.concat([head, payload])
}

// A game that, once connected to, sends `messages` and keeps the connection open.
async function fakeGame(messages: object[]): Promise<number> {
  server = createServer()
  server.on('upgrade', (request, socket: Socket) => {
    const key = String(request.headers['sec-websocket-key'])
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    for (const m of messages) socket.write(frame(JSON.stringify(m)))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return (server!.address() as AddressInfo).port
}

// Windows takes about two seconds to refuse a connection to a closed local port.
const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 20))
}

describe('listening to Rocket League over a real socket', () => {
  it('connects and receives the messages in order', async () => {
    const port = await fakeGame([
      { Event: 'MatchCreated', Data: { MatchGuid: 'G' } },
      { Event: 'GoalScored', Data: { Scorer: { Name: 'TSCKey', TeamNum: 0 } } }
    ])
    const feed = new StatsFeed()
    feed.ensure(port, 0)
    const got: string[] = []
    await until(() => {
      got.push(...feed.drain().map((m) => m.Event))
      return got.length >= 2
    })
    expect(feed.connected).toBe(true)
    expect(got).toEqual(['MatchCreated', 'GoalScored'])
    feed.close()
  })

  it('is closed, not broken, when the game isn’t listening', { timeout: 15_000 }, async () => {
    const port = await fakeGame([])
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = null
    const feed = new StatsFeed()
    feed.ensure(port, 0)
    await until(() => feed.status === 'closed')
    expect(feed.status).toBe('closed')
    expect(feed.drain()).toEqual([])
  })
})
