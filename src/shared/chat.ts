// The AI only looks at the screenshot sent with the question being asked: older ones show a
// screen that has since changed. Leaving them out keeps megabytes of pictures from being copied
// between GameMate's windows and its background process with every question.
export function withLatestScreenshotOnly<M extends { images?: string[] }>(history: M[]): M[] {
  return history.map((message, i) => {
    if (i === history.length - 1 || !message.images) return message
    const rest = { ...message }
    delete rest.images
    return rest
  })
}

// A conversation without any of its screenshots, for keeping it while its window is closed.
export function withoutScreenshots<M extends { images?: string[] }>(history: M[]): M[] {
  return history.map((message) => {
    if (!message.images) return message
    const rest = { ...message }
    delete rest.images
    return rest
  })
}
