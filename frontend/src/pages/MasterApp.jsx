import React, { useCallback, useEffect, useState } from 'react'
import { getSession, clearSession, apiJson } from '../api'
import { useToast } from '../components/ui'
import LoginScreen from '../components/cabinet/LoginScreen'
import BookingsTab from '../components/cabinet/BookingsTab'
import FinanceTab from '../components/cabinet/FinanceTab'
import ClientsTab from '../components/cabinet/ClientsTab'
import ProfileTab from '../components/cabinet/ProfileTab'
import { BottomNav } from '../components/cabinet/shared'

const TAB_KEY = 'mb_tab'

function readTab() {
  try { return localStorage.getItem(TAB_KEY) || 'bookings' } catch { return 'bookings' }
}

// Кабинет мастера: вход → четыре вкладки с нижней панелью
export default function MasterApp() {
  const [session, setSession] = useState(() => getSession())

  useEffect(() => {
    const onLogout = () => setSession(getSession())
    window.addEventListener('mb-logout', onLogout)
    return () => window.removeEventListener('mb-logout', onLogout)
  }, [])

  if (!session.token) {
    return <LoginScreen onLoggedIn={() => setSession(getSession())} />
  }
  return <Cabinet key={session.token} slug={session.slug} onLogout={() => { clearSession(); setSession(getSession()) }} />
}

function Cabinet({ slug, onLogout }) {
  const [toastNode, toast] = useToast()
  const [tab, setTabState] = useState(readTab)
  const [profile, setProfile] = useState(null)
  const [badges, setBadges] = useState({})
  const [reloadKey, setReloadKey] = useState(0)

  const setTab = (value) => {
    setTabState(value)
    try { localStorage.setItem(TAB_KEY, value) } catch { /* приватный режим */ }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await apiJson('/api/app/profile'))
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [toast])

  useEffect(() => { loadProfile() }, [loadProfile])

  const setBookingCount = useCallback((n) => setBadges(prev => (prev.bookings === n ? prev : { ...prev, bookings: n })), [])
  const setClientCount = useCallback((n) => setBadges(prev => (prev.clients === n ? prev : { ...prev, clients: n })), [])

  const resetDemo = async () => {
    try {
      await apiJson('/api/app/demo/reset', { method: 'POST' })
      await loadProfile()
      setReloadKey(k => k + 1)
      toast('Демо-данные восстановлены')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const common = { slug, profile, toast }

  return (
    <div className="min-h-screen bg-white sm:bg-[#EDECE7]">
      <div className="max-w-[480px] mx-auto min-h-screen bg-cream pb-[110px]">
        {profile?.is_demo && tab !== 'profile' && (
          <div className="px-5 pt-3">
            <div className="px-3.5 py-2 rounded-full bg-sunsoft text-xs font-bold text-sundeep flex items-center justify-between gap-2">
              <span>Демо-кабинет · данные тестовые</span>
              <button type="button" onClick={resetDemo} className="font-extrabold text-ink underline underline-offset-2">Сбросить</button>
            </div>
          </div>
        )}
        <div key={`${tab}-${reloadKey}`}>
          {tab === 'bookings' && <BookingsTab {...common} onCounts={setBookingCount} />}
          {tab === 'finance' && <FinanceTab {...common} />}
          {tab === 'clients' && <ClientsTab {...common} onCounts={setClientCount} />}
          {tab === 'profile' && <ProfileTab {...common} reloadProfile={loadProfile} onLogout={onLogout} onDemoReset={resetDemo} />}
        </div>
      </div>
      <BottomNav tab={tab} onChange={setTab} badges={badges} />
      {toastNode}
    </div>
  )
}
