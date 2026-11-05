import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, Dot, Button } from '../components/ui'
import { API_BASE, saveSession, slugify } from '../api'
import { NICHES } from '../utils/niches'

// Текст ошибки из ответа FastAPI (строка или список ошибок валидации)
function errorText(data, status) {
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail)) return 'Проверьте поля формы'
  return `Ошибка сервера (${status})`
}

const lineInput = 'pb-2.5 border-0 border-b-[1.5px] border-[#D9D6CF] text-[17px] font-semibold text-ink bg-transparent focus:border-ink focus:shadow-none'

export default function Register() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialName = params.get('name') || ''
  const initialNiche = NICHES.includes(params.get('niche')) ? params.get('niche') : NICHES[0]

  const [name, setName] = useState(initialName)
  const [niche, setNiche] = useState(initialNiche)
  const [slug, setSlug] = useState(slugify(initialName))
  const [slugTouched, setSlugTouched] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleName = (value) => {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2) return setError('Введите имя или название')
    if (slug.length < 3) return setError('Адрес страницы — минимум 3 символа')
    if (!/^\d{4,8}$/.test(pin)) return setError('PIN — от 4 до 8 цифр')
    if (pin !== pin2) return setError('PIN-коды не совпадают')

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), niche, slug, pin })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorText(data, res.status))
      saveSession({ token: data.token, slug: data.slug, name: data.name })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message || 'Не удалось создать страницу')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white sm:bg-cream sm:py-10">
      <div className="max-w-[440px] mx-auto bg-white min-h-screen sm:min-h-0 sm:rounded-[36px] sm:overflow-hidden sm:shadow-[0_20px_60px_rgba(18,18,18,0.08)] flex flex-col">
        <div className="relative bg-ink text-white px-6 pt-[22px] pb-8 rounded-b-[44px]">
          <Dot className="right-[30px] top-[70px] w-10 h-10" color="#FFC531" />
          <Dot className="right-20 top-[116px] w-3.5 h-3.5 mb-d3" color="#F2795A" />
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-onink no-underline hover:text-white">
            <Icon name="back" size={16} stroke={2} /> На главную
          </Link>
          <h1 className="mt-[26px] mb-2 font-display font-bold text-[26px] leading-[1.12] tracking-[-0.03em] max-w-[260px] mb-in">Страница записи за минуту</h1>
          <p className="m-0 text-sm leading-relaxed text-onink max-w-[280px] mb-in mb-d1">Добавим типовые услуги вашей ниши — цены поменяете потом.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pt-6 pb-7 flex flex-col gap-5 flex-1 mb-in mb-d2" noValidate>
          <label className="flex flex-col gap-2 text-xs font-bold text-muted">Имя или название
            <input className={lineInput} value={name} onChange={e => handleName(e.target.value)} placeholder="Например, Ольга Брови" autoComplete="name" />
          </label>

          <fieldset className="border-0 m-0 p-0 flex flex-col gap-2.5">
            <legend className="p-0 mb-2.5 text-xs font-bold text-muted">Чем занимаетесь</legend>
            <div className="flex flex-wrap gap-2">
              {NICHES.map(n => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={niche === n}
                  onClick={() => setNiche(n)}
                  className={`px-3.5 py-2.5 rounded-full border-[1.5px] text-sm font-bold ${niche === n ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#E2E0DA] hover:border-ink'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2 text-xs font-bold text-muted">Адрес страницы для клиентов
            <span className="flex items-baseline border-b-[1.5px] border-[#D9D6CF] pb-2.5 focus-within:border-ink transition-colors">
              <span className="text-[17px] font-semibold text-[#8C8984]">/c/</span>
              <input
                className="flex-1 min-w-0 border-0 p-0 text-[17px] font-semibold text-ink bg-transparent focus:shadow-none"
                value={slug}
                onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                placeholder="olga-brovi"
                autoCapitalize="none"
                spellCheck={false}
              />
            </span>
            <span className="font-medium text-[11px] text-muted">Латиница, цифры и дефис. Эту ссылку вы отправите клиентам.</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs font-bold text-muted">PIN для входа
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} placeholder="4–8 цифр"
                className={`${lineInput} tracking-[0.3em] placeholder:tracking-normal placeholder:font-medium`} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="flex flex-col gap-2 text-xs font-bold text-muted">Повторите PIN
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8}
                className={`${lineInput} tracking-[0.3em]`} value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>

          {error && (
            <div role="alert" className="px-4 py-3 rounded-2xl bg-[#FCEDEC] text-sm font-bold text-danger mb-fade">{error}</div>
          )}

          <div className="mt-auto pt-4 flex flex-col gap-3.5">
            <Button type="submit" variant="sun" size="lg" loading={loading} className="w-full">Создать страницу</Button>
            <div className="text-center text-sm text-body">Уже есть страница? <Link to="/app" className="font-extrabold text-ink">Войти</Link></div>
          </div>
        </form>
      </div>
    </div>
  )
}
