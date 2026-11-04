import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE, saveSession } from '../api'

// /demo — вход в демо-кабинет без PIN. Удобно для QR-кода на слайде защиты.
export default function DemoLogin() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/demo/login`, { method: 'POST' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.detail || `Ошибка сервера (${res.status})`)
        if (cancelled) return
        saveSession({ token: data.token, slug: data.slug, name: data.name })
        navigate('/app', { replace: true })
      } catch (err) {
        if (!cancelled) setError(err.message || 'Не удалось открыть демо')
      }
    })()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-base font-extrabold text-danger">{error}</p>
            <p className="text-sm text-muted mt-1">Сервер мог «уснуть» — подождите 30–60 секунд и обновите страницу.</p>
            <Link to="/" className="inline-block mt-4 text-sm font-bold text-ink">← На главную</Link>
          </>
        ) : (
          <>
            <div className="w-10 h-10 mx-auto rounded-full border-[3px] border-sunsoft border-t-sun mb-spin" />
            <p className="font-display font-semibold text-base mt-4">Открываем демо-кабинет…</p>
            <p className="text-sm text-muted mt-1">Первый запуск сервера может занять до минуты</p>
          </>
        )}
      </div>
    </div>
  )
}
