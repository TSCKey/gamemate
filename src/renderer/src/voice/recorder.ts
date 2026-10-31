// Records one spoken question from the microphone as 16 kHz mono audio (what Whisper expects).
// Stops on its own after a short silence once the player has started speaking.

const SAMPLE_RATE = 16_000
const MAX_SECONDS = 15
// Give up if the player doesn't start talking within this time.
const START_TIMEOUT_SECONDS = 6
const SILENCE_TO_STOP_SECONDS = 1.2
// RMS level that counts as speech; adapts upward to the room's background noise.
const MIN_SPEECH_LEVEL = 0.015

export interface Recording {
  // Resolves with the audio, or null if nothing was said.
  result: Promise<Float32Array | null>
  // Stop now and keep what was recorded so far.
  stop: () => void
  // Stop and discard.
  cancel: () => void
}

export async function recordQuestion(onLevel?: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessor is deprecated but needs no separate worklet file; fine for a few seconds.
  const processor = context.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  let samples = 0
  let heardSpeech = false
  let silentSamples = 0
  let noiseFloor = 0
  let finish: (audio: Float32Array | null) => void = () => {}
  const result = new Promise<Float32Array | null>((resolve) => (finish = resolve))

  const cleanup = (): void => {
    processor.disconnect()
    source.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    context.close().catch(() => {})
  }

  const done = (keep: boolean): void => {
    cleanup()
    if (!keep || !heardSpeech) return finish(null)
    const audio = new Float32Array(samples)
    let offset = 0
    for (const chunk of chunks) {
      audio.set(chunk, offset)
      offset += chunk.length
    }
    finish(audio)
  }

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(input))
    samples += input.length

    let sum = 0
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
    const level = Math.sqrt(sum / input.length)
    onLevel?.(level)
    if (!heardSpeech) noiseFloor = noiseFloor * 0.9 + level * 0.1
    const threshold = Math.max(MIN_SPEECH_LEVEL, noiseFloor * 3)

    if (level > threshold) {
      heardSpeech = true
      silentSamples = 0
    } else if (heardSpeech) {
      silentSamples += input.length
    }

    if (heardSpeech && silentSamples > SILENCE_TO_STOP_SECONDS * SAMPLE_RATE) done(true)
    else if (!heardSpeech && samples > START_TIMEOUT_SECONDS * SAMPLE_RATE) done(false)
    else if (samples > MAX_SECONDS * SAMPLE_RATE) done(true)
  }

  source.connect(processor)
  processor.connect(context.destination)
  return { result, stop: () => done(true), cancel: () => done(false) }
}
