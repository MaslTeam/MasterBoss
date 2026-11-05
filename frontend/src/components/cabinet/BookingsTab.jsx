import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson, publicJson } from '../../api'
import { Icon, Button, Segments, Sheet, Empty, Spinner } from '../ui'
import { TabHeader, RuleLabel, ShareButtons, bookingLink } from './shared'
import { rub, dayLabel, timeOf, isSameDay, agoText, refLabel, copyText, startOfDay } from '../../utils/format'

const STATUS_BADGE = {
  pending: ['Ждёт ответа', 'bg-sunsoft text-sundeep'],
  confirmed: ['Подтверждена', 'bg-silverlight text-ink'],
  completed: ['Пришла', 'bg-sun text-ink'],
  no_show: ['Не пришла', 'bg-[#FCEDEC] text-danger'],
  cancelled: ['Отклонена', 'bg-mist text-muted'],
  cancelled_by_client: ['Отменена клиентом', 'bg-mist text-muted'],
}

const TEST_NAMES = ['Ирина', 'Екатерина', 'Дарья', 'Алина', 'Светлана', 'Ольга']

function visitDate(b) {
  return b.scheduled_at ? new Date(b.scheduled_at) : null
}

export default function BookingsTab({ slug, profile, toast, onCounts }) {
  const [bookings, setBookings] = useState(null)
  const [cancellations, setCancellations] = useState([])
  const [pilot, setPilot] = useState(null)
  const [filter, setFilter] = useState('new')
  const [busy, setBusy] = useState(null)          // id записи, по которой идёт запрос
  const [linkOpen, setLinkOpen] = useState(false)
  const [care, setCare] = useState(null)           // { booking, text, loading }
  const [testLoading, setTestLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, stats, pilotStats] = await Promise.all([
        apiJson('/api/app/bookings'),
        apiJson('/api/app/stats'),
        apiJson('/api/app/pilot-stats'),
      ])
      setBookings(list)
      setCancellations(stats.new_cancellations || [])
      setPilot(pilotStats)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [toast])

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [load])

  const groups = useMemo(() => {
    const list = bookings || []
    const now = new Date()
    const pending = list.filter(b => b.status === 'pending')
    const today = list.filter(b => {
      const d = visitDate(b)
      return d && isSameDay(d, now) && !['cancelled', 'cancelled_by_client'].includes(b.status)
    })
    const todayStart = startOfDay(now)
    const upcoming = list.filter(b => { const d = visitDate(b); return d && d >= todayStart })
    const past = list.filter(b => { const d = visitDate(b); return d && d < todayStart }).reverse()
    return { pending, today, upcoming, past }
  }, [bookings])

  useEffect(() => { onCounts?.(groups.pending.length) }, [groups.pending.length, onCounts])

  const act = async (booking, path, okMessage) => {
    setBusy(booking.id)
    try {
      await apiJson(`/api/app/booking/${booking.id}/${path}`, { method: 'POST' })
      toast(okMessage)
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const dismissCancellation = async (id) => {
    setCancellations(prev => prev.filter(c => c.booking_id !== id))
    try { await apiJson(`/api/app/booking/${id}/mark-cancellation-read`, { method: 'POST' }) } catch { /* не критично */ }
  }

  const openCare = async (booking) => {
    setCare({ booking, text: '', loading: true })
    try {
      const data = await apiJson(`/api/app/booking/${booking.id}/send-care-card`, { method: 'POST' })
      setCare({ booking, text: data.card_text, loading: false })
    } catch (err) {
      setCare(null)
      toast(err.message, 'error')
    }
  }

  const createTestBooking = async () => {
    setTestLoading(true)
    try {
      const services = (await apiJson('/api/app/services')).filter(s => s.is_active)
      if (!services.length) throw new Error('Сначала добавьте хотя бы одну услугу в «Профиле»')
      const service = services[Math.floor(Math.random() * services.length)]
      const slots = await publicJson(`/api/master/${slug}/available-slots?service_id=${service.id}`)
      if (!slots.length) throw new Error('Нет свободных окон — проверьте график в «Профиле»')
      const slot = slots[Math.floor(Math.random() * Math.min(slots.length, 10))]
      const name = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)]
      await publicJson('/api/chat/message', {
        method: 'POST',
        body: {
          slug,
          client_name: `${name} (тест)`,
          client_phone: `999${Math.floor(1000000 + Math.random() * 8999999)}`,
          service_id: service.id,
          datetime_str: slot,
          source: 'test',
        },
      })
      toast('Тестовая заявка создана — она не попадает в счётчик пилота')
      setFilter('new')
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setTestLoading(false)
    }
  }

  const segments = [
    { value: 'new', label: `Новые${groups.pending.length ? ` · ${groups.pending.length}` : ''}` },
    { value: 'today', label: 'Сегодня' },
    { value: 'all', label: 'Все' },
  ]

  return (
    <div className="pb-6">
      <TabHeader
        kicker={profile?.name}
        title="Записи"
        action={
          <button type="button" onClick={() => setLinkOpen(true)} className="h-11 px-3.5 rounded-full bg-ink text-white font-bold text-[13px] flex items-center gap-2 hover:bg-black">
            <Icon name="link" size={16} stroke={2} className="text-sun" /> Моя ссылка
          </button>
        }
      />

      {pilot && (
        <div className="mx-5 mt-4 px-4 py-3 bg-white border border-silver border-l-4 border-l-ink flex justify-between items-center gap-2.5 mb-in">
          <span className="text-[13px] text-body">Через ссылку</span>
          <span className="text-[13px]"><b className="font-extrabold">{pilot.last_7_days}</b> за неделю · <b className="font-extrabold">{pilot.last_30_days}</b> за месяц</span>
        </div>
      )}

      {cancellations.map(c => (
        <div key={c.booking_id} className="mx-5 mt-3 p-4 rounded-[20px] bg-[#FCEDEC] flex gap-3 items-start mb-in" role="alert">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-extrabold text-danger uppercase tracking-[0.06em]">Клиент отменил запись</div>
            <div className="mt-1 text-sm font-bold">{c.client_name} · {c.service_name}</div>
            <div className="text-[13px] text-body">{c.datetime_str} — окно снова свободно</div>
          </div>
          <button type="button" onClick={() => dismissCancellation(c.booking_id)} className="h-10 px-3.5 rounded-full bg-white text-[13px] font-extrabold">Понятно</button>
        </div>
      ))}

      <div className="mx-5 mt-3.5"><Segments items={segments} value={filter} onChange={setFilter} /></div>

      <div className="px-5 pt-3.5 flex flex-col gap-2.5">
        {bookings === null && <div className="py-10 flex justify-center text-muted"><Spinner /></div>}

        {bookings !== null && filter === 'new' && (
          groups.pending.length ? groups.pending.map((b, i) => (
            <PendingCard key={b.id} booking={b} dark={i === 0} index={i} busy={busy === b.id}
              onConfirm={() => act(b, 'confirm', 'Запись подтверждена')}
              onReject={() => act(b, 'reject', 'Заявка отклонена')} />
          )) : (
            <Empty title="Новых заявок нет" text="Отправьте ссылку клиентам — заявки появятся здесь. Или проверьте, как это работает, на тестовой заявке.">
              <Button variant="sun" size="sm" onClick={() => setLinkOpen(true)}>Моя ссылка</Button>
              <Button variant="outline" size="sm" loading={testLoading} onClick={createTestBooking}>Тестовая заявка</Button>
            </Empty>
          )
        )}

        {bookings !== null && filter === 'today' && (
          groups.today.length ? groups.today.map((b, i) => (
            <BookingRow key={b.id} booking={b} index={i} busy={busy === b.id} onAct={act} onCare={openCare} />
          )) : <Empty title="Сегодня записей нет" text="Подтверждённые записи на сегодня появятся здесь." />
        )}

        {bookings !== null && filter === 'all' && (
          groups.upcoming.length || groups.past.length ? (
            <>
              {groups.upcoming.length > 0 && <RuleLabel>Впереди</RuleLabel>}
              {groups.upcoming.map((b, i) => <BookingRow key={b.id} booking={b} index={i} showDay busy={busy === b.id} onAct={act} onCare={openCare} />)}
              {groups.past.length > 0 && <RuleLabel>Последние 2 недели</RuleLabel>}
              {groups.past.map((b, i) => <BookingRow key={b.id} booking={b} index={i} showDay busy={busy === b.id} onAct={act} onCare={openCare} />)}
            </>
          ) : <Empty title="Записей пока нет" text="Здесь будут записи на ближайшее время и за последние 2 недели." />
        )}
      </div>

      <LinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} slug={slug} toast={toast} />

      <Sheet open={Boolean(care)} onClose={() => setCare(null)} title="Памятка после визита" subtitle={care?.booking ? `${care.booking.client_name} · ${care.booking.service_name}` : ''}>
        {care?.loading ? (
          <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted"><Spinner /> GigaChat составляет памятку…</div>
        ) : care && (
          <div className="flex flex-col gap-4">
            <textarea
              rows={7}
              value={care.text}
              onChange={e => setCare(prev => ({ ...prev, text: e.target.value }))}
              className="w-full p-4 rounded-[20px] border-0 bg-sunsoft text-[15px] leading-relaxed resize-none"
              aria-label="Текст памятки"
            />
            <ShareButtons text={care.text} link={bookingLink(slug)} toast={toast} />
          </div>
        )}
      </Sheet>
    </div>
  )
}

function PendingCard({ booking, dark, index, busy, onConfirm, onReject }) {
  const d = visitDate(booking)
  return (
    <div className={`p-[18px] rounded-[24px] flex flex-col gap-3 mb-in mb-d${Math.min(index + 1, 5)} ${dark ? 'bg-ink text-white' : 'bg-white'}`}>
      <div className="flex justify-between items-center gap-2">
        <span className={`text-xs font-bold ${dark ? 'text-onink' : 'text-muted'}`}>Новая заявка · {booking.source === 'test' ? 'тестовая' : refLabel(booking.ref)}</span>
        {booking.created_at && <span className={`text-xs ${dark ? 'text-onink' : 'text-muted'}`}>{agoText(booking.created_at)}</span>}
      </div>
      <div>
        <div className="font-extrabold text-[17px]">{booking.client_name}</div>
        <div className={`text-sm mt-0.5 ${dark ? 'text-onink' : 'text-muted'}`}>{booking.service_name} · {rub(booking.price)}</div>
      </div>
      <div className={`inline-flex self-start gap-2 items-center px-3 py-2 rounded-xl font-bold text-sm ${dark ? 'bg-ink2' : 'bg-mist'}`}>
        <Icon name="calendar" size={16} stroke={2} className={dark ? 'text-sun' : ''} />
        {d ? `${dayLabel(d)} · ${timeOf(d)}` : booking.datetime_str}
      </div>
      <div className="flex gap-2">
        <Button variant={dark ? 'sun' : 'dark'} className="flex-1" loading={busy} onClick={onConfirm}>Подтвердить</Button>
        <button type="button" disabled={busy} onClick={onReject} className={`h-12 px-[18px] rounded-full font-bold text-sm border-[1.5px] ${dark ? 'border-body text-white hover:border-white' : 'border-[#E2E0DA] hover:border-ink'}`}>Отказать</button>
      </div>
    </div>
  )
}

function BookingRow({ booking, index, showDay, busy, onAct, onCare }) {
  const d = visitDate(booking)
  const [badge, badgeClass] = STATUS_BADGE[booking.status] || [booking.status, 'bg-mist text-muted']
  const canMark = booking.can_mark_visit
  const minutesUntil = d ? Math.round((d - Date.now()) / 60000) : null
  return (
    <div className={`p-4 rounded-[22px] bg-white flex flex-col gap-3 mb-in mb-d${Math.min(index + 1, 5)}`}>
      <div className="flex gap-3.5 items-center">
        <div className="w-[54px] shrink-0">
          <div className="font-display font-semibold text-[15px]">{d ? timeOf(d) : '—'}</div>
          {showDay && d && <div className="text-[11px] text-muted mt-0.5">{dayLabel(d)}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[15px] truncate">{booking.client_name}</div>
          <div className="text-xs text-muted truncate">{booking.service_name} · {rub(booking.price)}</div>
        </div>
        {!(canMark && booking.status === 'confirmed') && (
          <span className={`shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-extrabold ${badgeClass}`}>{badge}</span>
        )}
      </div>

      {booking.status === 'pending' && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" loading={busy} onClick={() => onAct(booking, 'confirm', 'Запись подтверждена')}>Подтвердить</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(booking, 'reject', 'Заявка отклонена')}>Отказать</Button>
        </div>
      )}

      {booking.status === 'confirmed' && canMark && (
        <div className="flex gap-2 items-center">
          <span className="flex-1 text-xs text-muted">Визит прошёл — отметьте</span>
          <Button size="sm" variant="sun" loading={busy} onClick={() => onAct(booking, 'visited', `Пришла · ${rub(booking.price)} в кассе`)}>Пришла</Button>
          <button type="button" aria-label="Не пришла" disabled={busy} onClick={() => onAct(booking, 'no-show', 'Отмечено: не пришла')} className="w-11 h-11 rounded-full border border-silver bg-white flex items-center justify-center hover:border-ink">
            <Icon name="close" size={16} stroke={2.2} />
          </button>
        </div>
      )}

      {booking.status === 'confirmed' && !canMark && minutesUntil !== null && minutesUntil >= 0 && minutesUntil < 24 * 60 && (
        <div className="text-xs text-muted">{minutesUntil < 60 ? `Через ${minutesUntil} мин` : `Через ${Math.round(minutesUntil / 60)} ч`} · после визита появятся кнопки «Пришла / Не пришла»</div>
      )}

      {booking.status === 'completed' && (
        <div className="flex gap-2 items-center flex-wrap">
          <Button size="sm" variant="soft" onClick={() => onCare(booking)}><Icon name="spark" size={16} /> Памятка после визита</Button>
          <button type="button" disabled={busy} onClick={() => onAct(booking, 'no-show', 'Исправлено: не пришла')} className="text-xs font-bold text-muted underline underline-offset-2 hover:text-ink">Исправить на «Не пришла»</button>
        </div>
      )}
      {booking.status === 'no_show' && (
        <button type="button" disabled={busy} onClick={() => onAct(booking, 'visited', 'Исправлено: пришла')} className="self-start text-xs font-bold text-muted underline underline-offset-2 hover:text-ink">Исправить на «Пришла»</button>
      )}
    </div>
  )
}

function LinkSheet({ open, onClose, slug, toast }) {
  const link = bookingLink(slug)
  const copy = async (value, label) => {
    const ok = await copyText(value)
    toast(ok ? `${label} скопирована` : 'Не удалось скопировать', ok ? 'info' : 'error')
  }
  return (
    <Sheet open={open} onClose={onClose} title="Ссылка для клиентов" subtitle="Клиент открывает её и записывается сам">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 items-center p-1.5 pl-4 rounded-full bg-mist">
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">{link.replace(/^https?:\/\//, '')}</span>
          <Button size="sm" variant="sun" onClick={() => copy(link, 'Ссылка')}>Копировать</Button>
        </div>
        <div>
          <div className="text-xs font-bold text-muted mb-2">Ссылка с меткой — в счётчике будет видно, откуда пришла запись</div>
          <div className="grid grid-cols-3 gap-2">
            {[['insta', 'Instagram'], ['tg', 'Telegram'], ['max', 'MAX']].map(([ref, label]) => (
              <button key={ref} type="button" onClick={() => copy(bookingLink(slug, ref), `Ссылка для ${label}`)} className="py-3 rounded-2xl border border-silver bg-white text-sm font-extrabold hover:border-ink">
                {label}
              </button>
            ))}
          </div>
        </div>
        <a href={link} target="_blank" rel="noopener noreferrer" className="mb-lift py-3.5 rounded-full bg-ink text-white text-center font-extrabold text-sm no-underline hover:bg-black">Открыть как клиент</a>
      </div>
    </Sheet>
  )
}
