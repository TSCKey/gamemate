import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings, SpeechModelStatus } from '../../../preload/index.d'
import { recordQuestion, type Recording } from './recorder'
import { preloadSpeechModel, transcribe } from './speech'
import { stopSpeaking } from './speak'
import { t } from '../i18n'
import { canListen, listenProblem } from '../../../shared/speech'
import { languageInfo } from '../../../shared/languages'

export type VoiceStatus = 'idle' | 'listening' | 'transcribing'

// Microphone → text. `ready` is false until voice input is on and its model is downloaded.
export function useVoiceInput(
  settings: Settings | null,
  onText: (text: string) => void
): {
  ready: boolean
  status: VoiceStatus
  level: number
  error: string | null
  toggle: () => void
  cancel: () => void
} {
  const [models, setModels] = useState<SpeechModelStatus[]>([])
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recording = useRef<Recording | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  })

  useEffect(() => {
    window.api.voice.models().then(setModels)
    return window.api.voice.onModels(setModels)
  }, [])

  const language = settings?.language || 'en'
  const model = models.find((m) => m.id === settings?.speechModel)
  const repo = model?.repo ?? ''
  const ready = !!settings?.voiceInput && canListen(model, language)

  // With voice input on but nothing that can listen (no model yet, or 1.0.3's English-only one
  // in another language), say why instead of ignoring the shortcut.
  const problem = settings?.voiceInput ? listenProblem(model, language) : null
  const why =
    problem === 'englishOnly'
      ? t('useVoiceInput.englishOnly', { language: languageInfo(language).nativeName })
      : problem === 'notDownloaded'
        ? t('useVoiceInput.notDownloaded')
        : null

  const start = useCallback(async () => {
    setError(null)
    stopSpeaking()
    try {
      const rec = await recordQuestion((l) => setLevel(l))
      recording.current = rec
      setStatus('listening')
      // The model loads while the player speaks, not when GameMate starts: it takes several
      // hundred MB of memory, which it gives back after a few minutes without voice questions.
      preloadSpeechModel(repo)
      const audio = await rec.result
      recording.current = null
      setLevel(0)
      if (!audio) {
        setStatus('idle')
        return
      }
      setStatus('transcribing')
      const text = await transcribe(repo, audio, language)
      setStatus('idle')
      // Whisper writes "[BLANK_AUDIO]" or similar when it hears nothing useful.
      const clean = text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim()
      if (clean) onTextRef.current(clean)
      else setError(t('useVoiceInput.sorryIDidnTCatch'))
    } catch (e) {
      recording.current = null
      setStatus('idle')
      setLevel(0)
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? t('useVoiceInput.gamemateIsNotAllowedTo')
          : e instanceof Error
            ? e.message
            : String(e)
      )
    }
  }, [repo, language])

  const toggle = useCallback(() => {
    if (!ready) {
      if (why) setError(why)
      return
    }
    if (recording.current) recording.current.stop()
    else if (status === 'idle') start()
  }, [ready, start, status, why])

  const cancel = useCallback(() => {
    recording.current?.cancel()
    recording.current = null
  }, [])

  return { ready, status, level, error, toggle, cancel }
}
