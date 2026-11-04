import React from 'react'
import { Icon } from '../ui'
import { copyText } from '../../utils/format'

// Ссылка на страницу записи мастера
export function bookingLink(slug, ref) {
  return `${window.location.origin}/c/${slug}${ref ? `?from=${ref}` : ''}`
}

// Заголовок вкладки
export function TabHeader({ kicker, title, action }) {
  return (
    <div className="px-5 pt-6 flex justify-between items-center gap-3">
      <div className="min-w-0">
        {kicker && <div className="text-[13px] text-muted font-semibold truncate">{kicker}</div>}
        <h1 className="m-0 mt-0.5 font-display font-bold text-[26px] tracking-[-0.03em]">{title}</h1>
      </div>
      {action}
    </div>
  )
}

// Подзаголовок раздела со строгой линией
export function RuleLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 px-1 pt-1.5 text-xs font-extrabold text-graphite uppercase tracking-[0.12em]">
      {children}
      <span className="flex-1 h-px bg-silver" />
    </div>
  )
}

// Три кнопки отправки текста клиенту: копировать, Telegram, MAX
export function ShareButtons({ text, link, toast }) {
  const copy = async (message) => {
    const ok = await copyText(text)
    toast(ok ? message : 'Не удалось скопировать — выделите текст вручную', ok ? 'info' : 'error')
    return ok
  }
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
  return (
    <div className="grid grid-cols-3 gap-2">
      <button type="button" onClick={() => copy('Текст скопирован')} className="py-[15px] rounded-[18px] border border-silver bg-white font-extrabold text-sm flex flex-col items-center gap-1.5 hover:border-ink">
        <Icon name="copy" />Копировать
      </button>
      <a href={tgUrl} target="_blank" rel="noopener noreferrer" className="mb-lift py-[15px] rounded-[18px] bg-ink text-white font-extrabold text-sm flex flex-col items-center gap-1.5 no-underline hover:bg-black">
        <Icon name="send" className="text-sun" />Telegram
      </a>
      <button
        type="button"
        onClick={async () => {
          await copy('Текст скопирован — вставьте его в чат MAX')
          window.open('https://web.max.ru/', '_blank', 'noopener,noreferrer')
        }}
        className="py-[15px] rounded-[18px] bg-sun text-ink font-extrabold text-sm flex flex-col items-center gap-1.5 hover:bg-[#F5B800]"
      >
        <Icon name="chat" />MAX
      </button>
    </div>
  )
}

// Нижняя панель вкладок
const TABS = [
  ['bookings', 'Записи', 'calendar'],
  ['finance', 'Касса', 'wallet'],
  ['clients', 'Клиенты', 'users'],
  ['profile', 'Профиль', 'user'],
]

export function BottomNav({ tab, onChange, badges = {} }) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 px-3.5 pt-2.5 pb-[calc(14px+env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-sand grid grid-cols-4 gap-1">
      {TABS.map(([id, label, icon]) => {
        const active = tab === id
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(id)}
            className={`relative py-2 rounded-2xl flex flex-col items-center gap-1 text-[11px] ${active ? 'bg-ink text-white font-extrabold' : 'text-muted font-bold hover:text-ink'}`}
          >
            <Icon name={icon} size={22} className={active ? 'text-sun' : ''} />
            {label}
            {badges[id] > 0 && (
              <span className="absolute top-1 right-[18%] min-w-[18px] h-[18px] px-1 rounded-full bg-sun text-ink text-[10px] font-black flex items-center justify-center">{badges[id]}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

// Аватар с инициалами
const AVATAR_BG = ['#E8C4A8', '#C4C7CC', '#FFF4D1', '#F4E6DA', '#ECEDEF']
export function Avatar({ name, index = 0, size = 44 }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  return (
    <span className="shrink-0 rounded-full flex items-center justify-center font-extrabold text-sm" style={{ width: size, height: size, background: AVATAR_BG[index % AVATAR_BG.length] }}>
      {initials}
    </span>
  )
}
