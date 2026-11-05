import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE, getSession, saveSession } from '../../api'
import { Logo, Field, Button, Blob, Dot } from '../ui'

// Экран входа мастера: адрес страницы + PIN
export default function LoginScreen({ onLoggedIn }) {
  const [slug, setSlug] = useState(() => getSession().slug || '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!slug.trim() || !pin.trim()) {
      setError('Введите адрес страницы и PIN-код')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/app/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim().toLowerCase(), pin: pin.trim() })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось войти')
      saveSession({ token: data.token, slug: data.slug, name: data.name })
      setPin('')
      onLoggedIn()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white sm:bg-cream sm:py-10">
      <div className="relative max-w-[440px] mx-auto min-h-screen sm:min-h-[760px] bg-white sm:rounded-[36px] sm:shadow-[0_20px_60px_rgba(18,18,18,0.08)] overflow-hidden flex flex-col">
        <Blob className="left-[-90px] bottom-[-190px] w-[360px] h-[360px]" />
        <Dot className="left-[236px] bottom-[96px] w-[30px] h-[30px]" color="#FFC531" />
        <Dot className="left-[290px] bottom-[60px] w-3.5 h-3.5 mb-d3" color="#7A1F2B" />

        <div className="relative px-6 pt-[26px]"><Logo small /></div>

        <div className="relative px-6 pt-14 flex flex-col gap-2.5 mb-in">
          <h1 className="m-0 font-display font-bold text-[30px] tracking-[-0.03em]">Вход в кабинет</h1>
          <p className="m-0 text-[15px] text-body">Адрес вашей страницы и PIN-код</p>
        </div>

        <form onSubmit={submit} className="relative px-6 pt-8 pb-60 flex flex-col gap-3.5 mb-in mb-d1" noValidate>
          <Field
            label="Адрес страницы"
            prefix="/c/"
            id="login-slug"
            value={slug}
            onChange={e => { setSlug(e.target.value); setError('') }}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="anna"
          />
          <Field
            label="PIN-код"
            id="login-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={8}
            placeholder="4–8 цифр"
            inputClassName="text-xl tracking-[0.35em] placeholder:tracking-normal placeholder:text-base"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
          />
          {error && <div role="alert" className="px-4 py-3 rounded-2xl bg-[#FCEDEC] text-sm font-bold text-danger mb-fade">{error}</div>}
          <Button type="submit" size="lg" loading={loading} className="mt-1.5 w-full">Войти</Button>
          <Link to="/demo" className="mb-lift block py-4 rounded-full border border-silver text-center font-bold text-[15px] text-ink no-underline hover:border-ink">
            Открыть демо без PIN
          </Link>
          <div className="pt-2 text-center text-sm text-body">Нет страницы? <Link to="/register" className="font-extrabold text-ink">Создать бесплатно</Link></div>
        </form>
      </div>
    </div>
  )
}
