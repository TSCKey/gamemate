import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { speak } from './voice/speak'

// Transparent space around the bubble, so its shadow isn't clipped by the window edge.
const WINDOW_PADDING = 12

// A companion comment shown over the game. It never takes focus; clicking it dismisses it.
function Toast(): React.JSX.Element {
  const [text, setText] = useState('')
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      window.api.toast.onShow(async (comment) => {
        setText(comment)
        const settings = await window.api.getSettings()
        if (settings.speakComments) speak(comment)
      }),
    []
  )

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
        <span>{text}</span>
      </div>
    </div>
  )
}

export default Toast
