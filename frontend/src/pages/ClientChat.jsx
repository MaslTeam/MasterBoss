import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { publicJson } from '../api'
import { Icon, Button, Dot, Blob, Spinner, useToast } from '../components/ui'
import { rub, durationText, parseDayMonth, WEEKDAY_SHORT, formatPhoneInput, dayLabel } from '../utils/format'
import { pushSupported, getPushSubscription, currentPushEndpoint } from '../utils/push'

// Страница записи клиента /c/:slug — три шага: услуга → время и контакты → статус заявки

function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
}

function readRef(slug) {
  const refKey = `mb_ref_${slug}`
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('from')
    const clean = (fromUrl || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20)
    if (clean) { localStorage.setItem(refKey, clean); return clean }
    return localStorage.getItem(refKey) || ''
  } catch {
    return ''
  }
}

// «05.11, 12:00» → { day: '05.11', time: '12:00', date: Date }
function splitSlot(slot) {
  const [day, time] = slot.split(', ')
  return { day, time, date: parseDayMonth(day) }
}

function slotHuman(slot) {
  if (!slot) return ''
  const { day, time, date } = splitSlot(slot)
  if (!date) return slot
  const label = dayLabel(date)
  return label === 'Сегодня' || label === 'Завтра' ? `${label.toLowerCase()}, ${time}` : `${WEEKDAY_SHORT[date.getDay()]} ${day}, ${time}`
}

export default function ClientChat() {
  const { slug = 'demo' } = useParams()
  const storageKey = `mb_booking_${slug}`
  const [toastNode, toast] = useToast()
  const [refTag] = useState(() => readRef(slug))

  const saved = useMemo(() => readSaved(storageKey), [storageKey])
  const [master, setMaster] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState(saved.bookingId ? 3 : saved.step || 1)
  const [serviceId, setServiceId] = useState(saved.serviceId || null)
  const [slots, setSlots] = useState(null)
  const [day, setDay] = useState(null)
  const [slot, setSlot] = useState(saved.slot || '')
  const [name, setName] = useState(saved.name || '')
  const [phone, setPhone] = useState(saved.phone || '')
  const [submitting, setSubmitting] = useState(false)
  const [booking, setBooking] = useState(saved.bookingId ? { id: saved.bookingId, token: saved.token, service: saved.bookedService, slot: saved.bookedSlot, price: saved.bookedPrice } : null)
  const [status, setStatus] = useState(saved.status || 'pending')
  const [canCancel, setCanCancel] = useState(false)
  const [pushOn, setPushOn] = useState(Boolean(saved.pushOn))
  const [pushLoading, setPushLoading] = useState(false)
  const [cancelAsk, setCancelAsk] = useState(false)

  // Сохраняем прогресс, чтобы перезагрузка страницы ничего не теряла
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        step, serviceId, slot, name, phone, status, pushOn,
        bookingId: booking?.id, token: booking?.token, bookedService: booking?.service, bookedSlot: booking?.slot, bookedPrice: booking?.price,
      }))
    } catch { /* приватный режим */ }
  }, [storageKey, step, serviceId, slot, name, phone, status, pushOn, booking])

  useEffect(() => {
    publicJson(`/api/master/${slug}`)
      .then(setMaster)
      .catch(err => { if (err.status === 404) setNotFound(true); else toast(err.message, 'error') })
  }, [slug, toast])

  const service = master?.services?.find(s => s.id === serviceId) || null

  // Услугу из сохранённого прогресса могли удалить — возвращаем на первый шаг
  useEffect(() => {
    if (master && step === 2 && !service) setStep(1)
  }, [master, step, service])

  // ---------- шаг 2: свободные окна ----------
  const loadSlots = useCallback(async () => {
    if (!serviceId) return
    try {
      const list = await publicJson(`/api/master/${slug}/available-slots?service_id=${serviceId}`)
      setSlots(list)
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [slug, serviceId, toast])

  useEffect(() => {
    if (step !== 2) return
    setSlots(null)
    loadSlots()
    const id = setInterval(loadSlots, 30000)
    return () => clearInterval(id)
  }, [step, loadSlots])

  const days = useMemo(() => {
    const map = new Map()
    for (const s of slots || []) {
      const { day: d, date } = splitSlot(s)
      if (!map.has(d)) map.set(d, { key: d, date, slots: [] })
      map.get(d).slots.push(s)
    }
    return [...map.values()]
  }, [slots])

  useEffect(() => {
    if (!days.length) return
    if (!day || !days.find(d => d.key === day)) {
      const fromSlot = slot && days.find(d => d.slots.includes(slot))
      setDay(fromSlot ? fromSlot.key : days[0].key)
    }
    if (slot && !days.some(d => d.slots.includes(slot))) setSlot('')
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  const daySlots = days.find(d => d.key === day)?.slots || []
  const phoneDigits = phone.replace(/\D/g, '')
  const canSubmit = slot && name.trim().length >= 2 && phoneDigits.length === 11

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const pushEndpoint = await currentPushEndpoint()
      const res = await publicJson('/api/chat/message', {
        method: 'POST',
        body: {
          slug,
          client_name: name.trim(),
          client_phone: phone,
          service_id: serviceId,
          datetime_str: slot,
          source: 'link',
          ...(refTag ? { ref: refTag } : {}),
          ...(pushEndpoint ? { push_endpoint: pushEndpoint } : {}),
        },
      })
      setBooking({ id: res.booking_id, token: res.client_token, service: service?.name, slot, price: service?.price })
      setStatus('pending')
      setStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (String(err.message).includes('Слот уже забронирован')) {
        toast('Это время только что заняли — выберите другое', 'error')
        setSlot('')
        loadSlots()
      } else {
        toast(err.message, 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ---------- шаг 3: статус заявки ----------
  const pollStatus = useCallback(async () => {
    if (!booking?.id) return
    try {
      const res = await publicJson(`/api/booking/${booking.id}/status?token=${encodeURIComponent(booking.token || '')}`)
      setStatus(res.status)
      setCanCancel(res.can_cancel)
    } catch (err) {
      if (err.status === 404) {
        // запись удалена (например, сброс демо) — начинаем заново
        setBooking(null)
        setStep(1)
      }
    }
  }, [booking])

  useEffect(() => {
    if (step !== 3 || !booking?.id) return
    pollStatus()
    if (!['pending', 'confirmed'].includes(status)) return
    const id = setInterval(pollStatus, 4000)
    return () => clearInterval(id)
  }, [step, booking, status, pollStatus])

  const enableReminder = async () => {
    setPushLoading(true)
    try {
      const sub = await getPushSubscription()
      await publicJson('/api/app/notifications/push-subscribe', {
        method: 'POST',
        body: { slug: `client_${slug}`, ...sub, booking_id: booking.id, booking_token: booking.token },
      })
      setPushOn(true)
      toast('Напомним за час до визита')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setPushLoading(false)
    }
  }

  const cancelBooking = async () => {
    if (!cancelAsk) { setCancelAsk(true); return }
    try {
      await publicJson(`/api/booking/${booking.id}/cancel-by-client?token=${encodeURIComponent(booking.token || '')}`, { method: 'POST' })
      setStatus('cancelled_by_client')
      toast('Запись отменена')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCancelAsk(false)
    }
  }

  const newBooking = () => {
    setBooking(null)
    setStatus('pending')
    setSlot('')
    setServiceId(null)
    setPushOn(false)
    setStep(1)
  }

  // ---------- разметка ----------
  if (notFound) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
          <h1 className="m-0 font-display font-bold text-2xl">Страница не найдена</h1>
          <p className="m-0 text-muted">Проверьте ссылку — возможно, мастер изменил адрес.</p>
          <Link to="/" className="mt-2 font-bold text-ink">На главную МастерБосс</Link>
        </div>
      </Shell>
    )
  }

  if (!master) {
    return <Shell><div className="flex-1 flex items-center justify-center text-muted"><Spinner className="w-6 h-6" /></div></Shell>
  }

  return (
    <Shell>
      {toastNode}

      {step === 1 && (
        <>
          <div className="relative bg-ink text-white px-6 pt-7 pb-[34px] rounded-b-[44px]">
            <Dot className="right-[26px] top-[26px] w-[22px] h-[22px]" color="#FFC531" />
            <Dot className="right-[58px] top-14 w-3 h-3 mb-d3" color="#F2795A" />
            <div className="flex gap-3.5 items-center">
              <span className="w-14 h-14 shrink-0 rounded-full bg-sun text-ink flex items-center justify-center font-display font-bold text-[22px]">{master.name[0]}</span>
              <div className="min-w-0">
                <div className="font-display font-bold text-xl tracking-[-0.02em] truncate">{master.name}</div>
                <div className="text-[13px] text-onink mt-0.5">{master.niche} · {master.schedule_text}</div>
              </div>
            </div>
            <Progress step={1} dark />
          </div>

          <div className="px-5 pt-[26px] flex-1 flex flex-col gap-2.5">
            <h1 className="m-0 mx-1 mb-2 font-display font-bold text-2xl tracking-[-0.03em] mb-in">Какая услуга?</h1>
            {master.services.length === 0 && <p className="mx-1 text-muted">Мастер ещё не добавил услуги.</p>}
            {master.services.map((s, i) => {
              const active = s.id === serviceId
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setServiceId(s.id)}
                  className={`text-left p-[18px] rounded-[22px] flex justify-between items-center gap-3 mb-in mb-d${Math.min(i + 1, 5)} ${active ? 'bg-sun' : 'bg-mist hover:bg-sand'}`}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className={`text-base ${active ? 'font-extrabold' : 'font-bold'}`}>{s.name}</span>
                    <span className={`text-[13px] ${active ? 'text-[#4A3A00]' : 'text-muted'}`}>{durationText(s.duration_min)}</span>
                  </span>
                  <span className="font-extrabold text-base whitespace-nowrap">{rub(s.price)}</span>
                </button>
              )
            })}
          </div>

          <Footer>
            <Button size="lg" className="w-full" disabled={!serviceId} onClick={() => setStep(2)}>
              Выбрать время <Icon name="arrow" size={18} stroke={2.2} />
            </Button>
            <div className="text-center text-xs text-muted">Запись без звонков и переписки · МастерБосс</div>
          </Footer>
        </>
      )}

      {step === 2 && service && (
        <>
          <div className="px-5 pt-[22px] flex items-center gap-3">
            <button type="button" aria-label="Назад" onClick={() => setStep(1)} className="w-11 h-11 rounded-full bg-mist flex items-center justify-center hover:bg-sand"><Icon name="back" stroke={2} /></button>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[15px] truncate">{master.name}</div>
              <div className="text-xs text-muted">Шаг 2 из 3</div>
            </div>
          </div>
          <div className="px-5 pt-3.5"><Progress step={2} /></div>

          <div className="mx-5 mt-[18px] px-4 py-3.5 rounded-[18px] bg-sunsoft flex justify-between items-center gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-sm truncate">{service.name}</div>
              <div className="text-xs text-sundeep">{durationText(service.duration_min)} · {rub(service.price)}</div>
            </div>
            <button type="button" onClick={() => setStep(1)} className="text-[13px] font-bold underline underline-offset-2">Изменить</button>
          </div>

          <h1 className="mx-6 mt-6 mb-3.5 font-display font-bold text-2xl tracking-[-0.03em]">Когда удобно?</h1>

          {slots === null ? (
            <div className="py-10 flex justify-center text-muted"><Spinner /></div>
          ) : days.length === 0 ? (
            <div className="mx-5 p-5 rounded-[22px] bg-mist text-sm text-body">На ближайшие две недели свободных окон нет. Напишите мастеру напрямую или загляните позже.</div>
          ) : (
            <>
              <div className="px-5 flex gap-2 overflow-x-auto mb-noscroll pb-1">
                {days.map((d, i) => {
                  const active = d.key === day
                  return (
                    <button
                      key={d.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDay(d.key)}
                      className={`shrink-0 w-[58px] py-2.5 rounded-[18px] flex flex-col items-center gap-0.5 mb-in mb-d${Math.min(i + 1, 5)} ${active ? 'bg-ink text-white' : 'bg-white border border-silver hover:border-ink'}`}
                    >
                      <span className={`text-xs ${active ? 'text-onink' : 'text-muted'}`}>{d.date ? WEEKDAY_SHORT[d.date.getDay()] : ''}</span>
                      <span className="font-extrabold text-lg">{d.key.slice(0, 2)}</span>
                    </button>
                  )
                })}
              </div>
              <div key={day} className="px-5 pt-4 grid grid-cols-4 gap-2 mb-fade">
                {daySlots.map(s => {
                  const active = s === slot
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSlot(s)}
                      className={`py-[13px] rounded-[14px] border text-[15px] ${active ? 'bg-sun border-sun font-extrabold' : 'bg-white border-silver font-bold hover:border-ink'}`}
                    >
                      {splitSlot(s).time}
                    </button>
                  )
                })}
              </div>
              <div className="px-6 pt-2.5 text-xs text-muted">Показаны только окна, где помещается {durationText(service.duration_min)}</div>
            </>
          )}

          <div className="px-5 pt-[22px] flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5 px-4 py-3 rounded-[18px] bg-mist text-xs font-bold text-muted focus-within:ring-[3px] focus-within:ring-sun/60 transition-shadow">Ваше имя
              <input value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" placeholder="Как к вам обращаться"
                className="border-0 p-0 bg-transparent text-base font-semibold text-ink placeholder:font-medium placeholder:text-[#9A978F] focus:shadow-none" />
            </label>
            <label className="flex flex-col gap-1.5 px-4 py-3 rounded-[18px] bg-mist text-xs font-bold text-muted focus-within:ring-[3px] focus-within:ring-sun/60 transition-shadow">Телефон
              <input type="tel" value={phone} onFocus={() => { if (!phone) setPhone('+7') }} onChange={e => setPhone(formatPhoneInput(e.target.value))} autoComplete="tel" placeholder="+7 (999) 123-45-67"
                className="border-0 p-0 bg-transparent text-base font-semibold text-ink placeholder:font-medium placeholder:text-[#9A978F] focus:shadow-none" />
            </label>
          </div>

          <Footer>
            <Button size="lg" className="w-full" disabled={!canSubmit} loading={submitting} onClick={submit}>
              {slot ? `Записаться на ${slotHuman(slot)}` : 'Выберите время'}
            </Button>
          </Footer>
        </>
      )}

      {step === 3 && booking && (
        <StatusScreen
          master={master}
          booking={booking}
          status={status}
          canCancel={canCancel}
          cancelAsk={cancelAsk}
          pushOn={pushOn}
          pushLoading={pushLoading}
          onReminder={enableReminder}
          onCancel={cancelBooking}
          onNew={newBooking}
        />
      )}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-white sm:bg-cream sm:py-8">
      <div className="relative max-w-[440px] mx-auto min-h-screen sm:min-h-[820px] bg-white sm:rounded-[36px] sm:shadow-[0_20px_60px_rgba(18,18,18,0.08)] overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  )
}

function Footer({ children }) {
  return <div className="mt-auto px-5 pt-4 pb-7 flex flex-col gap-3">{children}</div>
}

function Progress({ step, dark = false }) {
  return (
    <div className={dark ? 'mt-[26px]' : ''}>
      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map(i => (
          <span key={i} className={`h-1 rounded-full transition-colors duration-500 ${i === step ? 'bg-sun' : i < step ? (dark ? 'bg-white' : 'bg-ink') : (dark ? 'bg-ink3' : 'bg-silverline')}`} />
        ))}
      </div>
      {dark && <div className="text-xs text-onink mt-2.5 font-semibold">Шаг {step} из 3</div>}
    </div>
  )
}

const STATUS_COPY = {
  pending: ['Заявка\nу мастера', (n) => `${n} подтвердит запись — статус обновится прямо здесь, страницу можно закрыть.`],
  confirmed: ['Вы\nзаписаны', (n) => `Запись подтверждена. ${n} ждёт вас!`],
  completed: ['Спасибо\nза визит', () => 'Будем рады видеть вас снова — запишитесь, когда будет удобно.'],
  no_show: ['Визит\nне состоялся', () => 'Запишитесь на другое удобное время.'],
  cancelled: ['Время\nне подошло', (n) => `${n} не сможет принять вас в это время. Выберите другое окно.`],
  cancelled_by_client: ['Запись\nотменена', () => 'Мастер получил уведомление. Окно снова свободно.'],
}

function StatusScreen({ master, booking, status, canCancel, cancelAsk, pushOn, pushLoading, onReminder, onCancel, onNew }) {
  const [title, text] = STATUS_COPY[status] || STATUS_COPY.pending
  const firstName = master.name.split(' ')[0]
  const active = ['pending', 'confirmed'].includes(status)
  const ended = !active
  const visitTime = booking.slot ? splitSlot(booking.slot) : null

  return (
    <>
      <Blob className="right-[-120px] top-[-110px] w-[330px] h-[330px]" />
      <Dot className="right-[150px] top-10 w-4 h-4" color="#F2795A" />
      <Dot className="right-10 top-[170px] w-[26px] h-[26px] mb-d3" color="#C4C7CC" />

      <div className="relative px-6 pt-[70px] flex flex-col gap-[18px]">
        <span key={status} className={`w-[76px] h-[76px] rounded-full flex items-center justify-center mb-pop ${ended && status !== 'completed' ? 'bg-mist' : 'bg-sun'}`}>
          <Icon name={ended && status !== 'completed' ? 'close' : 'check'} size={36} stroke={2.6} />
        </span>
        <h1 className="m-0 font-display font-bold text-[28px] leading-[1.1] tracking-[-0.03em] whitespace-pre-line mb-in mb-d1">{title}</h1>
        <p className="m-0 text-[15px] leading-relaxed text-body mb-in mb-d2">{text(firstName)}</p>
      </div>

      <div className="relative mx-5 mt-[26px] p-[18px] bg-white border border-silver border-t-4 border-t-ink flex flex-col gap-3.5 mb-in mb-d3">
        <div className="flex justify-between gap-3">
          <div className="min-w-0">
            <div className="font-extrabold text-base">{booking.service}</div>
            <div className="text-[13px] text-muted mt-0.5">{visitTime?.date ? `${dayLabel(visitTime.date)}, ${visitTime.day} · ${visitTime.time}` : booking.slot}</div>
          </div>
          {booking.price ? <span className="font-extrabold text-base whitespace-nowrap">{rub(booking.price)}</span> : null}
        </div>
        {active && (
          <>
            <div className="h-px bg-silver" />
            <div className="flex flex-col gap-3">
              <TimelineRow done label="Заявка отправлена" />
              <TimelineRow done={status === 'confirmed'} current={status === 'pending'} label={status === 'confirmed' ? 'Запись подтверждена' : 'Мастер подтверждает'} />
              <TimelineRow done={pushOn} current={status === 'confirmed' && !pushOn} label={pushOn ? 'Напомним за час до визита' : 'Напоминание за час до визита'} />
            </div>
          </>
        )}
      </div>

      <Footer>
        {active && pushSupported() && !pushOn && (
          <Button variant="sun" size="lg" className="w-full" loading={pushLoading} onClick={onReminder}>
            <Icon name="bell" size={18} stroke={2} /> Напомнить мне о визите
          </Button>
        )}
        {active && canCancel && (
          <button type="button" onClick={onCancel} className={`h-12 rounded-full font-bold text-sm ${cancelAsk ? 'bg-danger text-white' : 'underline underline-offset-4'}`}>
            {cancelAsk ? 'Точно отменить запись?' : 'Отменить запись'}
          </button>
        )}
        {active && !canCancel && status === 'confirmed' && (
          <div className="text-center text-xs text-muted">Онлайн-отмена — не позднее чем за 24 часа. Позже — напишите мастеру.</div>
        )}
        {ended && <Button size="lg" className="w-full" onClick={onNew}>Записаться ещё раз</Button>}
      </Footer>
    </>
  )
}

function TimelineRow({ done, current, label }) {
  return (
    <div className="flex gap-3 items-center">
      {done ? (
        <span className="w-6 h-6 rounded-full bg-ink text-sun flex items-center justify-center mb-pop"><Icon name="check" size={12} stroke={3.4} /></span>
      ) : current ? (
        <span className="w-6 h-6 rounded-full border-2 border-ink flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-ink mb-float" style={{ animationDuration: '1.6s' }} /></span>
      ) : (
        <span className="w-6 h-6 rounded-full border-2 border-silver" />
      )}
      <span className={`text-sm ${done || current ? 'font-bold' : 'text-muted'}`}>{label}</span>
    </div>
  )
}
