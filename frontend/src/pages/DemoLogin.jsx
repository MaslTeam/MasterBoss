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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-sm font-bold text-rose-700">{error}</p>
            <p className="text-xs text-slate-500 mt-1">Сервер мог «уснуть» — подождите 30–60 секунд и обновите страницу.</p>
            <Link to="/" className="inline-block mt-4 text-xs font-bold text-purple-700">← На главную</Link>
          </>
        ) : (
          <>
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-purple-200 border-t-purple-600 animate-spin" />
            <p className="text-sm text-slate-600 mt-3">Открываем демо-кабинет…</p>
          </>
        )}
      </div>
    </div>
  )
}
