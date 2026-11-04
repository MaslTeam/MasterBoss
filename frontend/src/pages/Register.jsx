import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, ArrowLeft, RefreshCw } from 'lucide-react'
import { API_BASE, saveSession, slugify } from '../api'

const NICHES = ['Маникюр', 'Брови и ресницы', 'Массаж', 'Репетитор', 'Автосервис', 'Другое']

const inputClass =
  'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500'

// Текст ошибки из ответа FastAPI (строка или список ошибок валидации)
function errorText(data, status) {
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return 'Проверьте поля формы'
  return `Ошибка сервера (${status})`
}

export default function Register() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [niche, setNiche] = useState(NICHES[0])
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleName = (value) => {
    setName(value)
    // Пока мастер не правил адрес вручную — подставляем его из имени
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> На главную
        </Link>

        <div className="bg-white rounded-3xl p-6 shadow-card border border-slate-100">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-black text-slate-900">Страница записи за минуту</h1>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Добавим типовые услуги вашей ниши — цены и длительность поменяете в настройках.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <label htmlFor="reg-name" className="block text-xs font-bold text-slate-600 mb-1">Имя или название</label>
              <input
                id="reg-name"
                className={inputClass}
                placeholder="Например, Анна Nails"
                value={name}
                onChange={e => handleName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="reg-niche" className="block text-xs font-bold text-slate-600 mb-1">Чем занимаетесь</label>
              <select id="reg-niche" className={inputClass} value={niche} onChange={e => setNiche(e.target.value)}>
                {NICHES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="reg-slug" className="block text-xs font-bold text-slate-600 mb-1">Адрес страницы для клиентов</label>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-purple-500">
                <span className="pl-3.5 text-sm text-slate-400 select-none">/c/</span>
                <input
                  id="reg-slug"
                  className="flex-1 min-w-0 pr-3.5 py-2.5 bg-transparent text-sm text-slate-900 focus:outline-none"
                  placeholder="anna-nails"
                  value={slug}
                  onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Латиница, цифры и дефис. Эту ссылку вы отправите клиентам.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="reg-pin" className="block text-xs font-bold text-slate-600 mb-1">PIN для входа</label>
                <input
                  id="reg-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  className={`${inputClass} font-mono`}
                  placeholder="4–8 цифр"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div>
                <label htmlFor="reg-pin2" className="block text-xs font-bold text-slate-600 mb-1">Повторите PIN</label>
                <input
                  id="reg-pin2"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  className={`${inputClass} font-mono`}
                  value={pin2}
                  onChange={e => setPin2(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Создать страницу'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-4">
            Уже есть страница? <Link to="/app" className="font-bold text-purple-700 hover:underline">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
