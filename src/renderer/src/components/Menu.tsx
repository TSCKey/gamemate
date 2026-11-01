import { useCallback, useEffect, useId, useRef, useState } from 'react'

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')] : []
}

// A button that opens a small menu. Closes on picking an item, Escape, clicking outside or
// tabbing away; arrow keys move between items.
export function Dropdown({
  label,
  menuLabel,
  title,
  triggerClassName = '',
  align = 'start',
  direction = 'down',
  onOpen,
  children
}: {
  label: React.ReactNode
  menuLabel: string
  title?: string
  triggerClassName?: string
  align?: 'start' | 'end'
  direction?: 'down' | 'up'
  onOpen?: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    // Start on the selected item so arrow keys work right away.
    const items = menuItems(menuRef.current)
    ;(items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0])?.focus()
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const items = menuItems(menuRef.current)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : e.key === 'ArrowDown'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length
    items[next].focus()
  }

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`dropdown-trigger ${triggerClassName}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
      >
        {label}
        <span className="dropdown-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          className={`menu menu-${direction} menu-${align}`}
          onKeyDown={onKeyDown}
          // Picking any item closes the menu (after the item's own click handler ran).
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role^="menuitem"]')) close()
          }}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// One choice in a menu. Pass `checked` for options (one of several), leave it out for actions.
export function MenuItem({
  title,
  description,
  checked,
  disabled,
  onSelect
}: {
  title: React.ReactNode
  description?: React.ReactNode
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      className="menu-item"
      disabled={disabled}
      tabIndex={-1}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span className="menu-text">
        <span className="menu-title">{title}</span>
        {description && <span className="menu-description">{description}</span>}
      </span>
    </button>
  )
}

export function MenuLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="menu-label" role="presentation">
      {children}
    </div>
  )
}

export function MenuSeparator(): React.JSX.Element {
  return <div className="menu-separator" role="separator" />
}

// Non-interactive text inside a menu, such as a status line or an empty list.
export function MenuNote({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="menu-note" role="presentation">
      {children}
    </div>
  )
}
