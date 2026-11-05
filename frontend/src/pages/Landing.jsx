import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, Logo, Blob, Dot } from '../components/ui'
import { API_BASE, getSession } from '../api'
import { STARTER, CARD_TONES, NICHES } from '../utils/niches'
import { rub, num } from '../utils/format'

// Отзыв пилотного мастера: впишите, когда появится настоящий. Пока null — блок не показывается.
const PILOT_QUOTE = null // { text: '…', author: 'Имя', role: 'Маникюр, Москва' }
// Контакт команды для блока «Остались вопросы?». Пусто — блок ведёт в демо.
const TEAM_CONTACT = '' // например 'https://t.me/masterboss_team'

function SectionRule({ num: n, label }) {
  return (
    <div className="flex items-center gap-3.5 mb-7 text-xs font-bold tracking-[0.14em] uppercase text-graphite">
      <span className="text-ink">{n}</span>
      <span>{label}</span>
      <span className="flex-1 h-px bg-silver" />
    </div>
  )
}

function Check({ children }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="w-[26px] h-[26px] shrink-0 rounded-full bg-sun flex items-center justify-center">
        <Icon name="check" size={14} stroke={3} />
      </span>
      <span className="text-base leading-relaxed">{children}</span>
    </div>
  )
}

const STEPS = [
  ['Создайте страницу', 'Имя, ниша и PIN. Услуги с ценами подставятся сами.'],
  ['Отправьте ссылку', 'В профиль Instagram, Telegram, MAX — или в ответ клиенту.'],
  ['Клиент записывается сам', 'Видит только свободные окна с учётом длительности услуги.'],
  ['Вы подтверждаете', 'Одно нажатие. Напоминание за час уйдёт клиенту само.'],
]

const PLANS = [
  { name: 'Старт', price: '0 ₽', items: ['Страница записи', 'До 30 записей в месяц', 'Касса и напоминания'], cta: 'Начать бесплатно' },
  { name: 'Мастер', price: '790 ₽', items: ['Без лимита записей', 'ИИ-помощник GigaChat', 'Аудит бизнеса за месяц'], cta: 'Попробовать', featured: true },
  { name: 'Студия', price: '1 490 ₽', items: ['До 3 мастеров', 'Общая касса', 'Приоритетная поддержка'], cta: 'Подключить' },
]

export default function Landing() {
  const navigate = useNavigate()
  const loggedIn = Boolean(getSession().token)
  const [niche, setNiche] = useState(0)
  const [pilot, setPilot] = useState(null)
  const [quickName, setQuickName] = useState('')
  const [quickNiche, setQuickNiche] = useState(NICHES[0])

  useEffect(() => {
    fetch(`${API_BASE}/api/public/pilot-stats`)
      .then(r => (r.ok ? r.json() : null))
      .then(setPilot)
      .catch(() => {})
  }, [])

  const goRegister = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (quickName.trim()) params.set('name', quickName.trim())
    params.set('niche', quickNiche)
    navigate(`/register?${params.toString()}`)
  }

  const current = STARTER[niche]

  return (
    <div className="bg-white text-ink overflow-hidden">
      {/* ШАПКА */}
      <header className="max-w-[1200px] mx-auto px-4 sm:px-8 py-5 sm:py-6 border-b border-silverline flex items-center justify-between gap-4 flex-wrap">
        <Logo />
        <nav className="hidden md:flex gap-7 text-[15px] font-semibold">
          <a href="#how" className="text-body hover:text-ink no-underline">Как это работает</a>
          <a href="#niches" className="text-body hover:text-ink no-underline">Для кого</a>
          <a href="#pricing" className="text-body hover:text-ink no-underline">Тарифы</a>
        </nav>
        <div className="flex gap-2.5 items-center">
          <Link to="/app" className="mb-lift px-[18px] py-[11px] rounded-full font-bold text-sm text-ink no-underline border border-silver hover:border-ink">
            {loggedIn ? 'Кабинет' : 'Войти'}
          </Link>
          <Link to="/register" className="mb-lift hidden sm:inline-flex px-5 py-3 rounded-full font-bold text-sm text-white bg-ink no-underline hover:bg-black">
            Создать страницу
          </Link>
        </div>
      </header>

      {/* ПЕРВЫЙ ЭКРАН */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-8 flex flex-wrap items-center gap-10">
        <div className="flex-[1_1_440px] min-w-0 flex flex-col gap-6 relative z-[2] mb-in">
          <span className="self-start px-3.5 py-[7px] rounded-full bg-sunsoft text-[13px] font-bold text-sundeep">Для частных мастеров</span>
          <h1 className="m-0 font-display font-bold text-[38px] sm:text-[52px] lg:text-[62px] leading-[1.04] tracking-[-0.035em]">
            Отвечает клиентам, пока вы <span className="bg-sun px-2.5 rounded-[14px] whitespace-nowrap">работаете</span>
          </h1>
          <p className="m-0 text-lg leading-relaxed text-body max-w-[470px]">
            Ссылка для записи, напоминания клиентам и касса без таблиц. Клиент сам выбирает свободное окно — вы только подтверждаете.
          </p>
          <div className="flex gap-3.5 items-center flex-wrap">
            <Link to="/register" className="mb-lift inline-flex gap-2.5 items-center px-7 py-[18px] rounded-full bg-sun text-ink font-extrabold text-base no-underline hover:bg-[#F5B800]">
              Создать страницу бесплатно <Icon name="arrow" size={18} stroke={2.2} />
            </Link>
            <Link to="/demo" className="px-2 py-[18px] font-bold text-base text-ink underline underline-offset-[5px] decoration-2 hover:decoration-sun">
              Открыть демо-кабинет
            </Link>
          </div>
          <p className="m-0 text-[13px] text-muted">Без карты и договора. Страница готова за минуту.</p>
        </div>

        <div className="flex-[1_1_520px] min-w-0 relative h-[540px] sm:h-[620px] mb-in mb-d2">
          <Blob className="right-[-200px] sm:right-[-140px] top-[-40px] w-[560px] h-[560px] sm:w-[640px] sm:h-[640px]" />
          <Dot className="left-[30px] top-[60px] w-[34px] h-[34px]" color="#7A1F2B" />
          <Dot className="left-[70px] top-[112px] w-[18px] h-[18px] mb-d2" color="#F2795A" />
          <Dot className="left-[4px] bottom-[120px] w-[26px] h-[26px] mb-d3" color="#C4C7CC" />
          <Dot className="right-[10px] bottom-[30px] w-[44px] h-[44px] mb-d4" color="#FFC531" />
          <PhoneBooking />
        </div>
      </section>

      {/* ТРИ КАРТОЧКИ */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-6 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 relative z-[3]">
        {[
          ['calendar', 'Запись 24/7', 'Только свободные окна по вашему графику'],
          ['bell', 'Напомнит сама', 'За час до визита и когда пора вернуться'],
          ['wallet', 'Касса без таблиц', 'Доход после визита попадает сам'],
        ].map(([icon, title, text], i) => (
          <div key={title} className={`mb-in mb-d${i + 2} bg-white border border-silverline rounded-[22px] p-5 shadow-[0_12px_40px_rgba(18,18,18,0.06)] flex gap-3.5 items-center`}>
            <span className="w-11 h-11 shrink-0 rounded-full bg-sunsoft flex items-center justify-center"><Icon name={icon} /></span>
            <div><div className="font-extrabold text-[15px]">{title}</div><div className="text-[13px] text-muted">{text}</div></div>
          </div>
        ))}
      </section>

      {/* 01 КАК ЭТО РАБОТАЕТ */}
      <section id="how" className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-24 sm:pt-32">
        <SectionRule num="01" label="Процесс" />
        <div className="flex justify-between items-end gap-6 flex-wrap mb-9">
          <h2 className="m-0 font-display font-bold text-[28px] sm:text-[42px] tracking-[-0.03em] leading-[1.1]">Как это работает</h2>
          <p className="m-0 max-w-[360px] text-muted text-[15px] leading-relaxed">Четыре шага от регистрации до первой записи. Переписка «а когда можно?» больше не нужна.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
          {STEPS.map(([title, text], i) => (
            i === 2 ? (
              <div key={title} className="mb-card bg-ink text-white rounded-none p-[26px] flex flex-col gap-3.5 min-h-[210px] shadow-[8px_8px_0_#C4C7CC]">
                <span className="font-display font-bold text-[15px] text-sun">0{i + 1}</span>
                <div className="font-extrabold text-[19px]">{title}</div>
                <div className="text-sm leading-relaxed text-onink">{text}</div>
              </div>
            ) : (
              <div key={title} className="mb-card border border-silver rounded-[26px] p-[26px] flex flex-col gap-3.5 min-h-[210px]">
                <span className="font-display font-bold text-[15px] text-graphite">0{i + 1}</span>
                <div className="font-extrabold text-[19px]">{title}</div>
                <div className="text-sm leading-relaxed text-muted">{text}</div>
              </div>
            )
          ))}
        </div>
      </section>

      {/* 02 НИШИ */}
      <section id="niches" className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-24 sm:pt-32">
        <SectionRule num="02" label="Ниши" />
        <div className="flex justify-between items-end gap-6 flex-wrap mb-7">
          <h2 className="m-0 font-display font-bold text-[28px] sm:text-[42px] tracking-[-0.03em] leading-[1.1] max-w-[620px]">Прайс готов с первой минуты</h2>
          <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Ниша">
            {STARTER.map((n, i) => (
              <button
                key={n.name}
                type="button"
                role="tab"
                aria-selected={i === niche}
                onClick={() => setNiche(i)}
                className={`px-[18px] py-[11px] rounded-full font-bold text-sm border ${i === niche ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-silver hover:border-ink'}`}
              >
                {n.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {current.items.map(([name, duration, price], i) => {
            const tone = CARD_TONES[i]
            const accent = i === 0 ? '#FFC531' : i === 1 ? '#121212' : current.colors[i]
            return (
              <div
                key={`${current.name}-${name}`}
                className={`mb-card mb-in mb-d${i + 1} rounded-[28px] p-[22px] min-h-[240px] flex flex-col gap-4 border`}
                style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}
              >
                <div className="flex justify-between items-center">
                  <span className="w-[34px] h-1.5 rounded-full" style={{ background: accent }} />
                  <span className="px-3 py-[7px] rounded-full text-xs font-extrabold" style={{ background: tone.chip }}>{duration} мин</span>
                </div>
                <div className="mt-auto font-extrabold text-[19px] leading-tight tracking-[-0.01em]">{name}</div>
                <div className="flex justify-between items-center pt-3.5 border-t" style={{ borderColor: tone.line }}>
                  <span className="font-display font-bold text-[22px] tracking-[-0.02em]">{rub(price)}</span>
                  <span className="mb-arrow w-10 h-10 rounded-full flex items-center justify-center" style={{ background: tone.btnBg, color: tone.btnFg }}>
                    <Icon name="arrow" size={18} stroke={2.2} />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-[18px] mb-0 text-sm text-muted">Это стартовый прайс для ниши. Названия, цены и длительность меняются в настройках.</p>
      </section>

      {/* 03 КАБИНЕТ */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-24 sm:pt-32 flex flex-wrap-reverse items-center gap-12">
        <div className="flex-[1_1_460px] min-w-0 relative h-[560px]">
          <Blob className="left-[-180px] top-0 w-[620px] h-[560px]" />
          <Dot className="right-[60px] top-[40px] w-[30px] h-[30px]" color="#FFC531" />
          <Dot className="right-[30px] top-[90px] w-4 h-4 mb-d3" color="#7A1F2B" />
          <PhoneCabinet />
        </div>
        <div className="flex-[1_1_420px] min-w-0 flex flex-col gap-[22px]">
          <div className="flex items-center gap-3.5 text-xs font-bold tracking-[0.14em] uppercase text-graphite">
            <span className="text-ink">03</span><span>Кабинет</span><span className="flex-1 h-px bg-silver" />
          </div>
          <h2 className="m-0 font-display font-bold text-[28px] sm:text-[42px] tracking-[-0.03em] leading-[1.1]">Записи и деньги — в одном телефоне</h2>
          <div className="flex flex-col gap-3.5">
            <Check>Новая заявка — подтвердить одним нажатием</Check>
            <Check>«Пришла» — доход сам попадает в кассу</Check>
            <Check>Расход фразой: «взяла базы и топы на 3200»</Check>
            <Check>Клиентке пора на коррекцию — напоминание в Telegram или MAX</Check>
          </div>
          <Link to="/demo" className="mb-lift self-start px-[26px] py-4 rounded-full bg-ink text-white font-extrabold text-[15px] no-underline hover:bg-black">Открыть демо-кабинет</Link>
        </div>
      </section>

      {/* ПИЛОТ */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-24 sm:pt-32 flex flex-wrap gap-6 items-stretch">
        {PILOT_QUOTE ? (
          <div className="flex-[2_1_520px] min-w-0 border border-silver rounded-[30px] p-8 sm:p-10 flex flex-col gap-[22px]">
            <svg width="44" height="34" viewBox="0 0 44 34" aria-hidden="true"><path d="M0 34V20C0 8 6 1 17 0l2 5c-6 2-9 6-9 11h8v18zm25 0V20c0-12 6-19 17-20l2 5c-6 2-9 6-9 11h8v18z" fill="#FFC531" /></svg>
            <p className="m-0 text-xl sm:text-[26px] leading-snug font-semibold tracking-[-0.01em]">{PILOT_QUOTE.text}</p>
            <div><div className="font-extrabold">{PILOT_QUOTE.author}</div><div className="text-[13px] text-muted">{PILOT_QUOTE.role}</div></div>
          </div>
        ) : (
          <div className="flex-[2_1_520px] min-w-0 border border-silver rounded-[30px] p-8 sm:p-10 flex flex-col justify-between gap-6">
            <p className="m-0 text-xl sm:text-[26px] leading-snug font-semibold tracking-[-0.01em]">Посмотрите, как это выглядит для клиента: выберите услугу и время — заявка придёт в демо-кабинет.</p>
            <Link to="/c/demo" className="mb-lift self-start inline-flex items-center gap-2 px-6 py-4 rounded-full border border-ink text-ink font-extrabold no-underline hover:bg-ink hover:text-white">
              Записаться как клиент <Icon name="arrow" size={18} stroke={2.2} />
            </Link>
          </div>
        )}
        <div className="flex-[1_1_300px] min-w-0 bg-sun rounded-none p-8 sm:p-10 flex flex-col justify-between gap-6">
          <div className="text-sm font-extrabold uppercase tracking-[0.06em]">Пилот</div>
          {pilot && pilot.bookings_via_link > 0 ? (
            <div>
              <div className="font-display font-bold text-[54px] leading-none">{num(pilot.bookings_via_link)}</div>
              <div className="text-base font-semibold mt-1.5">записей через ссылки мастеров</div>
            </div>
          ) : (
            <div>
              <div className="font-display font-bold text-[34px] leading-tight">Идёт сейчас</div>
              <div className="text-base font-semibold mt-1.5">Первые мастера принимают записи</div>
            </div>
          )}
          <div className="text-[13px] text-[#4A3A00]">
            {pilot && pilot.masters ? `Мастеров на сервисе: ${num(pilot.masters)}` : 'Цифры обновляются автоматически'}
          </div>
        </div>
      </section>

      {/* 04 ТАРИФЫ */}
      <section id="pricing" className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-24 sm:pt-32">
        <SectionRule num="04" label="Тарифы" />
        <h2 className="m-0 mb-8 font-display font-bold text-[28px] sm:text-[42px] tracking-[-0.03em]">Тарифы</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 items-stretch">
          {PLANS.map(plan => (
            <div key={plan.name} className={`mb-card rounded-[30px] p-8 flex flex-col gap-5 relative ${plan.featured ? 'bg-ink text-white' : 'border border-silver'}`}>
              {plan.featured && <span className="absolute top-7 right-7 px-3 py-1.5 rounded-full bg-sun text-ink text-xs font-extrabold">Популярный</span>}
              <div className="font-extrabold text-lg">{plan.name}</div>
              <div>
                <span className={`font-display font-bold text-[44px] ${plan.featured ? 'text-sun' : ''}`}>{plan.price}</span>
                <span className={plan.featured ? 'text-onink' : 'text-muted'}> / мес</span>
              </div>
              <div className="flex flex-col gap-2.5 text-[15px]">{plan.items.map(item => <span key={item}>{item}</span>)}</div>
              <Link
                to="/register"
                className={`mb-lift mt-auto py-[15px] text-center rounded-full font-extrabold no-underline ${plan.featured ? 'bg-sun text-ink hover:bg-[#F5B800]' : 'border border-ink text-ink hover:bg-ink hover:text-white'}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* БЫСТРАЯ РЕГИСТРАЦИЯ */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-24 sm:pt-32 flex flex-wrap gap-12 items-center">
        <form onSubmit={goRegister} className="flex-[1_1_420px] min-w-0 flex flex-col gap-[18px]">
          <h2 className="m-0 mb-1.5 font-display font-bold text-[26px] sm:text-4xl tracking-[-0.03em] leading-[1.15]">Ваша страница записи через минуту</h2>
          <label className="flex flex-col gap-2 text-[13px] font-bold">Имя или название
            <input
              value={quickName}
              onChange={e => setQuickName(e.target.value)}
              placeholder="Например, Мария Nails"
              className="pb-3 border-0 border-b-[1.5px] border-[#D9D6CF] text-[17px] font-medium bg-transparent focus:border-ink focus:shadow-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-bold">Чем занимаетесь
            <select
              value={quickNiche}
              onChange={e => setQuickNiche(e.target.value)}
              className="pb-3 border-0 border-b-[1.5px] border-[#D9D6CF] text-[17px] font-medium bg-transparent focus:border-ink focus:shadow-none"
            >
              {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="submit" className="self-start mt-2 px-7 py-[17px] rounded-full bg-sun text-ink font-extrabold text-base hover:bg-[#F5B800]">Продолжить</button>
        </form>
        <div className="flex-[1_1_380px] min-w-0 relative min-h-[360px] flex items-center">
          <Blob className="inset-0 right-[-120px]" />
          <Dot className="left-5 top-2.5 w-7 h-7" color="#FFC531" />
          <div className="relative text-white px-10 sm:px-14 py-12 flex flex-col gap-3.5">
            <div className="font-display font-bold text-[26px]">Остались вопросы?</div>
            {TEAM_CONTACT ? (
              <>
                <div className="text-[15px] text-onink leading-relaxed">Напишите команде — поможем настроить страницу под вашу нишу.</div>
                <a href={TEAM_CONTACT} target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold text-sun">Написать в Telegram</a>
              </>
            ) : (
              <>
                <div className="text-[15px] text-onink leading-relaxed">Самый быстрый ответ — открыть демо-кабинет и всё понажимать.</div>
                <Link to="/demo" className="self-start text-[15px] font-bold text-sun underline underline-offset-4">Открыть демо</Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ПОДВАЛ */}
      <footer className="max-w-[1200px] mx-auto mt-24 px-4 sm:px-8 pt-10 pb-12 flex flex-wrap justify-between gap-8 border-t border-silver">
        <div className="flex flex-col gap-3 max-w-[280px]">
          <Logo small />
          <span className="text-[13px] text-muted">Онлайн-запись и касса для частных мастеров</span>
        </div>
        <div className="flex gap-14 flex-wrap text-sm">
          <div className="flex flex-col gap-2.5"><span className="font-extrabold">Продукт</span><a href="#how" className="text-body no-underline hover:text-ink">Как это работает</a><a href="#pricing" className="text-body no-underline hover:text-ink">Тарифы</a><Link to="/demo" className="text-body no-underline hover:text-ink">Демо-кабинет</Link></div>
          <div className="flex flex-col gap-2.5"><span className="font-extrabold">Мастеру</span><Link to="/register" className="text-body no-underline hover:text-ink">Создать страницу</Link><Link to="/app" className="text-body no-underline hover:text-ink">Войти</Link></div>
          <div className="flex flex-col gap-2.5"><span className="font-extrabold">Клиенту</span><Link to="/c/demo" className="text-body no-underline hover:text-ink">Пример записи</Link></div>
        </div>
      </footer>
    </div>
  )
}

// Телефон на первом экране: страница записи
function PhoneBooking() {
  return (
    <div className="absolute left-1/2 top-5 -translate-x-[46%] w-[290px] h-[580px] rounded-[40px] bg-white border-[9px] border-[#2A2A2A] shadow-[0_30px_60px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col" aria-hidden="true">
      <div className="px-[18px] pt-[22px] pb-3.5 flex gap-3 items-center border-b border-[#EFEDE8]">
        <span className="w-[42px] h-[42px] rounded-full bg-sun flex items-center justify-center font-display font-bold">М</span>
        <div><div className="font-extrabold text-[15px]">Мария Nails</div><div className="text-xs text-muted">Маникюр · пн–сб 10–20</div></div>
      </div>
      <div className="px-[18px] pt-4 pb-2 text-xs font-extrabold text-muted uppercase tracking-[0.06em]">Шаг 1 из 3 · Услуга</div>
      <div className="px-3.5 flex flex-col gap-2">
        {[['Маникюр с покрытием', '90 мин', '2 500 ₽', true], ['Снятие + укрепление', '120 мин', '2 800 ₽'], ['Педикюр с покрытием', '90 мин', '3 200 ₽']].map(([n, d, p, on]) => (
          <div key={n} className={`p-3.5 rounded-[18px] flex justify-between items-center ${on ? 'bg-sun' : 'bg-mist'}`}>
            <div><div className={`${on ? 'font-extrabold' : 'font-bold'} text-sm`}>{n}</div><div className={`text-xs ${on ? 'text-[#4A3A00]' : 'text-muted'}`}>{d}</div></div>
            <span className="font-extrabold text-sm">{p}</span>
          </div>
        ))}
      </div>
      <div className="px-[18px] pt-[18px] pb-2 text-xs font-extrabold text-muted uppercase tracking-[0.06em]">Завтра</div>
      <div className="px-3.5 grid grid-cols-3 gap-1.5">
        {['10:00', '12:00', '15:00'].map((t, i) => (
          <span key={t} className={`py-2.5 text-center rounded-xl font-bold text-[13px] ${i === 1 ? 'bg-ink text-white' : 'border-[1.5px] border-[#E6E4DE]'}`}>{t}</span>
        ))}
      </div>
      <div className="mt-auto p-3.5"><div className="py-[15px] rounded-full bg-ink text-white text-center font-extrabold text-sm">Записаться на 12:00</div></div>
    </div>
  )
}

// Телефон в блоке «Кабинет»
function PhoneCabinet() {
  return (
    <div className="absolute left-1/2 top-2.5 -translate-x-[60%] w-[280px] h-[540px] rounded-[40px] bg-white border-[9px] border-[#2A2A2A] shadow-[0_30px_60px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col" aria-hidden="true">
      <div className="px-4 pt-5 pb-2.5 flex justify-between items-center">
        <div className="font-display font-bold text-[17px]">Записи</div>
        <span className="px-2.5 py-[5px] rounded-full bg-sun text-[11px] font-extrabold">2 новые</span>
      </div>
      <div className="mx-3 p-3.5 rounded-[20px] bg-ink text-white flex flex-col gap-2.5">
        <div className="text-[11px] text-onink font-bold">Новая заявка · из Instagram</div>
        <div className="font-extrabold text-[15px]">Дарья К. · Маникюр с покрытием</div>
        <div className="text-xs text-onink">Завтра, 15:00 · 2 500 ₽</div>
        <div className="flex gap-1.5">
          <span className="flex-1 py-2.5 text-center rounded-full bg-sun text-ink font-extrabold text-xs">Подтвердить</span>
          <span className="px-3.5 py-2.5 text-center rounded-full border-[1.5px] border-body font-bold text-xs">Отказать</span>
        </div>
      </div>
      <div className="mx-3 mt-2.5 p-3.5 rounded-[20px] bg-mist flex justify-between items-center">
        <div><div className="font-extrabold text-sm">Ирина С.</div><div className="text-xs text-muted">Сегодня, 12:00 · визит прошёл</div></div>
        <span className="px-2.5 py-[7px] rounded-full bg-white text-[11px] font-extrabold">Пришла</span>
      </div>
      <div className="mx-3 mt-2.5 p-3.5 rounded-[20px] border border-silverline">
        <div className="text-[11px] text-muted font-bold">Касса за месяц</div>
        <div className="font-display font-bold text-[22px] mt-1">+ 24 300 ₽</div>
      </div>
    </div>
  )
}
