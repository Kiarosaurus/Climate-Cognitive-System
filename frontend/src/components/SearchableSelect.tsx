import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

// Approx rendered height of one option row (px-3 py-2.5 text-sm + 1px divider),
// used to cap the popover at `maxVisibleItems` rows before it scrolls.
const ITEM_HEIGHT = 41

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  icon?: React.ReactNode
  maxVisibleItems?: number   // visible rows before the list scrolls
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecciona…',
  label,
  icon,
  maxVisibleItems = 5,
}: Props) {
  const [inputText, setInputText] = useState('')
  const [open, setOpen] = useState(false)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!value) { setInputText(''); return }
    const found = optionsRef.current.find(o => o.value === value)
    if (found) setInputText(found.label)
  }, [value])

  const filtered = inputText.trim()
    ? options.filter(o => o.label.toLowerCase().includes(inputText.toLowerCase()))
    : options

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputText(e.target.value)
    setOpen(true)
    if (value) onChange('')
  }

  function handleSelect(opt: SelectOption) {
    setOpen(false)
    onChange(opt.value)
  }

  function handleBlur() {
    setTimeout(() => {
      setOpen(false)
      if (!value) {
        setInputText('')
      } else {
        const found = optionsRef.current.find(o => o.value === value)
        setInputText(found?.label ?? '')
      }
    }, 150)
  }

  const leftIcon = icon ?? <Search size={15} />
  const inputPl = icon ? 'pl-10' : 'pl-9'

  return (
    <div>
      {label && (
        <p className="text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
          {label}
        </p>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10 flex items-center">
          {leftIcon}
        </span>

        <input
          type="text"
          autoComplete="off"
          value={inputText}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full bg-slate-900 border border-slate-600 rounded-lg ${inputPl} pr-8 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition placeholder-slate-500`}
        />

        {value && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setInputText('') }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={13} />
          </button>
        )}

        {open && filtered.length > 0 && (
          <ul
            style={{ maxHeight: `${maxVisibleItems * ITEM_HEIGHT}px` }}
            className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-2xl overflow-y-auto overscroll-contain"
          >
            {filtered.map(opt => (
              <li
                key={opt.value}
                onMouseDown={() => handleSelect(opt)}
                className={`px-3 py-2.5 text-sm cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors ${
                  opt.value === value
                    ? 'bg-blue-600/20 text-blue-200'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        )}

        {open && inputText.trim() && filtered.length === 0 && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-600 rounded-lg shadow-xl px-3 py-3 text-sm text-slate-500">
            Sin resultados para "{inputText}"
          </div>
        )}
      </div>
    </div>
  )
}
