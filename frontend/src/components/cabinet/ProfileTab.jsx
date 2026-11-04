import React, { useCallback, useEffect, useState } from 'react'
import { apiJson } from '../../api'
import { Icon, Button, Sheet, Switch, Spinner, Field } from '../ui'
import { TabHeader, bookingLink } from './shared'
import { rub, durationText, copyText } from '../../utils/format'
import { pushSupported, getPushSubscription, VAPID_KEY } from '../../utils/push'

const WEEKDAYS = [['mon', 'Пн'], ['tue', 'Вт'], ['wed', 'Ср'], ['thu', 'Чт'], ['fri', 'Пт'], ['sat', 'Сб'], ['sun', 'Вс']]
const STEPS = [[15, 'каждые 15 мин'], [30, 'каждые 30 мин'], [60, 'каждый час'], [90, 'каждые 1,5 ч'], [120, 'каждые 2 ч']]
const DURATIONS = [15, 30, 40, 45, 60, 75, 90, 120, 150, 180]

export default function ProfileTab({ slug, profile, reloadProfile, toast, onLogout, onDemoReset }) {
  const [schedule, setSchedule] = useState(null)
  const [step, setStep] = useState(60)
  const [scheduleDirty, setScheduleDirty] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [services, setServices] = useState(null)
  const [serviceEditor, setServiceEditor] = useState(null)
  const [profileEditor, setProfileEditor] = useState(null)
  const [pin, setPin] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pushState, setPushState] = useState(() => (typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'on' : 'off'))
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (profile && !scheduleDirty) {
      setSchedule(profile.work_schedule)
      setStep(profile.slot_step_min || 60)
    }
  }, [profile, scheduleDirty])

  const loadServices = useCallback(async () => {
    try { setServices(await apiJson('/api/app/services')) } catch (err) { toast(err.message, 'error') }
  }, [toast])
  useEffect(() => { loadServices() }, [loadServices])

  const link = bookingLink(slug)

  // ---------- график ----------
  const toggleDay = (key) => {
    setSchedule(prev => ({ ...prev, [key]: prev[key] ? null : ['10:00', '20:00'] }))
    setScheduleDirty(true)
  }
  const setTime = (key, i, value) => {
    setSchedule(prev => { const day = [...(prev[key] || ['10:00', '20:00'])]; day[i] = value; return { ...prev, [key]: day } })
    setScheduleDirty(true)
  }
  const saveSchedule = async () => {
    for (const [key, label] of WEEKDAYS) {
      const day = schedule[key]
      if (day && day[0] >= day[1]) return toast(`${label}: начало должно быть раньше конца`, 'error')
    }
    setSavingSchedule(true)
    try {
      await apiJson('/api/app/schedule', { method: 'PUT', body: { schedule, slot_step_min: Number(step) } })
      setScheduleDirty(false)
      toast('График сохранён — клиенты видят только эти окна')
      reloadProfile()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingSchedule(false)
    }
  }

  // ---------- PIN ----------
  const savePin = async () => {
    if (!/^\d{4,8}$/.test(pin)) return toast('PIN — от 4 до 8 цифр', 'error')
    setSavingPin(true)
    try {
      await apiJson('/api/app/profile', { method: 'PUT', body: { pin_code: pin } })
      setPin('')
      toast('Новый PIN сохранён')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingPin(false)
    }
  }

  // ---------- уведомления мастеру ----------
  const enablePush = async () => {
    setPushState('loading')
    try {
      const sub = await getPushSubscription()
      await apiJson('/api/app/notifications/push-subscribe', { method: 'POST', body: { slug, ...sub } })
      setPushState('on')
      toast('Уведомления о заявках включены')
    } catch (err) {
      setPushState('off')
      toast(err.message, 'error')
    }
  }

  const resetDemo = async () => {
    setResetting(true)
    try { await onDemoReset() } finally { setResetting(false) }
  }

  return (
    <div className="pb-6">
      <TabHeader title="Профиль" />

      {/* Карточка мастера */}
      <div className="mx-5 mt-4 p-[18px] rounded-[26px] bg-ink text-white flex flex-col gap-4 relative overflow-hidden mb-in">
        <span aria-hidden="true" className="absolute -right-6 -bottom-6 w-[90px] h-[90px] rounded-full bg-sun" />
        <div className="flex gap-3.5 items-center relative">
          <span className="w-[52px] h-[52px] shrink-0 rounded-full bg-sun text-ink flex items-center justify-center font-display font-bold text-xl">{(profile?.name || 'М')[0]}</span>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[17px] truncate">{profile?.name}</div>
            <div className="text-[13px] text-onink truncate">{profile?.niche}{profile?.is_demo ? ' · демо' : ''}</div>
          </div>
          <button type="button" aria-label="Изменить имя и нишу" onClick={() => setProfileEditor({ name: profile?.name || '', niche: profile?.niche || '' })} className="w-11 h-11 shrink-0 rounded-full border-[1.5px] border-body flex items-center justify-center hover:border-white">
            <Icon name="edit" size={16} stroke={2} />
          </button>
        </div>
        <div className="flex gap-2 items-center p-1.5 pl-3.5 rounded-full bg-ink2 relative mr-10">
          <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{link.replace(/^https?:\/\//, '')}</span>
          <button type="button" onClick={async () => toast((await copyText(link)) ? 'Ссылка скопирована' : 'Не удалось скопировать')} className="h-9 px-3.5 rounded-full bg-sun text-ink font-extrabold text-xs">Копировать</button>
        </div>
      </div>

      {profile?.is_demo && (
        <div className="mx-5 mt-3 p-4 rounded-[22px] bg-sunsoft flex gap-3 items-center mb-in mb-d1">
          <div className="flex-1 text-[13px]"><b className="font-extrabold">Демо-кабинет.</b> Данные тестовые — нажимайте всё. Кнопка вернёт исходные данные.</div>
          <Button size="sm" loading={resetting} onClick={resetDemo}>Сбросить</Button>
        </div>
      )}

      {/* График */}
      <section className="mx-5 mt-3 p-[18px] rounded-[26px] bg-white mb-in mb-d1">
        <h2 className="m-0 font-extrabold text-[17px]">График работы</h2>
        <p className="m-0 mt-0.5 text-xs text-muted">Клиенты видят только окна в эти часы</p>
        {!schedule ? <div className="py-6 flex justify-center text-muted"><Spinner /></div> : (
          <div className="mt-3.5 flex flex-col gap-1.5">
            {WEEKDAYS.map(([key, label]) => {
              const day = schedule[key]
              return (
                <div key={key} className="flex items-center gap-3 min-h-[44px]">
                  <span className="w-[26px] font-extrabold text-sm">{label}</span>
                  <Switch checked={Boolean(day)} onChange={() => toggleDay(key)} label={`${label}: рабочий день`} />
                  {day ? (
                    <span className="flex-1 flex gap-1.5 items-center justify-end">
                      <input type="time" step="900" value={day[0]} onChange={e => setTime(key, 0, e.target.value)} aria-label={`${label}: начало`} className="w-[96px] px-1.5 py-2 rounded-xl border-0 bg-silverlight font-bold text-sm text-center" />
                      <span className="text-[#8C8984]">—</span>
                      <input type="time" step="900" value={day[1]} onChange={e => setTime(key, 1, e.target.value)} aria-label={`${label}: конец`} className="w-[96px] px-1.5 py-2 rounded-xl border-0 bg-silverlight font-bold text-sm text-center" />
                    </span>
                  ) : <span className="flex-1 text-right text-sm text-muted">Выходной</span>}
                </div>
              )
            })}
            <div className="mt-3 pt-3 border-t border-silver flex justify-between items-center gap-2">
              <label htmlFor="slot-step" className="text-sm font-bold">Начало записи</label>
              <select id="slot-step" value={step} onChange={e => { setStep(Number(e.target.value)); setScheduleDirty(true) }} className="h-10 px-3 rounded-full border border-silver bg-white text-[13px] font-bold">
                {STEPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {scheduleDirty && <Button variant="sun" className="mt-3 w-full mb-fade" loading={savingSchedule} onClick={saveSchedule}>Сохранить график</Button>}
          </div>
        )}
      </section>

      {/* Услуги */}
      <section className="mx-5 mt-3 p-[18px] rounded-[26px] bg-white mb-in mb-d2">
        <div className="flex justify-between items-center">
          <h2 className="m-0 font-extrabold text-[17px]">Услуги</h2>
          <Button size="sm" variant="sun" onClick={() => setServiceEditor({ mode: 'new', name: '', price: '', duration_min: 60 })}><Icon name="plus" size={16} stroke={2.2} /> Добавить</Button>
        </div>
        <div className="mt-2">
          {services === null && <div className="py-6 flex justify-center text-muted"><Spinner /></div>}
          {services && services.map((s, i) => (
            <button key={s.id} type="button" onClick={() => setServiceEditor({ mode: 'edit', ...s, price: String(Math.round(s.price)) })}
              className={`w-full text-left flex items-center gap-2.5 py-3 hover:bg-cream ${i < services.length - 1 ? 'border-b border-[#E4E5E8]' : ''} ${s.is_active ? '' : 'opacity-50'}`}>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-sm truncate">{s.name}</span>
                <span className="block text-xs text-muted">{durationText(s.duration_min)}{s.is_active ? '' : ' · скрыта от клиентов'}</span>
              </span>
              <span className="font-extrabold text-sm whitespace-nowrap">{rub(s.price)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Уведомления */}
      {VAPID_KEY && (
        <section className="mx-5 mt-3 p-[18px] rounded-[26px] bg-white flex gap-3 items-center mb-in mb-d3">
          <span className="w-11 h-11 shrink-0 rounded-full bg-sunsoft flex items-center justify-center"><Icon name="bell" /></span>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[15px]">Уведомления о заявках</div>
            <div className="text-xs text-muted">{pushSupported() ? 'Новая заявка придёт на этот телефон' : 'Этот браузер не поддерживает уведомления'}</div>
          </div>
          {pushSupported() && (pushState === 'on'
            ? <span className="px-3 py-2 rounded-full bg-silverlight text-xs font-extrabold">Включены</span>
            : <Button size="sm" loading={pushState === 'loading'} onClick={enablePush}>Включить</Button>)}
        </section>
      )}

      {/* Вход */}
      <section className="mx-5 mt-3 p-[18px] rounded-[26px] bg-white flex flex-col gap-3 mb-in mb-d4">
        <h2 className="m-0 font-extrabold text-[17px]">Вход</h2>
        {!profile?.is_demo && (
          <div className="flex gap-2 items-end">
            <Field
              label="Новый PIN-код"
              className="flex-1"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={8}
              placeholder="4–8 цифр"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            />
            {pin && <Button className="mb-1.5 mb-fade" loading={savingPin} onClick={savePin}>Сохранить</Button>}
          </div>
        )}
        <button type="button" onClick={onLogout} className="self-start flex items-center gap-2 py-2.5 font-bold text-sm text-danger">
          <Icon name="logout" size={18} /> Выйти из кабинета
        </button>
      </section>

      <ProfileSheet editor={profileEditor} setEditor={setProfileEditor} toast={toast} onSaved={reloadProfile} />
      <ServiceSheet editor={serviceEditor} setEditor={setServiceEditor} toast={toast} onSaved={loadServices} />
    </div>
  )
}

function ProfileSheet({ editor, setEditor, toast, onSaved }) {
  const [saving, setSaving] = useState(false)
  if (!editor) return null
  const save = async () => {
    if (!editor.name.trim() || !editor.niche.trim()) return toast('Заполните имя и нишу', 'error')
    setSaving(true)
    try {
      await apiJson('/api/app/profile', { method: 'PUT', body: { name: editor.name.trim(), niche: editor.niche.trim() } })
      toast('Профиль сохранён')
      setEditor(null)
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet open onClose={() => setEditor(null)} title="Профиль" subtitle="Так вас видят клиенты на странице записи">
      <div className="flex flex-col gap-3">
        <Field label="Имя или название" value={editor.name} onChange={e => setEditor(prev => ({ ...prev, name: e.target.value }))} />
        <Field label="Ниша" value={editor.niche} onChange={e => setEditor(prev => ({ ...prev, niche: e.target.value }))} />
        <Button variant="sun" size="lg" className="w-full mt-1" loading={saving} onClick={save}>Сохранить</Button>
      </div>
    </Sheet>
  )
}

function ServiceSheet({ editor, setEditor, toast, onSaved }) {
  const [saving, setSaving] = useState(false)
  if (!editor) return null
  const update = (patch) => setEditor(prev => ({ ...prev, ...patch }))
  const close = () => setEditor(null)

  const save = async () => {
    const price = Number(String(editor.price).replace(',', '.'))
    if (!editor.name.trim()) return toast('Введите название услуги', 'error')
    if (!price || price <= 0) return toast('Введите цену больше нуля', 'error')
    setSaving(true)
    try {
      const body = { name: editor.name.trim(), price, duration_min: Number(editor.duration_min) }
      if (editor.mode === 'new') await apiJson('/api/app/services', { method: 'POST', body })
      else await apiJson(`/api/app/services/${editor.id}`, { method: 'PUT', body })
      toast(editor.mode === 'new' ? 'Услуга добавлена' : 'Услуга сохранена')
      close()
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async () => {
    setSaving(true)
    try {
      if (editor.is_active) await apiJson(`/api/app/services/${editor.id}`, { method: 'DELETE' })
      else await apiJson(`/api/app/services/${editor.id}`, { method: 'PUT', body: { is_active: true } })
      toast(editor.is_active ? 'Услуга скрыта от клиентов' : 'Услуга снова видна клиентам')
      close()
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={close} title={editor.mode === 'new' ? 'Новая услуга' : 'Услуга'}>
      <div className="flex flex-col gap-3">
        <Field label="Название" value={editor.name} onChange={e => update({ name: e.target.value })} placeholder="Например, маникюр с покрытием" />
        <Field label="Цена, ₽" inputMode="decimal" value={editor.price} onChange={e => update({ price: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="2500" />
        <div>
          <div className="text-xs font-bold text-muted mb-2">Длительность</div>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map(d => (
              <button key={d} type="button" aria-pressed={Number(editor.duration_min) === d} onClick={() => update({ duration_min: d })}
                className={`px-3.5 py-2 rounded-full border text-[13px] font-bold ${Number(editor.duration_min) === d ? 'bg-ink text-white border-ink' : 'bg-white border-silver hover:border-ink'}`}>{durationText(d)}</button>
            ))}
          </div>
        </div>
        <Button variant="sun" size="lg" className="w-full mt-1" loading={saving} onClick={save}>Сохранить</Button>
        {editor.mode === 'edit' && (
          <Button variant="outline" className="w-full" disabled={saving} onClick={toggleActive}>{editor.is_active ? 'Скрыть от клиентов' : 'Показать клиентам'}</Button>
        )}
      </div>
    </Sheet>
  )
}
