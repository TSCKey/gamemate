import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Settings } from '../../../preload/index.d'
import { useAppLanguage } from '../i18n'
import { speak } from '../voice/speak'
import { hush, say } from '../voice/natural'

// Transparent space around the bubble, so its shadow isn't clipped by the window edge.
const WINDOW_PADDING = 12

// A companion comment shown over the game. It never takes focus; clicking it dismisses it.
function Toast(): React.JSX.Element {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<Settings['language']>('')
  useAppLanguage({ language })

  useEffect(() => {
    window.api.getSettings().then((s) => setLanguage(s.language))
    return window.api.onSettingsChanged((s) => setLanguage(s.language))
  }, [])
  const bubbleRef = useRef<HTMLDivElement>(null)

  // This window is also where GameMate's natural voice speaks, for every window. It is opened
  // when there is something to show or say, and tells GameMate once it listens.
  useEffect(() => {
    const stopShow = window.api.toast.onShow(async (comment) => {
      setText(comment)
      const settings = await window.api.getSettings()
      if (settings.speakComments) speak(comment)
    })
    let latest = 0
    const stopSay = window.api.voice.onSay(async (request) => {
      const mine = ++latest
      await say(request).catch((error) => console.error('Natural voice failed', error))
      // Lets GameMate close this window again after a few quiet minutes.
      if (mine === latest) window.api.toast.doneSpeaking()
    })
    const stopHush = window.api.voice.onHush(hush)
    window.api.toast.ready()
    return () => {
      stopShow()
      stopSay()
      stopHush()
    }
  }, [])

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return
    const observer = new ResizeObserver(() =>
      window.api.toast.setHeight(bubble.offsetHeight + WINDOW_PADDING * 2)
    )
    observer.observe(bubble)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="toast" style={{ padding: WINDOW_PADDING }}>
      <div className="toast-bubble" ref={bubbleRef} onClick={() => window.api.toast.hide()}>
        <span className="toast-icon">🎮</span>
        <span dir="auto">{text}</span>
      </div>
    </div>
  )
}

export default Toast
