import React, { useCallback, useEffect, useState } from 'react'
import { apiJson } from '../../api'
import { Icon, Button, Segments, Sheet, Spinner, Empty } from '../ui'
import { TabHeader, ShareButtons, Avatar, bookingLink } from './shared'
import { copyText } from '../../utils/format'

function cycleText(days) {
  if (!days) return ''
  if (days % 7 === 0) {
    const w = days / 7
    return w === 1 ? 'обычно раз в неделю' : `обычно раз в ${w} ${w < 5 ? 'недели' : 'недель'}`
  }
  return `обычно раз в ${days} дн`
}

export default function ClientsTab({ slug, profile, toast, onCounts }) {
  const [filter, setFilter] = useState('due')
  const [due, setDue] = useState(null)
  const [soon, setSoon] = useState(null)
  const [all, setAll] = useState(null)
  const [reminder, setReminder] = useState(null)   // { title, subtitle, text, loading }

  const load = useCallback(async () => {
    try {
      const [d, s, a] = await Promise.all([
        apiJson('/api/app/notifications/clients-due'),
        apiJson('/api/app/notifications/upcoming'),
        apiJson('/api/app/clients'),
      ])
      setDue(d); setSoon(s); setAll(a)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [toast])

  useEffect(() => { load() }, [load])
  useEffect(() => { onCounts?.((due?.length || 0) + (soon?.length || 0)) }, [due, soon, onCounts])

  const remindDue = async (client) => {
    setReminder({ title: `Напомнить: ${client.name.split(' ')[0]}`, subtitle: 'Текст составляет GigaChat — можно поправить', loading: true, text: '' })
    try {
      const res = await apiJson('/api/app/ai/reminder', {
        method: 'POST',
        body: { client_id: client.client_id, client_name: client.name, days_ago: client.days_since_last_visit, cycle_days: client.cycle_days },
      })
      const link = bookingLink(slug)
      const text = res.message.includes('/c/') ? res.message : `${res.message}\n${link}`
      setReminder(prev => prev && ({
        ...prev,
        loading: false,
        text,
        subtitle: res.source === 'gigachat' ? 'Текст составил GigaChat — можно поправить' : 'Шаблон: GigaChat сейчас недоступен — можно поправить',
      }))
    } catch (err) {
      setReminder(null)
      toast(err.message, 'error')
    }
  }

  const remindSoon = (b) => {
    const time = (b.datetime_str.split(', ')[1]) || b.datetime_str
    const master = profile?.name || 'ваш мастер'
    setReminder({
      title: `Напомнить: ${b.client_name.split(' ')[0]}`,
      subtitle: `Визит через ${b.minutes_until} мин`,
      loading: false,
      text: `${b.client_name.split(' ')[0]}, добрый день! Напоминаю: сегодня в ${time} — ${b.service_name.toLowerCase()}. Жду вас! ${master}`,
    })
  }

  const segments = [
    { value: 'due', label: `Пора${due?.length ? ` · ${due.length}` : ''}` },
    { value: 'soon', label: `Через час${soon?.length ? ` · ${soon.length}` : ''}` },
    { value: 'all', label: `Все${all?.length ? ` · ${all.length}` : ''}` },
  ]

  const loading = due === null || soon === null || all === null

  return (
    <div className="pb-6">
      <TabHeader title="Клиенты" />
      <div className="mx-5 mt-4"><Segments items={segments} value={filter} onChange={setFilter} /></div>

      <div className="px-5 pt-3.5 flex flex-col gap-2.5">
        {loading && <div className="py-10 flex justify-center text-muted"><Spinner /></div>}

        {!loading && filter === 'due' && (due.length ? due.map((c, i) => (
          <div key={c.client_id} className={`p-4 rounded-[22px] bg-white flex gap-3 items-center mb-in mb-d${Math.min(i + 1, 5)}`}>
            <Avatar name={c.name} index={i} />
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[15px] truncate">{c.name}</div>
              <div className="text-xs text-muted">Была {c.days_since_last_visit} дн назад · {cycleText(c.cycle_days)}</div>
            </div>
            <Button size="sm" variant="sun" onClick={() => remindDue(c)}>Напомнить</Button>
          </div>
        )) : <Empty title="Всем рано напоминать" text="Когда клиентка не приходит дольше обычного цикла, она появится здесь." />)}

        {!loading && filter === 'soon' && (soon.length ? soon.map((b, i) => (
          <div key={b.booking_id} className={`p-4 rounded-[22px] bg-white flex gap-3 items-center mb-in mb-d${Math.min(i + 1, 5)}`}>
            <span className="w-11 h-11 shrink-0 rounded-full bg-ink text-sun flex items-center justify-center"><Icon name="clock" /></span>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[15px] truncate">{b.client_name}</div>
              <div className="text-xs text-muted truncate">{b.service_name} · через {b.minutes_until} мин</div>
            </div>
            <Button size="sm" variant="sun" onClick={() => remindSoon(b)}>Напомнить</Button>
          </div>
        )) : <Empty title="В ближайший час визитов нет" text="Записи, которые начнутся в течение часа, появятся здесь. Если клиент включил уведомления, напоминание придёт ему само." />)}

        {!loading && filter === 'all' && (all.length ? all.map((c, i) => (
          <div key={c.id} className={`p-4 rounded-[22px] bg-white flex gap-3 items-center mb-in mb-d${Math.min(i + 1, 5)}`}>
            <Avatar name={c.name} index={i} />
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[15px] truncate">{c.name}</div>
              <div className="text-xs text-muted truncate">
                {c.days_since_last_visit != null ? `Последний визит ${c.days_since_last_visit} дн назад` : 'Ещё не была'}
                {c.is_due_return ? ' · пора напомнить' : ''}
              </div>
            </div>
            <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={`Позвонить: ${c.name}`} className="mb-lift w-11 h-11 rounded-full border border-silver flex items-center justify-center text-ink hover:border-ink">
              <Icon name="phone" size={18} />
            </a>
            <button type="button" aria-label={`Скопировать телефон: ${c.name}`} onClick={async () => toast((await copyText(c.phone)) ? 'Телефон скопирован' : 'Не удалось скопировать')} className="w-11 h-11 rounded-full border border-silver bg-white flex items-center justify-center hover:border-ink">
              <Icon name="copy" size={18} />
            </button>
          </div>
        )) : <Empty title="Клиентов пока нет" text="Клиенты появляются автоматически после первой записи по ссылке." />)}
      </div>

      <Sheet open={Boolean(reminder)} onClose={() => setReminder(null)} title={reminder?.title} subtitle={reminder?.subtitle}>
        {reminder?.loading ? (
          <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted"><Spinner /> GigaChat пишет тёплое напоминание…</div>
        ) : reminder && (
          <div className="flex flex-col gap-4">
            <textarea
              rows={5}
              value={reminder.text}
              onChange={e => setReminder(prev => ({ ...prev, text: e.target.value }))}
              className="w-full p-4 rounded-[20px] border-0 bg-sunsoft text-[15px] leading-relaxed resize-none"
              aria-label="Текст напоминания"
            />
            <ShareButtons text={reminder.text} link={bookingLink(slug)} toast={toast} />
          </div>
        )}
      </Sheet>
    </div>
  )
}
