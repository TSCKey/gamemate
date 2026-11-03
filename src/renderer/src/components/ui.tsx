// Small building blocks shared by the settings pages.

export function Section({
  title,
  description,
  children
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="card-body">{children}</div>
    </section>
  )
}

// One setting: a label (with optional help text) on the left, its control on the right.
export function Field({
  label,
  help,
  children
}: {
  label: React.ReactNode
  help?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="field">
      <div className="field-text">
        <div className="field-label">{label}</div>
        {help && <div className="field-help">{help}</div>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" />
    </label>
  )
}

// A link to a page GameMate is allowed to open in the browser.
export function ExternalLink({
  href,
  children
}: {
  href: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        window.api.openSource(href)
      }}
    >
      {children}
    </a>
  )
}
