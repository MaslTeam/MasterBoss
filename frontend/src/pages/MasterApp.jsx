import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  RefreshCw,
  AlertCircle,
  Sparkles,
  BookOpen,
  Phone,
  User,
  Copy,
  Check,
  BarChart3,
  LineChart,
  ShieldCheck,
  Scissors,
  CheckCheck,
  Send,
  SlidersHorizontal,
  ChevronDown,
  Info,
  Share2,
  ExternalLink,
  Lock,
  LogOut,
  Users,
  Settings,
  MessageSquare,
  DollarSign,
  Edit3,
  EyeOff,
  Bot,
  Zap,
  Bell
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.DEV ? 'http://localhost:8000' : '')
const DEFAULT_SLUG = 'anna'

// Категории расходов мастера
const EXPENSE_CATEGORIES = [
  'Материалы (базы, топы, гель-лаки)',
  'Аренда кабинета / места',
  'Стерилизация и крафт-пакеты',
  'Фрезы и инструмент',
  'Кофе, чай и угощения',
  'Реклама и продвижение',
  'Обучение и курсы',
  'Прочее'
]

// Быстрый выбор сумм для мобильного ввода
const QUICK_AMOUNTS = [500, 1000, 2500, 5000]

export default function MasterApp() {
  const slug = DEFAULT_SLUG
  const authStorageKey = `masterboss_auth_${slug}`

  // ===================================================================
  // 1. АВТОРИЗАЦИЯ ПО PIN-КОДУ
  // ===================================================================
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem(authStorageKey) === 'true'
  })
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  // ===================================================================
  // 2. НАВИГАЦИЯ ПО 5 ВКЛАДКАМ
  // bookings | finance | clients | reminders | settings
  // ===================================================================
  const [activeTab, setActiveTab] = useState('bookings')

  // Статистика мастера (выручка, расходы, записи, транзакции)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  // Фильтр для записей: all | pending | confirmed | cancelled
  const [bookingFilter, setBookingFilter] = useState('all')

  // Переключатель типа графика: area | bar
  const [chartType, setChartType] = useState('area')

  // Автообновление списка заявок раз в 6 секунд
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Toast-уведомление
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })

  // Копирование телефона
  const [copiedPhoneId, setCopiedPhoneId] = useState(null)

  // Новые отмены
  const [newCancellations, setNewCancellations] = useState([])

  // Тестовое добавление заявки
  const [isGeneratingDemoBooking, setIsGeneratingDemoBooking] = useState(false)
  const [bookingActionLoading, setBookingActionLoading] = useState(null)

  // Счётчик листа ожидания


  // -------------------------------------------------------------------
  // МОДАЛЬНОЕ ОКНО: РУЧНОЙ ВВОД РАСХОДА
  // -------------------------------------------------------------------
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [expenseSubmitting, setExpenseSubmitting] = useState(false)

  // -------------------------------------------------------------------
  // УМНЫЙ ВВОД РАСХОДА ФРАЗОЙ ЧЕРЕЗ GIGACHAT
  // -------------------------------------------------------------------
  const [aiExpensePhrase, setAiExpensePhrase] = useState('')
  const [aiExpenseLoading, setAiExpenseLoading] = useState(false)

  // -------------------------------------------------------------------
  // ВКЛАДКА 3: КЛИЕНТЫ И ВОЗВРАТ (LTV)
  // -------------------------------------------------------------------
  const [clients, setClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [reminderModal, setReminderModal] = useState({ open: false, client: null, text: '', loading: false })

  // -------------------------------------------------------------------
  // ВКЛАДКА 4: НАСТРОЙКИ (ПРОФИЛЬ И УСЛУГИ)
  // -------------------------------------------------------------------
  const [services, setServices] = useState([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: 'Анна Nails', niche: 'Маникюр', pin_code: '1234' })
  const [profileSaving, setProfileSaving] = useState(false)

  // Модальные окна услуг
  const [serviceModal, setServiceModal] = useState({ open: false, mode: 'create', data: { name: '', price: '', duration_min: 60 } })
  const [serviceSaving, setServiceSaving] = useState(false)

  // -------------------------------------------------------------------
  // УВЕДОМЛЕНИЯ В БРАУЗЕРЕ
  // -------------------------------------------------------------------
  const [notificationPermission, setNotificationPermission] = useState('default') // 'default' | 'granted' | 'denied'
  const [notificationSubscribed, setNotificationSubscribed] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [upcomingNotifications, setUpcomingNotifications] = useState([])
  const [clientsDue, setClientsDue] = useState([])
  const [loadingNotifications, setLoadingNotifications] = useState(false)

  // -------------------------------------------------------------------
  // ОКНО НАПОМИНАНИЙ МАСТЕРА (отдельная вкладка)
  // -------------------------------------------------------------------
  const [reminderTab, setReminderTab] = useState('upcoming')
  const [upcomingReminders, setUpcomingReminders] = useState([])
  const [loadingReminders, setLoadingReminders] = useState(false)

  // -------------------------------------------------------------------
  // GIGACHAT AI: БИЗНЕС-АУДИТ
  // -------------------------------------------------------------------
  const [businessAudit, setBusinessAudit] = useState(null)
  const [auditLoading, setAuditLoading] = useState(false)

  // -------------------------------------------------------------------
  // GIGACHAT AI: КОНФЛИКТНЫЕ СИТУАЦИИ (модалка)
  // -------------------------------------------------------------------
  const [conflictModal, setConflictModal] = useState({
    open: false,
    clientName: '',
    scenarioType: 'late',
    details: '',
    replyText: '',
    loading: false
  })

  // -------------------------------------------------------------------
  // GIGACHAT AI: ПАМЯТКА УХОДА (карточка брони)
  // -------------------------------------------------------------------
  const [careCardModal, setCareCardModal] = useState({
    open: false,
    bookingId: null,
    clientName: '',
    serviceName: '',
    cardText: '',
    loading: false
  })

  const showToast = useCallback((message, type = 'info') => {
    setToast({ show: true, message, type })
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 3500)
  }, [])

  // Запрос разрешения на уведомления браузера
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      showToast('Ваш браузер не поддерживает уведомления', 'error')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      setNotificationSubscribed(true)
      showToast('Уведомления включены ✅', 'success')
      // Проверяем ближайшие записи и клиентов для возврата
      checkUpcomingBookings()
      checkClientsDue()
    } else if (permission === 'denied') {
      setNotificationSubscribed(false)
      showToast('Уведомления заблокированы браузером', 'error')
    }
  }, [showToast])

  // Показать браузерное уведомление
  const showBrowserNotification = useCallback((title, body, icon = '/favicon.ico') => {
    if (notificationPermission !== 'granted') return
    try {
      new Notification(title, { body, icon, tag: 'masterboss-notification' })
    } catch (e) {
      console.warn('Notification error:', e)
    }
  }, [notificationPermission])

  // Подписка на Push API для мастера
  const subscribeToPush = useCallback(async (slugValue) => {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      console.warn('VAPID public key not configured in VITE_VAPID_PUBLIC_KEY')
      return
    }
    try {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        })
      }

      const pushSubscription = {
        slug: slugValue,
        endpoint: subscription.endpoint,
        p256dh: arrayToBase64(subscription.getKey('p256dh')),
        auth: arrayToBase64(subscription.getKey('auth')),
        user_agent: navigator.userAgent
      }

      const res = await fetch(`${API_BASE}/api/app/notifications/push-subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pushSubscription)
      })

      if (res.ok) {
        setPushSubscribed(true)
        showToast('Push-уведомления подключены ✅', 'success')
      } else {
        const errText = await res.text().catch(() => '')
        showToast('Ошибка подключения Push: ' + errText, 'error')
      }
    } catch (err) {
      console.warn('Push subscribe warning:', err)
      // Показываем ошибку только если пользователь кликнул вручную
    }
  }, [API_BASE, showToast])

  // Helper: конвертация VAPID ключа (base64url -> Uint8Array)
  function urlBase64ToUint8Array(base64String) {
    if (!base64String) throw new Error('VAPID ключ не задан')
    const clean = base64String.trim()
    const padding = '='.repeat((4 - clean.length % 4) % 4)
    const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/')
    try {
      const rawData = window.atob(base64)
      const outputArray = new Uint8Array(rawData.length)
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
      }
      return outputArray
    } catch (e) {
      console.error('VAPID decode error:', e)
      throw new Error('Неверный VAPID публичный ключ в .env')
    }
  }

  // Helper: ArrayBuffer -> base64
  function arrayToBase64(buffer) {
    if (!buffer) return ''
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
  }

  // Проверить ближайшие записи (напоминание за час)
  const checkUpcomingBookings = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetch(`${API_BASE}/api/app/notifications/upcoming?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setUpcomingNotifications(data)
        data.forEach(b => {
          showBrowserNotification(
            `⏰ Напоминание о записи`,
            `${b.client_name} — ${b.service_name} через ${b.minutes_until} мин. (${b.datetime_str})`
          )
        })
      }
    } catch (err) {
      console.warn('Upcoming bookings check error:', err)
    }
  }, [isAuthenticated, slug, API_BASE, showBrowserNotification])

  // Проверить клиентов для возврата (долгое отсутствие)
  const checkClientsDue = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetch(`${API_BASE}/api/app/notifications/clients-due?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setClientsDue(data)
        data.forEach(c => {
          showBrowserNotification(
            `📬 Клиент давно не был`,
            `${c.name} — последняя запись ${c.days_since_last_visit} дней назад (цикл ${c.cycle_days} дн.)`
          )
        })
      }
    } catch (err) {
      console.warn('Clients due check error:', err)
    }
  }, [isAuthenticated, slug, API_BASE, showBrowserNotification])

  // -------------------------------------------------------------------
  // НАПОМИНАНИЯ МАСТЕРА: ЗАГРУЗКА ДАННЫХ
  // -------------------------------------------------------------------
  const loadUpcomingReminders = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetch(`${API_BASE}/api/app/notifications/upcoming?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setUpcomingReminders(data)
      }
    } catch (err) {
      console.warn('Load upcoming reminders error:', err)
    }
  }, [isAuthenticated, slug, API_BASE])

  // -------------------------------------------------------------------
  // ГИГАЧАТ AI: ЗАПУСК БИЗНЕС-АУДИТА
  // -------------------------------------------------------------------
  const runBusinessAudit = useCallback(async () => {
    if (!isAuthenticated) return
    setAuditLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/ai/business-audit?slug=${slug}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Сервер вернул ошибку ' + res.status)
      const data = await res.json()
      setBusinessAudit(data.audit_text)
      showToast('AI-аудит готов ✨', 'success')
    } catch (err) {
      showToast('Не удалось запустить аудит: ' + err.message, 'error')
    } finally {
      setAuditLoading(false)
    }
  }, [isAuthenticated, slug, API_BASE, showToast])

  // -------------------------------------------------------------------
  // GIGACHAT AI: КОНФЛИКТНЫЙ ОТВЕТ (открыть модалку)
  // -------------------------------------------------------------------
  const openConflictModal = useCallback((scenarioType) => {
    setConflictModal({
      open: true,
      clientName: '',
      scenarioType: scenarioType,
      details: '',
      replyText: '',
      loading: false
    })
  }, [])

  const generateConflictReply = useCallback(async () => {
    if (!conflictModal.clientName.trim()) {
      showToast('Введите имя клиента', 'error')
      return
    }
    setConflictModal(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch(`${API_BASE}/api/app/ai/conflict-resolver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          client_name: conflictModal.clientName.trim(),
          scenario_type: conflictModal.scenarioType,
          details: conflictModal.details.trim()
        })
      })
      if (!res.ok) throw new Error('Ошибка генерации ответа')
      const data = await res.json()
      setConflictModal(prev => ({ ...prev, replyText: data.reply_text, loading: false }))
      showToast('Ответ готов 💬', 'success')
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error')
      setConflictModal(prev => ({ ...prev, loading: false }))
    }
  }, [conflictModal, slug, API_BASE, showToast])

  const copyConflictText = useCallback(() => {
    if (!conflictModal.replyText) return
    navigator.clipboard.writeText(conflictModal.replyText)
    showToast('Текст скопирован в буфер обмена', 'info')
  }, [conflictModal.replyText, showToast])

  // -------------------------------------------------------------------
  // GIGACHAT AI: ОТПРАВКА ПАМЯТКИ УХОДА
  // -------------------------------------------------------------------
  const openCareCardModal = useCallback((bookingId, clientName, serviceName) => {
    setCareCardModal({
      open: true,
      bookingId,
      clientName,
      serviceName,
      cardText: '',
      loading: false
    })
  }, [])

  const sendCareCard = useCallback(async () => {
    if (!careCardModal.bookingId) return
    setCareCardModal(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch(`${API_BASE}/api/app/booking/${careCardModal.bookingId}/send-care-card`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Ошибка отправки')
      const data = await res.json()
      setCareCardModal(prev => ({
        ...prev,
        cardText: data.card_text,
        loading: false
      }))
      showToast('Памятка ухода отправлена клиенту 🧴', 'success')
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error')
      setCareCardModal(prev => ({ ...prev, loading: false }))
    }
  }, [careCardModal.bookingId, API_BASE, showToast])

  const copyCareCardText = useCallback(() => {
    if (!careCardModal.cardText) return
    navigator.clipboard.writeText(careCardModal.cardText)
    showToast('Текст скопирован в буфер обмена', 'info')
  }, [careCardModal.cardText, showToast])

  // ===================================================================
  // ЗАГРУЗКА ДАННЫХ С СЕРВЕРА
  // ===================================================================
  const fetchStats = useCallback(async (isSilent = false) => {
    if (!isAuthenticated) return
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/api/app/stats?slug=${slug}`)
      if (!res.ok) throw new Error(`Ошибка загрузки данных (${res.status})`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Fetch stats error:', err)
      setError(err.message || 'Не удалось связаться с сервером')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [isAuthenticated, slug])

  // Загрузка списка клиентов
  const fetchClients = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingClients(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/clients?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setClients(data)
      }
    } catch (err) {
      console.error('Fetch clients error:', err)
    } finally {
      setLoadingClients(false)
    }
  }, [isAuthenticated, slug])

  // Загрузка услуг мастера
  const fetchServices = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingServices(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/services?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setServices(data)
      }
    } catch (err) {
      console.error('Fetch services error:', err)
    } finally {
      setLoadingServices(false)
    }
  }, [isAuthenticated, slug])

  // Загрузка профиля мастера для настроек
  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetch(`${API_BASE}/api/app/profile?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setProfileForm(prev => ({
          ...prev,
          name: data.name || prev.name,
          niche: data.niche || prev.niche,
          pin_code: data.pin_code || prev.pin_code
        }))
      }
    } catch (err) {
      console.error('Fetch profile error:', err)
    }
  }, [isAuthenticated, slug])

  // Первичная загрузка при авторизации
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats()
      fetchServices()
      fetchClients()
      fetchProfile()

      // Проверяем уведомления при открытии кабинета
      if (notificationPermission === 'granted') {
        checkUpcomingBookings()
        checkClientsDue()
      }

      // Подписка на Push API для мастера
      if ('serviceWorker' in navigator && 'PushManager' in window && notificationPermission === 'granted' && !pushSubscribed) {
        subscribeToPush(slug)
      }
    }
  }, [isAuthenticated, fetchStats, fetchServices, fetchClients, fetchProfile, notificationPermission, checkUpcomingBookings, checkClientsDue, pushSubscribed])

  // Загружаем напоминания при открытии вкладки "Напоминания"
  useEffect(() => {
    if (isAuthenticated && activeTab === 'reminders') {
      setLoadingReminders(true)
      Promise.all([loadUpcomingReminders()]).finally(() => {
        setLoadingReminders(false)
      })
    }
  }, [isAuthenticated, activeTab, loadUpcomingReminders])

  // Автообновление каждые 6 секунд для входящих заявок
  useEffect(() => {
    if (!isAuthenticated || !autoRefresh) return
    const interval = setInterval(() => {
      fetchStats(true)
    }, 6000)
    return () => clearInterval(interval)
  }, [isAuthenticated, autoRefresh, fetchStats])

  // Watch for new cancellations
  useEffect(() => {
    if (stats?.new_cancellations && stats.new_cancellations.length > 0) {
      stats.new_cancellations.forEach(item => {
        if (Notification.permission === 'granted') {
          new Notification('МастерБосс: Запись отменена! ❌', {
            body: `Клиент ${item.client_name} отменил запись на ${item.datetime_str}`
          })
        }
      })
      setNewCancellations(stats.new_cancellations)
    } else {
      setNewCancellations([])
    }
  }, [stats])

  const markCancellationRead = async (bookingId) => {
    try {
      await fetch(`${API_BASE}/api/app/booking/${bookingId}/mark-cancellation-read`, { method: 'POST' })
      fetchStats(true)
    } catch (err) {
      showToast('Ошибка при закрытии алерта: ' + err.message, 'error')
    }
  }

  // ===================================================================
  // ОБРАБОТЧИКИ АВТОРИЗАЦИИ (PIN)
  // ===================================================================
  const handlePinSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!pinInput.trim()) {
      setPinError('Введите цифровой PIN-код')
      return
    }

    setPinLoading(true)
    setPinError('')

    try {
      const res = await fetch(`${API_BASE}/api/app/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, pin: pinInput.trim() })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Неверный PIN-код')
      }

      const data = await res.json()
      if (data.success) {
        localStorage.setItem(authStorageKey, 'true')
        setIsAuthenticated(true)
        setPinInput('')
        showToast('Вход выполнен успешно! Добро пожаловать.', 'success')
      }
    } catch (err) {
      setPinError(err.message || 'Ошибка авторизации. Проверьте PIN.')
    } finally {
      setPinLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(authStorageKey)
    setIsAuthenticated(false)
    setPinInput('')
    setStats(null)
    showToast('Вы вышли из личного кабинета 🚪', 'info')
  }

  // ===================================================================
  // ДЕЙСТВИЯ НАД ЗАЯВКАМИ (1-КЛИК ПОДТВЕРЖДЕНИЕ / ЗАНЯТО)
  // ===================================================================
  const handleConfirmBooking = async (bookingId) => {
    setBookingActionLoading(bookingId)
    const prevBookings = stats?.bookings || []

    setStats(prev => ({
      ...prev,
      bookings: prev.bookings.map(b => (b.id === bookingId ? { ...b, status: 'confirmed' } : b))
    }))

    try {
      const res = await fetch(`${API_BASE}/api/app/booking/${bookingId}/confirm`, { method: 'POST' })
      if (!res.ok) throw new Error('Ошибка подтверждения')
      const updated = await res.json()
      setStats(prev => ({
        ...prev,
        bookings: prev.bookings.map(b => (b.id === bookingId ? updated : b))
      }))
      showToast('Запись подтверждена! ✅ Клиент получит уведомление в чате.', 'success')
    } catch (err) {
      setStats(prev => ({ ...prev, bookings: prevBookings }))
      showToast('Не удалось подтвердить: ' + err.message, 'error')
    } finally {
      setBookingActionLoading(null)
    }
  }

  const handleRejectBooking = async (bookingId) => {
    setBookingActionLoading(bookingId)
    const prevBookings = stats?.bookings || []

    setStats(prev => ({
      ...prev,
      bookings: prev.bookings.map(b => (b.id === bookingId ? { ...b, status: 'cancelled' } : b))
    }))

    try {
      const res = await fetch(`${API_BASE}/api/app/booking/${bookingId}/reject`, { method: 'POST' })
      if (!res.ok) throw new Error('Ошибка отмены')
      const updated = await res.json()
      setStats(prev => ({
        ...prev,
        bookings: prev.bookings.map(b => (b.id === bookingId ? updated : b))
      }))
      showToast('Запись отклонена («Занято» в блокноте) ❌', 'info')
    } catch (err) {
      setStats(prev => ({ ...prev, bookings: prevBookings }))
      showToast('Не удалось отклонить: ' + err.message, 'error')
    } finally {
      setBookingActionLoading(null)
    }
  }

  // Создать тестовую заявку
  const handleGenerateDemoBooking = async () => {
    setIsGeneratingDemoBooking(true)
    try {
      const demoClients = [
        { name: 'Полина Григорьева', phone: '+7 (903) 444-55-66', service: 'Маникюр с покрытием' },
        { name: 'Маргарита Белова', phone: '+7 (926) 777-88-99', service: 'Педикюр с покрытием' },
        { name: 'Алина Воронина', phone: '+7 (915) 333-22-11', service: 'Снятие + укрепление' }
      ]
      const pick = demoClients[Math.floor(Math.random() * demoClients.length)]
      const slotsRes = await fetch(`${API_BASE}/api/master/${slug}/available-slots`)
      const slots = slotsRes.ok ? await slotsRes.json() : []
      let datetimeStr = Array.isArray(slots) && slots.length > 0 ? slots[0] : null
      if (!datetimeStr) {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        datetimeStr = `${dd}.${mm}, 17:30`
      }

      const res = await fetch(`${API_BASE}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          client_name: pick.name,
          client_phone: pick.phone,
          service_name: pick.service,
          datetime_str: datetimeStr,
          price: 2500,
          message: `Здравствуйте! Запись на ${pick.service}`
        })
      })

      if (!res.ok) throw new Error('Не удалось создать заявку')

      await fetchStats(true)
      setBookingFilter('pending')
      showToast(`Поступила новая запись от ${pick.name}! Сверьте с блокнотом 📒`, 'info')
    } catch (err) {
      showToast('Ошибка генерации демо-заявки: ' + err.message, 'error')
    } finally {
      setIsGeneratingDemoBooking(false)
    }
  }

  // ===================================================================
  // ДЕЙСТВИЯ С ФИНАНСАМИ (РУЧНОЙ + GIGACHAT РАСХОД)
  // ===================================================================
  const handleAddExpenseSubmit = async (e) => {
    e.preventDefault()
    const amountVal = parseFloat(expenseAmount)
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Укажите корректную сумму расхода больше 0 ₽', 'error')
      return
    }

    const finalCategory = expenseCategory === 'Прочее' && customCategory.trim()
      ? customCategory.trim()
      : expenseCategory

    setExpenseSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/transaction?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'expense', amount: amountVal, category: finalCategory })
      })
      if (!res.ok) throw new Error('Ошибка сохранения расхода')

      setIsExpenseModalOpen(false)
      setExpenseAmount('')
      setCustomCategory('')
      await fetchStats(true)
      showToast(`Расход ${amountVal.toLocaleString('ru-RU')} ₽ успешно добавлен! 💳`, 'success')
    } catch (err) {
      showToast('Ошибка при внесении расхода: ' + err.message, 'error')
    } finally {
      setExpenseSubmitting(false)
    }
  }

  // Умный ввод расходов фразой через GigaChat
  const handleAiExpenseSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!aiExpensePhrase.trim()) {
      showToast('Введите фразу о расходе', 'error')
      return
    }

    setAiExpenseLoading(true)
    try {
      // 1. Распознаем фразу через GigaChat
      const parseRes = await fetch(`${API_BASE}/api/app/ai/parse-expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: aiExpensePhrase.trim() })
      })

      if (!parseRes.ok) throw new Error('Сбой распознавания фразы нейросетью')
      const parsed = await parseRes.json()

      // 2. Создаем транзакцию
      const txRes = await fetch(`${API_BASE}/api/app/transaction?slug=${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'expense',
          amount: parsed.amount,
          category: parsed.category
        })
      })

      if (!txRes.ok) throw new Error('Ошибка сохранения расхода')

      setAiExpensePhrase('')
      await fetchStats(true)
      showToast(
        `Расход ${parsed.amount.toLocaleString('ru-RU')} ₽ («${parsed.category}») внесен через GigaChat! 🤖✨`,
        'success'
      )
    } catch (err) {
      showToast('Ошибка умного ввода: ' + err.message, 'error')
    } finally {
      setAiExpenseLoading(false)
    }
  }

  // ===================================================================
  // ДЕЙСТВИЯ НАД КЛИЕНТАМИ И ГЕНЕРАЦИЯ НАПОМИНАНИЙ (LTV)
  // ===================================================================
  const handleGenerateReminder = async (client) => {
    setReminderModal({ open: true, client, text: '', loading: true })
    try {
      const daysAgo = client.days_since_last_visit ?? 21
      const res = await fetch(`${API_BASE}/api/app/ai/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          client_name: client.name,
          days_ago: daysAgo,
          cycle_days: client.cycle_days,
          service_name: 'Маникюр'
        })
      })

      if (!res.ok) throw new Error('Ошибка генерации текста')
      const data = await res.json()
      setReminderModal({ open: true, client, text: data.message, loading: false })
    } catch (err) {
      setReminderModal(prev => ({
        ...prev,
        loading: false,
        text: `${client.name}, добрый день! 💖 Это Анна Nails. Пора обновить покрытие, чтобы ноготки оставались идеальными ✨ Для вас есть удобные окошки на этой неделе! Выбрать время онлайн: /c/anna`
      }))
    }
  }

  // ===================================================================
  // УПРАВЛЕНИЕ ПРОФИЛЕМ И УСЛУГАМИ (ВКЛАДКА НАСТРОЙКИ)
  // ===================================================================
  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/profile?slug=${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      })
      if (!res.ok) throw new Error('Ошибка сохранения профиля')
      showToast('Настройки профиля и PIN-код успешно сохранены! ⚙️', 'success')
      await fetchProfile()
    } catch (err) {
      showToast('Не удалось сохранить настройки: ' + err.message, 'error')
    } finally {
      setProfileSaving(false)
    }
  }

  // Создать / обновить услугу
  const handleSaveService = async (e) => {
    e.preventDefault()
    const { name, price, duration_min } = serviceModal.data
    if (!name.trim() || !price) {
      showToast('Заполните название и цену услуги', 'error')
      return
    }

    setServiceSaving(true)
    try {
      if (serviceModal.mode === 'create') {
        const res = await fetch(`${API_BASE}/api/app/services?slug=${slug}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            price: parseFloat(price),
            duration_min: parseInt(duration_min) || 60
          })
        })
        if (!res.ok) throw new Error('Ошибка создания услуги')
        showToast('Услуга успешно добавлена в прайс-лист! 💅', 'success')
      } else {
        const res = await fetch(`${API_BASE}/api/app/services/${serviceModal.data.id}?slug=${slug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            price: parseFloat(price),
            duration_min: parseInt(duration_min) || 60,
            is_active: serviceModal.data.is_active ?? true
          })
        })
        if (!res.ok) throw new Error('Ошибка обновления услуги')
        showToast('Услуга успешно обновлена! ✏️', 'success')
      }

      setServiceModal({ open: false, mode: 'create', data: { name: '', price: '', duration_min: 60 } })
      await fetchServices()
    } catch (err) {
      showToast('Ошибка сохранения: ' + err.message, 'error')
    } finally {
      setServiceSaving(false)
    }
  }

  // Деактивировать услугу (soft-delete через is_active = False)
  const handleDeleteService = async (serviceId) => {
    if (!window.confirm('Деактивировать эту услугу? Она перестанет отображаться для клиентов в онлайн-записи.')) return

    try {
      const res = await fetch(`${API_BASE}/api/app/services/${serviceId}?slug=${slug}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Ошибка удаления услуги')
      showToast('Услуга деактивирована из прайса 🗑️', 'info')
      await fetchServices()
    } catch (err) {
      showToast('Не удалось удалить: ' + err.message, 'error')
    }
  }

  // ===================================================================
  // ВСПОМОГАТЕЛЬНЫЕ ДАННЫЕ
  // ===================================================================
  const pendingCount = useMemo(() => {
    if (!stats?.bookings) return 0
    return stats.bookings.filter(b => b.status === 'pending').length
  }, [stats])

  const filteredBookings = useMemo(() => {
    if (!stats?.bookings) return []
    if (bookingFilter === 'all') return stats.bookings
    if (bookingFilter === 'cancelled') {
      return stats.bookings.filter(b => b.status === 'cancelled' || b.status === 'cancelled_by_client')
    }
    return stats.bookings.filter(b => b.status === bookingFilter)
  }, [stats, bookingFilter])

  // Построение графика выручки и расходов
  const chartData = useMemo(() => {
    const weeks = [
      { name: '1-я нед', income: 0, expense: 0, profit: 0 },
      { name: '2-я нед', income: 0, expense: 0, profit: 0 },
      { name: '3-я нед', income: 0, expense: 0, profit: 0 },
      { name: '4-я нед', income: 0, expense: 0, profit: 0 }
    ]

    if (stats?.transactions?.length > 0) {
      stats.transactions.forEach(t => {
        try {
          const date = new Date(t.date)
          const day = date.getDate()
          let idx = 0
          if (day <= 7) idx = 0
          else if (day <= 14) idx = 1
          else if (day <= 21) idx = 2
          else idx = 3

          if (t.type === 'income') weeks[idx].income += t.amount
          else if (t.type === 'expense') weeks[idx].expense += t.amount
        } catch (e) {
          console.warn(e)
        }
      })
    }

    const hasData = weeks.some(w => w.income > 0 || w.expense > 0)
    if (!hasData && stats) {
      const baseInc = Math.round(stats.total_income / 4)
      const baseExp = Math.round(stats.total_expense / 4)
      return [
        { name: '1-я нед', income: Math.round(baseInc * 0.85), expense: Math.round(baseExp * 1.2), profit: Math.round(baseInc * 0.85 - baseExp * 1.2) },
        { name: '2-я нед', income: Math.round(baseInc * 1.05), expense: Math.round(baseExp * 0.9), profit: Math.round(baseInc * 1.05 - baseExp * 0.9) },
        { name: '3-я нед', income: Math.round(baseInc * 0.95), expense: Math.round(baseExp * 0.8), profit: Math.round(baseInc * 0.95 - baseExp * 0.8) },
        { name: '4-я нед', income: Math.round(baseInc * 1.15), expense: Math.round(baseExp * 1.1), profit: Math.round(baseInc * 1.15 - baseExp * 1.1) }
      ]
    }

    return weeks.map(w => ({ ...w, profit: w.income - w.expense }))
  }, [stats])

  const copyPhoneToClipboard = (phone, id) => {
    if (!phone) return
    navigator.clipboard.writeText(phone)
    setCopiedPhoneId(id)
    showToast(`Телефон ${phone} скопирован`, 'info')
    setTimeout(() => setCopiedPhoneId(null), 2000)
  }

  // ===================================================================
  // ЭКРАН ВХОДА ПО PIN-КОДУ (ЕСЛИ НЕ АВТОРИЗОВАН)
  // ===================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 selection:bg-purple-500 selection:text-white font-sans">
        <div className="w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/20 relative overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Декор */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-bl-full pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />

          <div className="text-center relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 p-0.5 mx-auto mb-4 shadow-lg shadow-purple-500/30 flex items-center justify-center">
              <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
                <Lock className="w-7 h-7 text-purple-600" />
              </div>
            </div>

            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Кабинет мастера
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Вход защищен PIN-кодом для безопасности клиентов и финансов
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="mt-6 space-y-4 relative z-10">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 text-center">
                Введите PIN-код
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoFocus
                placeholder="••••"
                value={pinInput}
                onChange={e => {
                  setPinInput(e.target.value)
                  if (pinError) setPinError('')
                }}
                className="w-full text-center text-3xl font-mono tracking-widest font-extrabold py-3 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-purple-600 focus:bg-white transition-all text-slate-900 placeholder:text-slate-300"
              />
            </div>

            {pinError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pinLoading || !pinInput}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-purple-600/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {pinLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Войти в кабинет</span>
                  <span>→</span>
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <span className="text-[11px] text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-mono">
                PIN по умолчанию: <strong>1234</strong>
              </span>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ===================================================================
  // ===================================================================
  // ОСНОВНОЙ ЭКРАН КАБИНЕТА МАСТЕРА
  // ===================================================================
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans pb-24 md:pb-12">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md transition-all duration-300">
          <div className={`px-4 py-3 rounded-2xl shadow-xl text-sm font-medium flex items-center justify-between backdrop-blur-md border ${
            toast.type === 'success'
              ? 'bg-emerald-600/95 text-white border-emerald-400/40 shadow-emerald-500/20'
              : toast.type === 'error'
              ? 'bg-rose-600/95 text-white border-rose-400/40 shadow-rose-500/20'
              : 'bg-slate-900/95 text-white border-slate-700 shadow-slate-900/30'
          }`}>
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-white" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-white" />}
              {toast.type === 'info' && <Sparkles className="w-4 h-4 shrink-0 text-purple-300" />}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="text-white/80 hover:text-white ml-2 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Контейнер приложения */}
      <main className="max-w-xl mx-auto px-4 pt-4 sm:pt-6">
        {/* Алерты об отмене */}
        {newCancellations.length > 0 && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 mb-4 animate-in fade-in zoom-in duration-300">
            {newCancellations.map(c => (
              <div key={c.booking_id}>
                <p className="text-sm text-orange-900 font-bold mb-2">⚠️ Запись отменена клиентом:</p>
                <p className="text-xs text-orange-800 mb-3">{c.client_name} ({c.service_name}) на {c.datetime_str}. Слот освобожден для новых записей.</p>
                <button
                  onClick={() => markCancellationRead(c.booking_id)}
                  className="w-full py-2 bg-orange-100 hover:bg-orange-200 text-orange-900 text-xs font-bold rounded-xl transition-colors"
                >
                  Понятно ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ========================================================= */}
        {/* ВЕРХНЯЯ ШАПКА МАСТЕРА */}
        {/* ========================================================= */}
        <header className="bg-white rounded-3xl p-4 sm:p-5 shadow-card border border-slate-100 mb-4 relative overflow-hidden">
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 p-0.5 shadow-md shadow-purple-500/20">
                  <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center overflow-hidden">
                    <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                      {profileForm.name ? profileForm.name.charAt(0) : 'А'}
                    </span>
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-4 h-4 rounded-full border-2 border-white" title="Онлайн" />
              </div>

              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                    {profileForm.name}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-[11px] font-semibold rounded-full border border-purple-200/60">
                    <Sparkles className="w-3 h-3 text-purple-600" />
                    Тариф ПРО
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {profileForm.niche} • Частная практика
                </p>
              </div>
            </div>

            {/* Кнопка выхода */}
            <button
              onClick={handleLogout}
              title="Выйти из кабинета"
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-semibold flex items-center gap-1 border border-slate-200/70 transition-colors"
            >
              <span>Выйти</span>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Плашка ссылки для записи клиентов */}
          <div className="mt-3.5 p-3 bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 rounded-2xl border border-purple-200/80 flex items-center justify-between gap-2.5 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-500/20">
                <Share2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Ссылка для клиентов</span>
                  <span className="text-[10px] text-purple-700 bg-purple-200/60 px-1 py-0.2 rounded font-mono font-bold">
                    /c/{slug}
                  </span>
                </div>
                <a
                  href={`/c/${slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-purple-600 hover:underline truncate font-mono block"
                >
                  {typeof window !== 'undefined' ? `${window.location.origin}/c/${slug}` : `/c/${slug}`}
                </a>
              </div>
            </div>

            <a
              href={`/c/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-600/20 flex items-center justify-center gap-1 shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Открыть чат</span>
            </a>
          </div>
        </header>

        {/* МЯГКОЕ НАПОМИНАНИЕ: УВЕДОМЛЕНИЯ */}
        {notificationPermission !== 'granted' && (
          <div className="mt-4 px-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <div className="flex-1">
                <div className="font-bold">Включите уведомления</div>
                <div className="text-[10px]">Вы будете получать напоминания о записях и возврате клиентов</div>
              </div>
              <button
                onClick={requestNotificationPermission}
                className="text-[10px] text-indigo-600 hover:underline font-bold px-2 py-1 rounded bg-amber-100 hover:bg-amber-200"
              >
                Включить
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ЧЕТЫРЕ ВКЛАДКИ НАВИГАЦИИ */}
        {/* ========================================================= */}
        <nav className="grid grid-cols-5 gap-1 p-1 bg-slate-200/70 backdrop-blur-md rounded-2xl mb-4 text-xs font-bold">
          {/* Вкладка 1: Заявки */}
          <button
            onClick={() => setActiveTab('bookings')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 relative ${
              activeTab === 'bookings'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Заявки</span>
            </div>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Вкладка 2: Финансы */}
          <button
            onClick={() => setActiveTab('finance')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'finance'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Финансы</span>
            </div>
          </button>

          {/* Вкладка 3: Клиенты и Возврат */}
          <button
            onClick={() => setActiveTab('clients')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'clients'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>Возврат</span>
            </div>
          </button>

          {/* Вкладка 4: Настройки */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'settings'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-1">
              <Settings className="w-3.5 h-3.5" />
              <span>Настр.</span>
            </div>
          </button>

          {/* Вкладка 5: Напоминания */}
          <button
            onClick={() => setActiveTab('reminders')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'reminders'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" />
              <span>Напомнить</span>
            </div>
            {upcomingReminders.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black animate-pulse">
                {upcomingReminders.length}
              </span>
            )}
          </button>
        </nav>

        {/* Индикатор загрузки / ошибки */}
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-2 text-rose-800 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchStats()}
              className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold"
            >
              Повторить
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* ВКЛАДКА 1: ЗАЯВКИ (BOOKINGS) */}
        {/* ========================================================= */}
        {activeTab === 'bookings' && stats && (
          <section className="space-y-4 animate-in fade-in duration-200">
            {/* Панель управления списком заявок */}
            <div className="bg-white rounded-3xl p-4 shadow-card border border-slate-100">


              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">
                    Входящие заявки
                  </h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    {stats.bookings.length}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">


                  {/* Кнопка быстрого обновления */}
                  <button
                    onClick={() => fetchStats(true)}
                    disabled={refreshing}
                    className="text-xs font-semibold text-slate-600 hover:text-purple-600 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-600' : ''}`} />
                    <span>Обновить</span>
                  </button>

                  {/* Переключатель автообновления 6с */}
                  <button
                    onClick={() => setAutoRefresh(prev => !prev)}
                    className={`text-xs font-semibold px-2 py-1 rounded-xl border flex items-center gap-1 ${
                      autoRefresh
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span>{autoRefresh ? 'Авто 6с' : 'Авто выкл'}</span>
                  </button>

                </div>
              </div>

              {/* Фильтры заявок */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setBookingFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                    bookingFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Все ({stats.bookings.length})
                </button>
                <button
                  onClick={() => setBookingFilter('pending')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap flex items-center gap-1 transition-all ${
                    bookingFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  <BookOpen className="w-3 h-3" />
                  Сверка с блокнотом ({pendingCount})
                  {pendingCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                </button>
                <button
                  onClick={() => setBookingFilter('confirmed')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                    bookingFilter === 'confirmed'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Подтвержденные
                </button>
                <button
                  onClick={() => setBookingFilter('cancelled')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                    bookingFilter === 'cancelled'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Занято / Отмена
                </button>
              </div>
            </div>

            {/* Карточки заявок */}
            {filteredBookings.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-soft">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <CheckCheck className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Нет записей в этой категории</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {bookingFilter === 'pending'
                    ? 'Все входящие заявки сверены с блокнотом!'
                    : 'Пока нет записей с выбранным статусом.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((booking) => {
                  const isPending = booking.status === 'pending'
                  const isConfirmed = booking.status === 'confirmed'
                  const isCancelled = booking.status === 'cancelled'
                  const isCancelledByClient = booking.status === 'cancelled_by_client'
                  const isActionLoading = bookingActionLoading === booking.id

                  return (
                    <div
                      key={booking.id}
                      className={`bg-white rounded-3xl p-4 sm:p-5 border transition-all ${
                        isPending
                          ? 'border-amber-300 ring-2 ring-amber-400/20 shadow-md shadow-amber-500/5'
                          : isCancelledByClient
                          ? 'bg-slate-200 border-slate-300'
                          : 'border-slate-100 shadow-soft'
                      }`}
                    >
                      {/* Шапка карточки */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                            isPending
                              ? 'bg-amber-100 text-amber-800'
                              : isConfirmed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {booking.client_name ? booking.client_name.charAt(0).toUpperCase() : 'К'}
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                              {booking.client_name}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="text-xs text-slate-500 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                <span>{booking.client_phone || 'Телефон не указан'}</span>
                              </div>
                              {booking.client_phone && (
                                <button
                                  onClick={() => copyPhoneToClipboard(booking.client_phone, booking.id)}
                                  className="text-slate-400 hover:text-slate-600 p-0.5"
                                  title="Скопировать телефон"
                                >
                                  {copiedPhoneId === booking.id ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Бейдж статуса */}
                        <div>
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600 animate-spin-slow" />
                              Ожидает сверки
                            </span>
                          )}
                          {isConfirmed && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Подтверждено
                            </span>
                          )}
                          {isCancelled && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold border border-slate-200">
                              <XCircle className="w-3 h-3 text-rose-500" />
                              Занято / Отмена
                            </span>
                          )}
                          {isCancelledByClient && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-500 text-white text-[11px] font-bold border border-slate-600">
                              <XCircle className="w-3 h-3 text-white" />
                              Отменено клиентом ❌
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Услуга и стоимость */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 flex items-center justify-between mb-2 text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <Scissors className="w-4 h-4 text-purple-500 shrink-0" />
                          <span className="font-medium text-slate-800">{booking.service_name}</span>
                        </div>
                        <div className="font-extrabold text-slate-900 font-mono shrink-0">
                          {booking.price ? Number(booking.price).toLocaleString('ru-RU') : 0} ₽
                        </div>
                      </div>

                      {/* Дата и время записи */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 px-1">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span>Время визита:</span>
                        <span className="font-bold text-slate-800">{booking.datetime_str}</span>
                      </div>

                      {/* КНОПКИ ДЛЯ СТАТУСА PENDING: ПОДТВЕРДИТЬ В 1 КЛИК / ЗАНЯТО */}
                      {isPending && (
                        <div className="mt-3 pt-3 border-t border-amber-200 bg-amber-50/70 -mx-4 -mb-4 p-4 rounded-b-3xl">
                          <p className="text-[11px] text-amber-900 mb-2.5 leading-snug">
                            Сверьтесь с блокнотом на <strong>{booking.datetime_str}</strong> и подтвердите заявку:
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleConfirmBooking(booking.id)}
                              disabled={isActionLoading}
                              className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              {isActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Подтвердить ✅</span>}
                            </button>
                            <button
                              onClick={() => handleRejectBooking(booking.id)}
                              disabled={isActionLoading}
                              className="w-full py-2.5 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 active:scale-95 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              {isActionLoading ? <RefreshCw className="w-4 h-4 animate-spin text-rose-500" /> : <span>Занято ❌</span>}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* КНОПКА ПАМЯТКИ УХОДА для confirmed броней */}
                      {isConfirmed && (
                        <div className="mt-3 pt-3 border-t border-emerald-200 bg-emerald-50/70 -mx-4 -mb-4 p-4 rounded-b-3xl">
                          <p className="text-[11px] text-emerald-900 mb-2.5 leading-snug">
                            Посещение подтверждено на <strong>{booking.datetime_str}</strong>. Пришлите клиенту памятку по уходу:
                          </p>
                          <button
                            onClick={() => openCareCardModal(booking.id, booking.client_name, booking.service_name)}
                            disabled={careCardModal.loading}
                            className="w-full py-2.5 px-3 bg-gradient-to-r from-teal-400 to-emerald-600 hover:from-teal-500 hover:to-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-500/20 transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            {careCardModal.loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>
                              <span className="text-[11px]">Отправить памятку ухода 🧴</span>
                            </>}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ========================================================= */}
        {/* ВКЛАДКА 2: ФИНАНСЫ (FINANCE) */}
        {/* ========================================================= */}
        {activeTab === 'finance' && stats && (
          <section className="space-y-4 animate-in fade-in duration-200">
            {/* Карточка чистой прибыли */}
            <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs uppercase tracking-wider font-semibold text-emerald-100 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  Чистая прибыль мастера
                </span>
                <span className="text-[11px] font-bold bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full">
                  {stats.total_income > 0
                    ? `${Math.round((stats.net_profit / stats.total_income) * 100)}% маржа`
                    : '0% маржа'}
                </span>
              </div>

              <div className="flex items-baseline gap-2 my-1">
                <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono">
                  {stats.net_profit.toLocaleString('ru-RU')}
                </span>
                <span className="text-xl font-bold text-emerald-100">₽</span>
              </div>

              <div className="flex items-center justify-between pt-2 mt-2 border-t border-white/15 text-xs text-emerald-100">
                <span>Выручка минус расходы мастера</span>
                <button
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="px-2.5 py-1 bg-white text-emerald-800 hover:bg-emerald-50 font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Внести расход
                </button>
              </div>
            </div>

            {/* 3 карточки: Выручка, Расходы, Налог */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-soft">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-slate-500">Выручка</span>
                  <div className="w-5 h-5 rounded-md bg-purple-50 flex items-center justify-center text-purple-600">
                    <ArrowUpRight className="w-3 h-3" />
                  </div>
                </div>
                <div className="font-extrabold text-slate-900 text-sm font-mono">
                  {stats.total_income.toLocaleString('ru-RU')} ₽
                </div>
              </div>

              <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-soft">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-slate-500">Расходы</span>
                  <div className="w-5 h-5 rounded-md bg-rose-50 flex items-center justify-center text-rose-500">
                    <ArrowDownRight className="w-3 h-3" />
                  </div>
                </div>
                <div className="font-extrabold text-slate-900 text-sm font-mono">
                  {stats.total_expense.toLocaleString('ru-RU')} ₽
                </div>
              </div>

              <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-soft">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-slate-500">Налог 4%</span>
                  <div className="w-5 h-5 rounded-md bg-sky-50 flex items-center justify-center text-sky-600">
                    <ShieldCheck className="w-3 h-3" />
                  </div>
                </div>
                <div className="font-extrabold text-slate-900 text-sm font-mono">
                  {stats.tax_amount.toLocaleString('ru-RU')} ₽
                </div>
              </div>
            </div>

            {/* БЛОК: УМНЫЙ ВВОД РАСХОДОВ ФРАЗОЙ ЧЕРЕЗ GIGACHAT */}
            <div className="bg-gradient-to-br from-purple-50 via-indigo-50/60 to-white rounded-3xl p-4 sm:p-5 border border-purple-200/80 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Умный ввод расходов фразой (GigaChat)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Назовите сумму и покупку — нейросеть сама определит категорию и внесет в кассу
                  </p>
                </div>
              </div>

              <form onSubmit={handleAiExpenseSubmit} className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Например: Купила базы Luxio на 3500"
                    value={aiExpensePhrase}
                    onChange={e => setAiExpensePhrase(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-white border border-purple-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={aiExpenseLoading || !aiExpensePhrase.trim()}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    {aiExpenseLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Внести 🪄</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Быстрые подсказки-чипсы */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">Быстро:</span>
                  {[
                    'Гель-лаки и базы 3500',
                    'Аренда места 18000',
                    'Крафт-пакеты 1200',
                    'Кофе для клиентов 800'
                  ].map(sample => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setAiExpensePhrase(sample)}
                      className="px-2 py-0.5 rounded-lg bg-white/80 hover:bg-purple-100 text-purple-700 text-[10px] font-medium border border-purple-100 transition-colors"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </form>
            </div>

            {/* График динамики месяца (Recharts) */}
            <div className="bg-white rounded-3xl p-4 shadow-card border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-purple-600" />
                  Динамика по неделям
                </h3>

                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setChartType('area')}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                      chartType === 'area' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Area
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                      chartType === 'bar' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              </div>

              <div className="w-full h-44 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'area' ? (
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
                      <Tooltip />
                      <Area type="monotone" dataKey="income" name="Выручка" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="expense" name="Расходы" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.2} />
                    </AreaChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
                      <Tooltip />
                      <Bar dataKey="income" name="Выручка" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="expense" name="Расходы" fill="#F43F5E" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Последние операции */}
            {stats.transactions && (
              <div className="bg-white rounded-3xl p-4 shadow-card border border-slate-100">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-purple-600" />
                  Последние операции в кассе
                </h3>
                <div className="space-y-2">
                  {stats.transactions.slice(0, 5).map(tx => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                          tx.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
                        }`}>
                          {tx.type === 'income' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        </div>
                        <span className="font-semibold text-slate-800 truncate max-w-[200px]">{tx.category}</span>
                      </div>
                      <span className={`font-mono font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {tx.type === 'income' ? '+' : '-'} {Number(tx.amount).toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* БЛОК: AI-АУДИТ И ТОЧКИ РОСТА */}
        {stats && (
          <section className="space-y-3 animate-in fade-in duration-200">
            <div className="relative rounded-3xl p-5 shadow-xl border border-transparent bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 text-white">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-700 to-pink-700 opacity-60 rounded-3xl" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles className="w-4.5 h-4.5" />
                  </div>
                  <button
                    onClick={runBusinessAudit}
                    disabled={auditLoading}
                    className="px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all flex items-center gap-1 shrink-0 disabled:opacity-60"
                  >
                    {auditLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        <span>Запустить аудит за месяц 🪄</span>
                      </>
                    )}
                  </button>
                </div>
                <h2 className="text-sm sm:text-base font-bold mb-1">✨ AI-Анализ финансов от GigaChat</h2>
                <p className="text-xs text-indigo-100/90 mb-3 leading-relaxed max-w-lg">
                  {businessAudit ? (
                    <span dangerouslySetInnerHTML={{ __html: businessAudit.replace(/\n/g, '<br>') }} />
                  ) : (
                    'Нажмите кнопку выше, чтобы получить анализ финансов и рекомендации по росту чека.'
                  )}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* ВКЛАДКА 3: КЛИЕНТЫ И ВОЗВРАТ (LTV) */}
        {/* ========================================================= */}
        {activeTab === 'clients' && (
          <section className="space-y-4 animate-in fade-in duration-200">
            {/* КНОПКА: AI-ПОМОЩНИК ОБЩЕНИЯ */}
            <div className="bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 rounded-3xl p-4 sm:p-5 shadow-card relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-700 to-pink-700 opacity-50 rounded-3xl" />
              <div className="relative z-10 flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-xl bg-white/20 flex items-center justify-center">
                    <MessageSquare className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-white">💬 AI-Помощник общения</h3>
                    <p className="text-[10px] text-indigo-100/90">Генерация ответов клиентам в сложных ситуациях</p>
                  </div>
                </div>
                <button
                  onClick={() => openConflictModal('custom')}
                  className="px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Сгенерировать ответ клиенту</span>
                </button>
              </div>
            </div>

            {/* Карточка вовлечения и LTV */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-4 sm:p-5 text-white shadow-card">
              <div className="flex items-center gap-2 mb-1.5">
                <Users className="w-5 h-5 text-purple-200" />
                <h2 className="text-sm sm:text-base font-extrabold">
                  Клиентская база и авто-возврат
                </h2>
              </div>
              <p className="text-xs text-indigo-100 leading-relaxed">
                Напоминайте клиенткам вовремя обновить покрытие, чтобы они не уходили к другим мастерам. Умный помощник сам составляет теплое персональное сообщение.
              </p>
            </div>

            {loadingClients ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-600" />
                Загрузка клиентов...
              </div>
            ) : clients.length === 0 ? (
              <div className="bg-white rounded-3xl p-6 text-center text-slate-500 text-xs">
                Пока нет сохраненных клиентов
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map(client => (
                  <div
                    key={client.id}
                    className="bg-white rounded-3xl p-4 border border-slate-100 shadow-soft flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        client.is_due_return ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm leading-tight">
                            {client.name}
                          </h4>
                          {client.is_due_return && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                              Пора записаться!
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {client.phone} • Визит: {client.days_since_last_visit !== null ? `${client.days_since_last_visit} дн. назад` : 'не указано'} (цикл {client.cycle_days} дн.)
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleGenerateReminder(client)}
                      className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Напомнить ✨</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ========================================================= */}
        {/* ВКЛАДКА 4: НАСТРОЙКИ (SETTINGS: ПРОФИЛЬ И ПРАЙС-ЛИСТ) */}
        {/* ========================================================= */}
        {activeTab === 'settings' && (
          <section className="space-y-5 animate-in fade-in duration-200">
            {/* БЛОК 1: ПРОФИЛЬ МАСТЕРА */}
            <div className="bg-white rounded-3xl p-5 shadow-card border border-slate-100">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                <User className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Профиль мастера
                </h2>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Имя / Название бренда
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.name}
                    onChange={e => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Ниша / Специализация
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.niche}
                    onChange={e => setProfileForm(prev => ({ ...prev, niche: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    PIN-код для входа в кабинет
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={profileForm.pin_code}
                    onChange={e => setProfileForm(prev => ({ ...prev, pin_code: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {profileSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>Сохранить настройки</span>}
                </button>
              </form>
            </div>

            {/* БЛОК 2: ПРАЙС-ЛИСТ И УСЛУГИ */}
            <div className="bg-white rounded-3xl p-5 shadow-card border border-slate-100">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-purple-600" />
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Прайс-лист услуг
                  </h2>
                </div>
                <button
                  onClick={() => setServiceModal({ open: true, mode: 'create', data: { name: '', price: '', duration_min: 60 } })}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить услугу</span>
                </button>
              </div>

              {loadingServices ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-purple-600" />
                  Загрузка услуг...
                </div>
              ) : services.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Нет услуг в базе</p>
              ) : (
                <div className="space-y-2.5">
                  {services.map(svc => (
                    <div
                      key={svc.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                        svc.is_active ? 'bg-slate-50 border-slate-200' : 'bg-slate-100/60 border-slate-200/50 opacity-60'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs sm:text-sm text-slate-900">{svc.name}</span>
                          {!svc.is_active && (
                            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-600 text-[9px] font-bold rounded">
                              Неактивна
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {svc.price.toLocaleString('ru-RU')} ₽ • {svc.duration_min} мин
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setServiceModal({ open: true, mode: 'edit', data: { ...svc } })}
                          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                          title="Редактировать услугу"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {svc.is_active && (
                          <button
                            onClick={() => handleDeleteService(svc.id)}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200"
                            title="Деактивировать услугу"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* БЛОК 3: УВЕДОМЛЕНИЯ В БРАУЗЕРЕ */}
            <div className="bg-white rounded-3xl p-5 shadow-card border border-slate-100">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                <Bell className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Уведомления в браузере
                </h2>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <div className="text-xs font-bold text-slate-600 uppercase mb-0.5">Push-уведомления</div>
                    <div className="text-[10px] text-slate-500">Напоминания за час и возврат клиентов</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={requestNotificationPermission}
                      disabled={notificationPermission === 'granted' || notificationSubscribed}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        notificationPermission === 'granted'
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : notificationPermission === 'denied'
                          ? 'bg-rose-50 text-rose-600 border-rose-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {notificationPermission === 'granted' ? 'Уведомления ✅' : notificationPermission === 'denied' ? 'Заблокированы' : 'Включить'}
                    </button>
                    <button
                      onClick={() => subscribeToPush(slug)}
                      disabled={pushSubscribed || notificationPermission !== 'granted'}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        pushSubscribed
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                      }`}
                    >
                      {pushSubscribed ? 'Push ✅' : 'Push'}
                    </button>
                  </div>
                </div>

                {/* Ближайшие записи */}
                {upcomingNotifications.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <div className="text-xs font-bold text-slate-600 uppercase">Напоминания за час</div>
                    </div>
                    {upcomingNotifications.map(b => (
                      <div key={b.booking_id} className="p-2.5 bg-amber-50 rounded-xl border border-amber-100 text-xs">
                        <div className="font-bold text-slate-800">{b.client_name}</div>
                        <div className="text-[10px] text-amber-700 mb-0.5">{b.service_name} — {b.datetime_str}</div>
                        <div className="text-[10px] text-slate-500">через {b.minutes_until} мин.</div>
                      </div>
                    ))}
                  </div>
                )}

                {upcomingNotifications.length === 0 && clientsDue.length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                    Нет активных уведомлений
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* ВКЛАДКА: НАПОМИНАНИЯ МАСТЕРА */}
        {/* ========================================================= */}
        {activeTab === 'reminders' && (
          <section className="space-y-4 animate-in fade-in duration-200">
            {/* Заголовок и переключатель вкладок */}
            <div className="bg-white rounded-3xl p-5 shadow-card border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-purple-600" />
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Напоминания клиентам
                </h2>
              </div>

              <div className="flex bg-slate-100 rounded-xl p-0.5">
                <button
                  onClick={() => setReminderTab('upcoming')}
                  className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
                    reminderTab === 'upcoming'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  ⏰ Напомнить за час ({upcomingReminders.length})
                </button>
              </div>
            </div>

            {/* Раздел 1: Напомнить за час (ближайшие записи) */}
            {reminderTab === 'upcoming' && (
              <div className="space-y-3">
                {loadingReminders ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-600" />
                    <div>Загружаем напоминания…</div>
                  </div>
                ) : upcomingReminders.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingReminders.map(b => (
                      <div key={b.booking_id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-slate-900 text-sm">{b.client_name}</div>
                            <div className="text-[10px] text-slate-500">{b.service_name} — {b.datetime_str}</div>
                            <div className="text-[10px] text-amber-700 font-bold">⏰ Через {b.minutes_until} мин.</div>
                          </div>
                        </div>
                        <div className="px-3 py-1.5 bg-amber-50 text-amber-700 font-bold text-xs rounded-xl border border-amber-200 hover:bg-amber-100 transition-colors">
                          📞 Позвонить
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                    <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center mx-auto mb-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-xs font-bold text-amber-800 mb-1">Нет ближайших записей</div>
                    <div className="text-[10px] text-amber-600">Все клиенты на ближайший час разобраны</div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* ========================================================= */}
      {/* МОДАЛКА: AI-КОНФЛИКТНЫЙ ОТВЕТ */}
      {/* ========================================================= */}
      {conflictModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">💬 Составление ответа клиенту</h3>
              <button
                onClick={() => setConflictModal({ ...conflictModal, open: false })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Ситуация</label>
                <div className="flex gap-1.5">
                  {['late', 'discount', 'late_cancel', 'custom'].map(s => {
                    const labels = { late: 'Опоздание', discount: 'Скидка', late_cancel: 'Отмена <24ч', custom: 'Свой вопрос' }
                    return (
                      <button
                        key={s}
                        onClick={() => setConflictModal({ ...conflictModal, scenarioType: s })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          conflictModal.scenarioType === s
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {labels[s]}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Имя клиента</label>
                <input
                  type="text"
                  value={conflictModal.clientName}
                  onChange={e => setConflictModal({ ...conflictModal, clientName: e.target.value })}
                  placeholder="Например: Мария"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Детали (опционально)</label>
                <textarea
                  value={conflictModal.details}
                  onChange={e => setConflictModal({ ...conflictModal, details: e.target.value })}
                  rows={2}
                  placeholder="Например: опаздывает на 30 минут, просит подождать"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Готовый ответ от ИИ</label>
                {conflictModal.loading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Генерируем ответ...</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Bot className="w-3 h-3" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {conflictModal.replyText || 'Ответ появится здесь после нажатия кнопки ниже'}
                      </p>
                    </div>
                  </div>
                )}
                {conflictModal.replyText && (
                  <button
                    onClick={copyConflictText}
                    className="mt-2 text-[10px] text-indigo-600 hover:underline flex items-center gap-1 px-2 py-1 rounded bg-white border border-indigo-100"
                  >
                    <Copy className="w-3 h-3" /> Скопировать текст
                  </button>
                )}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={generateConflictReply}
                  disabled={conflictModal.loading || !conflictModal.clientName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-500/20 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {conflictModal.loading ? 'Генерация...' : 'Составить ответ через ИИ'}
                </button>
                <button
                  onClick={() => setConflictModal({ ...conflictModal, open: false })}
                  className="px-3 py-2.5 bg-slate-100 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* МОДАЛКА: ПАМЯТКА УХОДА 🧴 */}
      {/* ========================================================= */}
      {careCardModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">🧴 Памятка по уходу</h3>
              <button
                onClick={() => setCareCardModal({ ...careCardModal, open: false })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700">{careCardModal.clientName}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Scissors className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs font-bold text-slate-700">{careCardModal.serviceName}</span>
              </div>

              <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Текст памятки</label>
                {careCardModal.loading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Генерируем памятку...</span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {careCardModal.cardText || 'Памятка будет сгенерирована после нажатия кнопки'}
                  </div>
                )}
                {careCardModal.cardText && (
                  <button
                    onClick={copyCareCardText}
                    className="mt-2 text-[10px] text-purple-600 hover:underline flex items-center gap-1 px-2 py-1 rounded bg-white border border-purple-100"
                  >
                    <Copy className="w-3 h-3" /> Скопировать текст
                  </button>
                )}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={sendCareCard}
                  disabled={careCardModal.loading || !careCardModal.bookingId}
                  className="flex-1 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold text-sm rounded-xl shadow-md shadow-teal-500/20 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {careCardModal.loading ? 'Отправка...' : 'Отправить памятку клиенту 🧴'}
                </button>
                <button
                  onClick={() => setCareCardModal({ ...careCardModal, open: false })}
                  className="px-3 py-2.5 bg-slate-100 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* МОДАЛКА: СОЗДАНИЕ / РЕДАКТИРОВАНИЕ УСЛУГИ */}
      {/* ========================================================= */}
      {serviceModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                {serviceModal.mode === 'create' ? 'Добавить новую услугу' : 'Редактировать услугу'}
              </h3>
              <button
                onClick={() => setServiceModal(prev => ({ ...prev, open: false }))}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Название услуги</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Экспресс-маникюр"
                  value={serviceModal.data.name}
                  onChange={e => setServiceModal(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Цена в ₽</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="50"
                  placeholder="2500"
                  value={serviceModal.data.price}
                  onChange={e => setServiceModal(prev => ({ ...prev, data: { ...prev.data, price: e.target.value } }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Длительность в мин</label>
                <input
                  type="number"
                  required
                  min="15"
                  step="15"
                  value={serviceModal.data.duration_min}
                  onChange={e => setServiceModal(prev => ({ ...prev, data: { ...prev.data, duration_min: e.target.value } }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="flex items-center gap-1 mt-1.5">
                  {[30, 45, 60, 90, 120].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setServiceModal(prev => ({ ...prev, data: { ...prev.data, duration_min: m } }))}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-purple-50 text-[10px] font-semibold text-slate-600"
                    >
                      {m}м
                    </button>
                  ))}
                </div>
              </div>

              {serviceModal.mode === 'edit' && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceModal.data.is_active ?? true}
                    onChange={e => setServiceModal(prev => ({ ...prev, data: { ...prev.data, is_active: e.target.checked } }))}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span>Услуга активна (видна клиентам)</span>
                </label>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setServiceModal(prev => ({ ...prev, open: false }))}
                  className="py-2.5 px-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={serviceSaving}
                  className="py-2.5 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-600/20 active:scale-95 transition-all"
                >
                  {serviceSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : <span>Сохранить</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* МОДАЛКА: ТЕКСТ НАПОМИНАНИЯ КЛИЕНТУ ДЛЯ WHATSAPP */}
      {/* ========================================================= */}
      {reminderModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Напоминание для {reminderModal.client?.name}
                </h3>
              </div>
              <button
                onClick={() => setReminderModal({ open: false, client: null, text: '', loading: false })}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reminderModal.loading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-600" />
                GigaChat составляет теплое напоминание...
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                  {reminderModal.text}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(reminderModal.text)
                      showToast('Текст скопирован! Вставьте в чат мессенджера 📋', 'success')
                    }}
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Скопировать</span>
                  </button>

                  <a
                    href={`https://wa.me/${(reminderModal.client?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(reminderModal.text)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-sm"
                  >
                    <span>В WhatsApp 💬</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* МОДАЛКА: РУЧНОЕ ВНЕСЕНИЕ РАСХОДА */}
      {/* ========================================================= */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-modal border border-slate-100">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Внести расход мастера</h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpenseSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Сумма (₽)</label>
                <input
                  type="number"
                  required
                  min="1"
                  autoFocus
                  placeholder="0"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  className="w-full text-2xl font-bold font-mono px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900"
                />
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {QUICK_AMOUNTS.map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setExpenseAmount(amt.toString())}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 hover:bg-purple-50 text-slate-600"
                    >
                      +{amt} ₽
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Категория</label>
                <select
                  value={expenseCategory}
                  onChange={e => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800"
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {expenseCategory === 'Прочее' && (
                  <input
                    type="text"
                    required
                    placeholder="Укажите категорию"
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    className="mt-2 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="py-2.5 px-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={expenseSubmitting || !expenseAmount}
                  className="py-2.5 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md active:scale-95"
                >
                  {expenseSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : <span>Сохранить</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
