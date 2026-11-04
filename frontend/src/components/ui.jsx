import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// ---------------------------------------------------------------------
// Иконки: тонкие линии, цвет — currentColor
// ---------------------------------------------------------------------
const PATHS = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.6 3 5.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M15 5l-7 7 7 7" />,
  down: <path d="M6 9l6 6 6-6" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  send: <path d="M4 12l16-8-6 16-3-7z" />,
  chat: <path d="M4 18V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9z" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" /><path d="M5 3v5h5M19 21v-5h-5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
}

export function Icon({ name, size = 20, stroke = 1.8, className = '', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

// ---------------------------------------------------------------------
// Логотип
// ---------------------------------------------------------------------
export function Logo({ to = '/', small = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5 text-ink no-underline">
      <span className={`${small ? 'w-8 h-8 text-[15px]' : 'w-9 h-9 text-[17px]'} rounded-[11px] bg-ink text-sun flex items-center justify-center font-display font-bold`}>М</span>
      <span className={`font-display font-semibold tracking-tight ${small ? 'text-base' : 'text-lg'}`}>МастерБосс</span>
    </Link>
  )
}

// ---------------------------------------------------------------------
// Кнопки
// ---------------------------------------------------------------------
const VARIANTS = {
  dark: 'bg-ink text-white hover:bg-black',
  sun: 'bg-sun text-ink hover:bg-[#F5B800]',
  outline: 'bg-white text-ink border border-silver hover:border-ink',
  ghost: 'bg-transparent text-ink hover:bg-mist',
  soft: 'bg-mist text-ink hover:bg-sand',
  danger: 'bg-white text-danger border border-[#E8C3C0] hover:bg-[#FCEDEC]',
}

export function Button({ variant = 'dark', size = 'md', className = '', loading = false, children, ...rest }) {
  const sizes = {
    sm: 'h-10 px-4 text-[13px]',
    md: 'h-12 px-5 text-sm',
    lg: 'h-[58px] px-6 text-base',
  }
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full font-extrabold ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}

export function Spinner({ className = '' }) {
  return <span className={`inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent mb-spin ${className}`} aria-label="Загрузка" />
}

// ---------------------------------------------------------------------
// Поле ввода в серой «таблетке» с подписью
// ---------------------------------------------------------------------
export function Field({ label, prefix, className = '', inputClassName = '', ...rest }) {
  return (
    <label className={`flex flex-col gap-1.5 px-4 py-3 rounded-[18px] bg-mist text-xs font-bold text-muted focus-within:ring-[3px] focus-within:ring-sun/60 transition-shadow ${className}`}>
      {label}
      <span className="flex items-baseline">
        {prefix && <span className="text-base font-semibold text-[#8C8984]">{prefix}</span>}
        <input
          className={`flex-1 min-w-0 bg-transparent border-0 p-0 text-base font-semibold text-ink placeholder:text-[#9A978F] placeholder:font-medium focus:shadow-none ${inputClassName}`}
          {...rest}
        />
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------
// Переключатель
// ---------------------------------------------------------------------
export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-[46px] h-7 shrink-0 rounded-full ${checked ? 'bg-ink' : 'bg-silver'}`}
    >
      <span className={`absolute top-[3px] w-[22px] h-[22px] rounded-full transition-all duration-300 ${checked ? 'left-[21px] bg-sun' : 'left-[3px] bg-white'}`} />
    </button>
  )
}

// ---------------------------------------------------------------------
// Сегментный переключатель (Новые / Сегодня / Все)
// ---------------------------------------------------------------------
export function Segments({ items, value, onChange }) {
  return (
    <div className="grid gap-1 p-1 rounded-full bg-[#E4E5E8]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(item => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
          className={`h-10 rounded-full text-[13px] ${value === item.value ? 'bg-white font-extrabold shadow-[0_1px_4px_rgba(0,0,0,0.08)]' : 'font-bold text-body hover:text-ink'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
// Нижняя шторка (на компьютере — окно по центру)
// ---------------------------------------------------------------------
export function Sheet({ open, onClose, title, subtitle, children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/45 mb-fade" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-3 pb-7 mb-sheet outline-none"
      >
        <span className="block mx-auto mb-3 w-11 h-[5px] rounded-full bg-silverline sm:hidden" />
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="m-0 font-display font-bold text-[19px] leading-tight">{title}</h2>
            {subtitle && <p className="m-0 mt-1 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="w-11 h-11 shrink-0 rounded-full bg-mist flex items-center justify-center">
            <Icon name="close" size={16} stroke={2.2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Уведомления (тосты)
// ---------------------------------------------------------------------
export function useToast() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const show = useCallback((message, type = 'info') => {
    clearTimeout(timer.current)
    setToast({ message, type, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 3200)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = toast ? (
    <div
      key={toast.id}
      role="status"
      className={`fixed left-1/2 top-4 z-[60] w-[calc(100%-32px)] max-w-sm px-4 py-3 rounded-2xl text-sm font-bold shadow-[0_12px_32px_rgba(0,0,0,0.18)] mb-toast ${
        toast.type === 'error' ? 'bg-white text-danger border border-[#E8C3C0]' : 'bg-ink text-white'
      }`}
      style={{ transform: 'translateX(-50%)' }}
    >
      {toast.message}
    </div>
  ) : null
  return [node, show]
}

// ---------------------------------------------------------------------
// Декор: чёрное «пятно» и цветные точки
// ---------------------------------------------------------------------
export function Blob({ className = '' }) {
  return <div aria-hidden="true" className={`absolute bg-ink mb-morph ${className}`} style={{ borderRadius: '58% 42% 46% 54% / 52% 44% 56% 48%' }} />
}

export function Dot({ className = '', color = '#FFC531' }) {
  return <span aria-hidden="true" className={`absolute rounded-full mb-float ${className}`} style={{ background: color }} />
}

// ---------------------------------------------------------------------
// Пустое состояние
// ---------------------------------------------------------------------
export function Empty({ title, text, children }) {
  return (
    <div className="px-5 py-8 rounded-[24px] bg-white border border-dashed border-silver text-center mb-in">
      <div className="font-extrabold text-[15px]">{title}</div>
      {text && <div className="mt-1 text-[13px] text-muted leading-relaxed">{text}</div>}
      {children && <div className="mt-4 flex justify-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}
