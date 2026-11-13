// Frees something (a model, a helper process, a window) once it hasn't been used for a while.
// touch() on every use; `busy` holds the freeing back while work is still going on.
export function idleTimer(
  ms: number,
  free: () => void,
  busy: () => boolean = () => false
): { touch: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const touch = (): void => {
    cancel()
    timer = setTimeout(() => {
      timer = null
      if (busy()) touch()
      else free()
    }, ms)
    // In the main process, a waiting timer must not keep GameMate from quitting.
    ;(timer as { unref?: () => void }).unref?.()
  }
  return { touch, cancel }
}
