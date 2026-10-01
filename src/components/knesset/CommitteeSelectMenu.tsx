'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type CommitteeSelectOption = {
  value: string
  label: string
}

type CommitteeSelectMenuProps = {
  label: string
  ariaLabel: string
  value: string
  options: CommitteeSelectOption[]
  disabled?: boolean
  placeholder?: string
  onChange: (value: string) => void
}

export function CommitteeSelectMenu({
  label,
  ariaLabel,
  value,
  options,
  disabled = false,
  placeholder = 'בחירה',
  onChange,
}: CommitteeSelectMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value)
  const displayLabel = selected?.label ?? placeholder

  useEffect(() => {
    if (!open) {
      return
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="committee-select" ref={rootRef}>
      <span className="committee-select__label">{label}</span>
      <div className="committee-select__field">
        <button
          type="button"
          className="committee-select__trigger"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          title={selected?.label}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="committee-select__trigger-text">{displayLabel}</span>
        </button>

        {open && !disabled ? (
          <ul
            id={listId}
            className="committee-select__menu"
            role="listbox"
            aria-label={ariaLabel}
          >
            {options.length === 0 ? (
              <li className="committee-select__empty" role="presentation">
                {placeholder}
              </li>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value
                return (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={[
                        'committee-select__option',
                        isSelected ? 'committee-select__option--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
