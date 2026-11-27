// The voice workers work offline: they may fetch GameMate's own files (from the app, or from
// the dev server under `npm run dev`) and the local model store (gm-model:), nothing else.
export function offlineRequest(url: string, page: string): 'allow' | 'refuse' {
  const target = new URL(url, page)
  if (!/^https?:$/.test(target.protocol)) return 'allow'
  return target.origin === new URL(page).origin ? 'allow' : 'refuse'
}
