// Reads a streamed HTTP response line by line (server-sent events and NDJSON both arrive this way).
export async function forEachLine(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const decoder = new TextDecoder()
  let buffered = ''
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true })
    let newline = buffered.indexOf('\n')
    while (newline >= 0) {
      const line = buffered.slice(0, newline).trim()
      buffered = buffered.slice(newline + 1)
      if (line) onLine(line)
      newline = buffered.indexOf('\n')
    }
  }
  const rest = (buffered + decoder.decode()).trim()
  if (rest) onLine(rest)
}
