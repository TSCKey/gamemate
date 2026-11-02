// Google's Search Suggestions, which Google requires apps to show with web search results. Its
// HTML is shown as given, in a sandboxed frame that can't run scripts; its links open in the
// player's browser.
function SearchSuggestions({ html }: { html?: string }): React.JSX.Element | null {
  if (!html) return null
  return (
    <iframe
      className="search-suggestions"
      title="Google Search Suggestions"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={`<base target="_blank">${html}`}
    />
  )
}

export default SearchSuggestions
