import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Send,
  Sparkles,
  Clock,
  CheckCircle2,
  Phone,
  User,
  Calendar,
  Scissors,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  ChevronRight,
  Check,
  XCircle,
  X,
  PartyPopper,
  Bell
} from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.DEV ? 'http://localhost:8000' : '')

// Форматирование телефона (+7 (XXX) XXX-XX-XX)
function formatPhone(value) {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''

  let localDigits = digits
  if (localDigits[0] === '8' || localDigits[0] === '7') {
    localDigits = localDigits.slice(1)
  }

  let formatted = '+7'
  if (localDigits.length > 0) formatted += ` (${localDigits.slice(0, 3)}`
  if (localDigits.length >= 3) formatted += `) ${localDigits.slice(3, 6)}`
  if (localDigits.length >= 6) formatted += `-${localDigits.slice(6, 8)}`
  if (localDigits.length >= 8) formatted += `-${localDigits.slice(8, 10)}`
  return formatted
}

function getPhoneDigits(phone) {
  return (phone || '').replace(/\D/g, '')
}

function isPhoneValid(phone) {
  return getPhoneDigits(phone).length >= 10
}

export default function ClientChat() {
  const { slug = 'anna' } = useParams()
  const storageKey = `masterboss_chat_${slug}`

  // -------------------------------------------------------------------
  // ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ ИЗ LOCALSTORAGE (ПРИ F5)
  // -------------------------------------------------------------------
  const savedState = (() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  // Данные мастера (имя, ниша, услуги)
  const [master, setMaster] = useState(null)
  const [loadingMaster, setLoadingMaster] = useState(!savedState)
  const [masterError, setMasterError] = useState(null)

  // Динамические услуги мастера из базы данных
  const [services, setServices] = useState([])

  // Динамические свободные слоты из базы данных
  const [availableSlots, setAvailableSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Текущий шаг пошагового сценария:
  // 1: Выбор услуги
  // 2: Выбор даты и времени
  // 3: Ввод имени
  // 4: Ввод телефона
  // 5: Итоговая карточка согласования
  // 6: Заявка отправлена (ожидание подтверждения / подтверждено)
  const [step, setStep] = useState(() => savedState?.step || 1)

  // Данные записи
  const [selectedService, setSelectedService] = useState(() => savedState?.selectedService || null)
  const [selectedDateTime, setSelectedDateTime] = useState(() => savedState?.selectedDateTime || '')
  const [clientName, setClientName] = useState(() => savedState?.clientName || localStorage.getItem('mb_client_name') || '')
  const [clientPhone, setClientPhone] = useState(() => savedState?.clientPhone || localStorage.getItem('mb_client_phone') || '')

  // Активный ID бронирования и статус для Live Polling
  const [bookingId, setBookingId] = useState(() => savedState?.bookingId || null)
  const [bookingStatus, setBookingStatus] = useState(() => savedState?.bookingStatus || null) // 'pending' | 'confirmed' | 'cancelled'
  const [canCancel, setCanCancel] = useState(false)

  // Waitlist — подписка на освобождение слота
  const [waitlistSlots, setWaitlistSlots] = useState(() => {
    try {
      const raw = localStorage.getItem(`mb_waitlist_${slug}`)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch { return new Set() }
  })
  const [showWaitlistModal, setShowWaitlistModal] = useState(false)
  const [waitlistSlot, setWaitlistSlot] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)

  // Флаг конфликта слота (кто-то занял слот между выбором и отправкой)
  const [slotConflict, setSlotConflict] = useState(false)

  // Временные поля ввода
  const [customTimeInput, setCustomTimeInput] = useState('')
  const [nameInput, setNameInput] = useState(() => savedState?.clientName || localStorage.getItem('mb_client_name') || '')
  const [phoneInput, setPhoneInput] = useState(() => {
    const raw = savedState?.clientPhone || localStorage.getItem('mb_client_phone') || ''
    return raw ? formatPhone(raw) : ''
  })

  // История сообщений чата
  const [messages, setMessages] = useState(() => savedState?.messages || [])
  const [isTyping, setIsTyping] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const messagesEndRef = useRef(null)
  const nameInputRef = useRef(null)
  const phoneInputRef = useRef(null)

  // Уведомления в браузере для клиента
  const [notificationPermission, setNotificationPermission] = useState('default')
  const [pushSubscribed, setPushSubscribed] = useState(false)

  // Автоскролл ленты вниз
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    }
  }, [])

  useEffect(() => {
    scrollToBottom(true)
  }, [messages, isTyping, step, scrollToBottom])

  // Фокус на полях ввода при смене шагов
  useEffect(() => {
    if (step === 3 && nameInputRef.current) {
      setTimeout(() => nameInputRef.current?.focus(), 200)
    } else if (step === 4 && phoneInputRef.current) {
      setTimeout(() => phoneInputRef.current?.focus(), 200)
    }
  }, [step])

  // -------------------------------------------------------------------
  // СОХРАНЕНИЕ СОСТОЯНИЯ В LOCALSTORAGE ПРИ ЛЮБОМ ИЗМЕНЕНИИ
  // -------------------------------------------------------------------
  useEffect(() => {
    try {
      const stateToSave = {
        step,
        messages,
        selectedService,
        selectedDateTime,
        clientName,
        clientPhone,
        bookingId,
        bookingStatus
      }
      localStorage.setItem(storageKey, JSON.stringify(stateToSave))
    } catch (e) {
      console.warn('LocalStorage save error:', e)
    }
  }, [storageKey, step, messages, selectedService, selectedDateTime, clientName, clientPhone, bookingId, bookingStatus])

  // -------------------------------------------------------------------
  // ЗАГРУЗКА ПРОФИЛЯ МАСТЕРА И АКТУАЛЬНЫХ УСЛУГ (GET /api/master/{slug})
  // -------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true
    setLoadingMaster(true)
    setMasterError(null)

    fetch(`${API_BASE}/api/master/${slug}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Мастер '${slug}' не найден (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (!isMounted) return
        setMaster(data)
        setServices(data.services || [])
        setLoadingMaster(false)

        // Если в localStorage еще не было сообщений — добавляем стартовое приветствие
        if (!savedState || !savedState.messages || savedState.messages.length === 0) {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          setMessages([
            {
              id: 'bot-welcome',
              sender: 'assistant',
              text: `Здравствуйте! Я онлайн-ассистент мастера ${data.name || 'Анны'}. Какая процедура вас интересует?`,
              time: nowStr
            }
          ])
        }
      })
      .catch((err) => {
        if (!isMounted) return
        console.error('Fetch master error:', err)
        setMasterError(err.message || 'Не удалось загрузить данные мастера')
        setLoadingMaster(false)
      })

    // Запрос разрешения на уведомления браузера для клиента
    if ('Notification' in window && notificationPermission === 'default') {
      Notification.requestPermission().then(perm => {
        setNotificationPermission(perm)
        if (perm === 'granted') {
          new Notification(`Подключены уведомления мастера ${master?.name || 'Анны'}`, {
            body: 'Вы будете получать напоминания о записи и возврате',
            icon: '/favicon.ico'
          })
        }
      })
    }

    // Подписка на Push API (уведомления даже при закрытой вкладке)
    if ('serviceWorker' in navigator && 'PushManager' in window && notificationPermission === 'granted' && !pushSubscribed) {
      subscribeToPush(slug)
    }

    return () => { isMounted = false }
  }, [slug, notificationPermission, pushSubscribed, master?.name])

  // =====================================================================
  // PUSH ПОДПИСКА КЛИЕНТА
  // =====================================================================
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
        slug: `client_${slugValue}`,
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
        console.log('Push-подписка оформлена:', pushSubscription.endpoint)
      } else {
        console.warn('Ошибка оформления push-подписки:', res.status)
      }
    } catch (err) {
      console.warn('Push subscribe error:', err)
    }
  }, [API_BASE])

  // Helper: конвертация VAPID ключа
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
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

  // -------------------------------------------------------------------
  // ЗАГРУЗКА СВОБОДНЫХ СЛОТОВ (GET /api/master/{slug}/available-slots)
  // -------------------------------------------------------------------
  const fetchAvailableSlots = useCallback(async () => {
    setLoadingSlots(true)
    try {
      const res = await fetch(`${API_BASE}/api/master/${slug}/available-slots`)
      if (res.ok) {
        const slots = await res.json()
        setAvailableSlots(slots)
      }
    } catch (err) {
      console.error('Fetch slots error:', err)
    } finally {
      setLoadingSlots(false)
    }
  }, [slug])

  useEffect(() => {
    // Подгружаем слоты на старте и при переходе на шаг 2
    fetchAvailableSlots()

    // Автообновление слотов каждые 5 секунд на шагах выбора времени и согласования
    if (step === 2 || step === 5) {
      const interval = setInterval(fetchAvailableSlots, 5000)
      return () => clearInterval(interval)
    }
  }, [fetchAvailableSlots, step])

  // Опрос освободившихся слотов waitlist (каждые 15 сек на шаге 2)
  useEffect(() => {
    if (step !== 2 || waitlistSlots.size === 0) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/app/waitlist/check?slug=client_${slug}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.slots && data.slots.length > 0) {
          data.slots.forEach(s => {
            setMessages(prev => [...prev, {
              id: `slot-free-${s.slot}-${Date.now()}`,
              sender: 'assistant',
              text: `🔔 Слот на ${s.slot} освободился! Пора записываться.`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }])
          })
        }
      } catch (e) {
        console.warn('Waitlist check error:', e)
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [step, slug, waitlistSlots.size])

  // Добавление сообщения ассистента с мягкой паузой
  const addAssistantMessage = useCallback((text, extra = {}) => {
    setIsTyping(true)
    setTimeout(() => {
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: 'assistant',
          text,
          time: nowStr,
          ...extra
        }
      ])
      setIsTyping(false)
    }, 350)
  }, [])

  // ===================================================================
  // ЖИВЫЕ УВЕДОМЛЕНИЯ ЧЕРЕЗ POLLING (КАЖДЫЕ 2 СЕКУНДЫ)
  // ===================================================================
  useEffect(() => {
    if (!bookingId || (bookingStatus !== 'pending' && bookingStatus !== 'confirmed')) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/booking/${bookingId}/status`)
        if (!res.ok) return
        const data = await res.json()
        
        setCanCancel(data.can_cancel)

        // 1. Мастер нажал «Подтвердить» — добавляем сообщение ТОЛЬКО при переходе pending→confirmed
        if (data.status === 'confirmed' && bookingStatus === 'pending') {
          setBookingStatus('confirmed')
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          const masterName = master?.name || 'Анна'
          setMessages((prev) => [
            ...prev,
            {
              id: `confirmed-${Date.now()}`,
              sender: 'assistant',
              text: `🎉 Ура! Мастер ${masterName} подтвердила вашу запись: ${data.service_name} на ${data.datetime_str}.`,
              time: nowStr,
              isConfirmedBookingCard: true,
              bookingId: data.id,
              canCancel: data.can_cancel
            }
          ])
        }
        // Если уже confirmed — просто обновляем canCancel в существующей карточке
        else if (data.status === 'confirmed' && bookingStatus === 'confirmed') {
          setMessages((prev) => prev.map(msg =>
            msg.isConfirmedBookingCard ? { ...msg, canCancel: data.can_cancel } : msg
          ))
        }
        // 2. Клиент уже отменил эту же бронь (из кабинета или дублирующий запрос)
        else if (data.status === 'cancelled_by_client') {
          setBookingStatus('cancelled_by_client')
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          await fetchAvailableSlots()
          setMessages((prev) => [
            ...prev,
            {
              id: `cancelled-by-client-${Date.now()}`,
              sender: 'assistant',
              text: `Ваша запись на ${data.datetime_str} отменена. Слот снова свободен.`,
              time: nowStr,
              isLiveCancelled: true
            }
          ])
          setStep(2)
        }
        // 2. Мастер нажал «Занято» в кабинете
        else if (data.status === 'cancelled') {
          setBookingStatus('cancelled')
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          await fetchAvailableSlots()
          setMessages((prev) => [
            ...prev,
            {
              id: `cancelled-${Date.now()}`,
              sender: 'assistant',
              text: `😔 К сожалению, время ${data.datetime_str} в бумажном блокноте мастера уже занято. Пожалуйста, выберите другое свободное окошко:`,
              time: nowStr,
              isLiveCancelled: true
            }
          ])
          // Возвращаем клиента на шаг 2 для выбора другого времени
          setStep(2)
        }
      } catch (err) {
        console.warn('Status polling error:', err)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [bookingId, bookingStatus, master?.name, fetchAvailableSlots])

  // ===================================================================
  // ОБРАБОТЧИКИ ШАГОВ
  // ===================================================================

  // ШАГ 1: Выбор услуги
  const handleSelectService = (service) => {
    if (step !== 1 || isTyping) return

    setSelectedService(service)
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    setMessages((prev) => [
      ...prev,
      {
        id: `user-service-${Date.now()}`,
        sender: 'client',
        text: `${service.name} · ${service.price.toLocaleString('ru-RU')} ₽ (${service.duration_min} мин)`,
        time: nowStr
      }
    ])

    setStep(2)
    fetchAvailableSlots()
    addAssistantMessage('Отлично! Выберите удобное свободное время для записи:')
  }


  // ШАГ 2: Выбор даты и времени
  const handleSelectDateTime = (dtStr) => {
    const trimmed = dtStr.trim()
    if (!trimmed || step !== 2 || isTyping) return

    setSelectedDateTime(trimmed)
    setSlotConflict(false)
    setSubmitError(null)
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    setMessages((prev) => [
      ...prev,
      {
        id: `user-time-${Date.now()}`,
        sender: 'client',
        text: trimmed,
        time: nowStr
      }
    ])

    setCustomTimeInput('')
    setStep(3)
    addAssistantMessage('Как вас зовут?')
  }

  // ШАГ 3: Ввод имени
  const handleSubmitName = (e) => {
    if (e) e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed || step !== 3 || isTyping) return

    setClientName(trimmed)
    localStorage.setItem('mb_client_name', trimmed)

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    setMessages((prev) => [
      ...prev,
      {
        id: `user-name-${Date.now()}`,
        sender: 'client',
        text: trimmed,
        time: nowStr
      }
    ])

    setStep(4)
    addAssistantMessage('Укажите ваш номер телефона. Мастер сверит время с бумажным блокнотом и пришлет подтверждение:')
  }

  // ШАГ 4: Ввод телефона
  const handlePhoneChange = (e) => {
    setPhoneInput(formatPhone(e.target.value))
  }

  const handleSubmitPhone = (e) => {
    if (e) e.preventDefault()
    if (!isPhoneValid(phoneInput) || step !== 4 || isTyping) return

    const formatted = formatPhone(phoneInput)
    setClientPhone(formatted)
    localStorage.setItem('mb_client_phone', formatted)

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    setMessages((prev) => [
      ...prev,
      {
        id: `user-phone-${Date.now()}`,
        sender: 'client',
        text: formatted,
        time: nowStr
      }
    ])

    setStep(5)

    // ШАГ 5: Бот показывает сводную карточку
    setIsTyping(true)
    setTimeout(() => {
      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-summary-${Date.now()}`,
          sender: 'assistant',
          text: 'Пожалуйста, проверьте данные вашей записи перед отправкой мастеру:',
          time: replyTime,
          isSummaryCard: true
        }
      ])
      setIsTyping(false)
    }, 350)
  }

  // ШАГ 5: Финальная отправка заявки мастеру
  const handleFinalSubmit = async () => {
    if (isSubmitting || bookingStatus === 'pending' || bookingStatus === 'confirmed' || slotConflict) return

    // Предварительная проверка: слот всё ещё свободен?
    try {
      const slotsRes = await fetch(`${API_BASE}/api/master/${slug}/available-slots`)
      if (slotsRes.ok) {
        const freshSlots = await slotsRes.json()
        if (!freshSlots.includes(selectedDateTime.trim())) {
          setSlotConflict(true)
          setStep(2)
          setSubmitError('⚠️ Этот слот только что заняли. Пожалуйста, выберите другое свободное время!')
          return
        }
      }
    } catch (err) {
      console.warn('Pre-check slots error:', err)
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const payload = {
        slug,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        service_name: selectedService?.name || 'Маникюр с покрытием',
        datetime_str: selectedDateTime.trim(),
        price: selectedService?.price || 2500,
        message: 'Запись через пошаговый выбор'
      }

      const res = await fetch(`${API_BASE}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const detailMsg = errorData.detail || `Ошибка сервера (${res.status})`

        // Если слот уже занят — блокируем кнопку и переводим на шаг 2
        if (String(detailMsg).includes('Слот уже забронирован')) {
          await fetchAvailableSlots()
          setSlotConflict(true)
          setStep(2)
          throw new Error('⚠️ Этот слот только что заняли. Пожалуйста, выберите другое свободное время!')
        }
        throw new Error(detailMsg)
      }

      const data = await res.json()
      const newBookingId = data.booking_id || data.details?.booking_id

      setBookingId(newBookingId)
      setBookingStatus('pending')
      setStep(6)

      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-pending-${Date.now()}`,
          sender: 'assistant',
          text: data.reply_text || `Заявка отправлена! Мастер ${master?.name || 'Анна'} сейчас смотрит в бумажный блокнот и подтвердит слот.`,
          time: replyTime,
          isPendingConfirmationCard: true
        }
      ])
    } catch (err) {
      console.error('Submit booking error:', err)
      setSubmitError(err.message || 'Не удалось отправить заявку. Попробуйте еще раз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Сброс чата и очистка localStorage [ Новая запись / Сброс ]
  const handleResetChat = () => {
    localStorage.removeItem(storageKey)
    localStorage.removeItem(`mb_waitlist_${slug}`)
    setStep(1)
    setSelectedService(null)
    setSelectedDateTime('')
    setCustomTimeInput('')
    setSubmitError(null)
    setSlotConflict(false)
    setBookingId(null)
    setBookingStatus(null)
    setWaitlistSlots(new Set())
    setShowWaitlistModal(false)
    setWaitlistSlot('')

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const masterDisplayName = master?.name || 'Анны'

    setMessages([
      {
        id: `bot-welcome-${Date.now()}`,
        sender: 'assistant',
        text: `Здравствуйте! Я онлайн-ассистент мастера ${masterDisplayName}. Какая процедура вас интересует?`,
        time: nowStr
      }
    ])
  }

  // ===================================================================
  // WAITLIST — ПОДПИСКА НА ОСВОБОЖДЕНИЕ СЛОТА
  // ===================================================================

  const handleWaitlistToggle = (slot) => {
    if (waitlistSlots.has(slot)) {
      setWaitlistSlots(prev => {
        const next = new Set(prev)
        next.delete(slot)
        localStorage.setItem(`mb_waitlist_${slug}`, JSON.stringify([...next]))
        return next
      })
      return
    }
    setWaitlistSlot(slot)
    // Если есть имя и телефон — подписываем сразу, иначе открываем модалку
    if (clientName.trim() && clientPhone.trim()) {
      handleWaitlistSubmit(slot)
    } else {
      setShowWaitlistModal(true)
    }
  }

  const handleWaitlistSubmit = async (slot = waitlistSlot) => {
    if (waitlistLoading || !slot) return
    if (!clientName.trim() || !clientPhone.trim()) {
      setShowWaitlistModal(true)
      return
    }

    setWaitlistLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/app/waitlist/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_slug: slug,
          client_name: clientName.trim(),
          client_phone: clientPhone.trim(),
          desired_slot: slot,
          endpoint: null,
          p256dh: null,
          auth: null
        })
      })
      if (!res.ok) throw new Error('Не удалось оформить подписку')

      const data = await res.json()
      setWaitlistSlots(prev => {
        const next = new Set(prev)
        next.add(slot)
        localStorage.setItem(`mb_waitlist_${slug}`, JSON.stringify([...next]))
        return next
      })
      setShowWaitlistModal(false)
      setWaitlistSlot('')

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [
        ...prev,
        {
          id: `waitlist-${Date.now()}`,
          sender: 'assistant',
          text: `🔔 Приняли! Сообщим вам, когда слот на ${slot} освободится.`,
          time: nowStr
        }
      ])
    } catch (err) {
      console.error('Waitlist error:', err)
      setSubmitError('Не удалось подписаться на уведомление. Попробуйте позже.')
    } finally {
      setWaitlistLoading(false)
    }
  }

  // ===================================================================
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between items-center selection:bg-indigo-500 selection:text-white font-sans">
      {/* Главный мобильный контейнер */}
      <div className="w-full max-w-md bg-white min-h-screen shadow-2xl flex flex-col relative border-x border-slate-200">
        
        {/* ========================================================= */}
        {/* ШАПКА ЧАТА (Профиль, статус, кнопка сброса) */}
        {/* ========================================================= */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 p-0.5 shadow-md shadow-indigo-500/20">
                  <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center font-black text-base text-indigo-700">
                    {master ? master.name.charAt(0) : 'А'}
                  </div>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white ring-1 ring-emerald-400" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h1 className="font-bold text-slate-900 text-sm leading-tight truncate">
                    {master ? master.name : (loadingMaster ? 'Загрузка...' : 'Мастер')}
                  </h1>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200/60 shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                    Онлайн
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {master ? master.niche : 'Бьюти-мастер'} • Запись 24/7
                </p>
              </div>
            </div>

            {/* Кнопка сброса [ Новая запись / Сброс ] и переход в кабинет */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleResetChat}
                title="Очистить чат и начать новую запись"
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Сброс</span>
              </button>


            </div>
          </div>

          {/* МЯГКОЕ НАПОМИНАНИЕ: УВЕДОМЛЕНИЯ */}
          {notificationPermission !== 'granted' && (
            <div className="mt-2 px-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <div className="font-bold">Включите уведомления</div>
                  <div className="text-[10px]">Вы будете получать напоминания о записи и важные сообщения от мастера</div>
                </div>
                <button
                  onClick={() => {
                    if ('Notification' in window) {
                      Notification.requestPermission().then(perm => {
                        setNotificationPermission(perm)
                      })
                    }
                  }}
                  className="text-[10px] text-indigo-600 hover:underline font-bold px-2 py-1 rounded bg-amber-100 hover:bg-amber-200"
                >
                  Включить
                </button>
              </div>
            </div>
          )}

          {/* Индикатор шага */}
          <div className="mt-2.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-slate-600">
                {step === 1 && 'Шаг 1 из 4: Выберите процедуру'}
                {step === 2 && 'Шаг 2 из 4: Выберите свободное время'}
                {step === 3 && 'Шаг 3 из 4: Ваше имя'}
                {step === 4 && 'Шаг 4 из 4: Номер телефона'}
                {step === 5 && 'Проверка данных записи'}
                {step === 6 && (bookingStatus === 'confirmed' ? 'Запись подтверждена 🎉' : 'Сверка с блокнотом мастера 📒')}
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                {step <= 4 ? `${step}/4` : '✓'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((seg) => {
                const isPassed = step > seg || bookingStatus === 'confirmed'
                const isCurrent = step === seg
                return (
                  <div
                    key={seg}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isPassed
                        ? 'bg-indigo-600'
                        : isCurrent
                        ? 'bg-indigo-400 animate-pulse'
                        : 'bg-slate-200'
                    }`}
                  />
                )
              })}
            </div>
          </div>
        </header>

        {/* ========================================================= */}
        {/* ЛЕНТА СООБЩЕНИЙ ЧАТА */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F8FAFC]">
          {loadingMaster && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Загрузка данных мастера...</span>
              </div>
            </div>
          )}

          {masterError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{masterError}</span>
            </div>
          )}

          {!loadingMaster && master && (
            <div className="text-center my-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/60 text-slate-600 text-[11px] font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Прямая запись к мастеру без комиссий
              </span>
            </div>
          )}

          {messages.map((msg) => {
            const isClient = msg.sender === 'client'

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isClient ? 'items-end' : 'items-start'} space-y-1.5 animate-in fade-in duration-200`}
              >
                {/* Обычный пузырь сообщения */}
                <div
                  className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                    isClient
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-xs'
                      : 'bg-white text-slate-800 border border-slate-100 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <div
                    className={`text-[10px] mt-1 text-right font-medium ${
                      isClient ? 'text-indigo-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.time}
                  </div>
                </div>

                {/* ========================================================= */}
                {/* ШАГ 5: СВОДНАЯ КАРТОЧКА СОГЛАСОВАНИЯ ВНУТРИ ЧАТА */}
                {/* ========================================================= */}
                {msg.isSummaryCard && (
                  <div className="w-full max-w-[95%] my-2 bg-gradient-to-br from-indigo-50 via-slate-50 to-indigo-50/50 border-2 border-indigo-200 rounded-3xl p-4 shadow-md shadow-indigo-500/5 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <span className="font-extrabold text-sm text-slate-900">
                        Проверьте данные записи:
                      </span>
                    </div>

                    <div className="bg-white rounded-2xl p-3 border border-slate-200 space-y-2 text-xs text-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-indigo-600" />
                          Клиент:
                        </span>
                        <span className="font-bold text-slate-900">{clientName}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-indigo-600" />
                          Телефон:
                        </span>
                        <span className="font-mono font-bold text-slate-900">{clientPhone}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-indigo-600" />
                          Процедура:
                        </span>
                        <span className="font-bold text-slate-900">
                          {selectedService?.name} ({selectedService?.price?.toLocaleString('ru-RU')} ₽)
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                          Время:
                        </span>
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                          {selectedDateTime}
                        </span>
                      </div>
                    </div>

                    {submitError && (
                      <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{submitError}</span>
                      </div>
                    )}

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleFinalSubmit}
                        disabled={isSubmitting || bookingStatus === 'pending' || bookingStatus === 'confirmed'}
                        className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Отправка заявки...</span>
                          </>
                        ) : (
                          <span>Отправить заявку мастеру ✅</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}


                {msg.isConfirmedBookingCard && (
                  <div className="w-full max-w-[95%] my-2 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-4 shadow-xl shadow-emerald-500/25 border-2 border-emerald-300 animate-in zoom-in-95 duration-300">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md text-white flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-black uppercase tracking-wider block text-emerald-100">
                          Запись подтверждена! 🎉
                        </span>
                        <p className="text-xs sm:text-sm font-semibold mt-1 leading-snug">
                          {msg.text}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between">
                      <button
                        onClick={handleResetChat}
                        className="text-xs font-bold text-white bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl transition-colors"
                      >
                        Записаться ещё раз
                      </button>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/20">
                      {msg.canCancel ? (
                        <button
                          onClick={async () => {
                            if (!window.confirm('Вы точно хотите отменить запись?')) return
                            try {
                              const res = await fetch(`${API_BASE}/api/booking/${msg.bookingId}/cancel-by-client`, { method: 'POST' })
                              const data = await res.json().catch(() => ({}))
                              if (!res.ok) {
                                throw new Error(data.detail || 'Не удалось отменить запись')
                              }
                              setBookingStatus('cancelled_by_client')
                              setMessages(prev => [...prev, {
                                id: `cancel-${Date.now()}`,
                                sender: 'assistant',
                                text: 'Запись успешно отменена. Слот снова свободен.',
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              }])
                            } catch (err) {
                              setSubmitError(err.message)
                              alert(err.message)
                            }
                          }}
                          className="w-full py-2 bg-white/10 hover:bg-white/20 border border-rose-200 text-rose-100 rounded-xl text-xs font-bold transition-colors"
                        >
                          Отменить запись ✕
                        </button>
                      ) : (
                        <div className="p-3 bg-white/10 rounded-xl text-xs text-rose-100 border border-white/20">
                          ⚠️ До визита менее 24 часов. Онлайн-отмена недоступна. Для переноса свяжитесь с мастером напрямую.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* КАРТОЧКА: ПАМЯТКА ПО УХОДУ 🧴 */}
                {/* ========================================================= */}
                {msg.isCareCard && (
                  <div className="w-full max-w-[95%] my-2 bg-gradient-to-br from-indigo-50 via-purple-50 to-indigo-100 rounded-3xl p-4 shadow-lg border-2 border-indigo-200/50 animate-in zoom-in-95 duration-300">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <span className="w-6 h-6">🧴</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-black uppercase tracking-wider block text-indigo-600">
                          Памятка по уходу после процедуры
                        </span>
                        <p className="text-xs sm:text-sm font-semibold mt-1 leading-snug text-indigo-900 whitespace-pre-wrap">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-indigo-100/50 flex items-center justify-between">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.text || '')
                          setSubmitError('Памятка скопирована в буфер обмена 📋')
                        }}
                        className="text-xs font-bold text-indigo-600 hover:underline px-3 py-1.5 rounded-xl bg-white border border-indigo-100"
                      >
                        Скопировать памятку
                      </button>
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* ЖИВОЕ УВЕДОМЛЕНИЕ: ЗАНЯТО (CANCELLED) */}
                {/* ========================================================= */}
                {msg.isLiveCancelled && (
                  <div className="w-full max-w-[95%] my-2 bg-rose-50 border-2 border-rose-300 rounded-3xl p-4 shadow-sm animate-in zoom-in-95 duration-200">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                        <XCircle className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-black text-rose-950 block">
                          Окно занято в блокноте ❌
                        </span>
                        <p className="text-[11px] text-rose-800 mt-1 leading-snug">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Индикатор печати */}
          {isTyping && (
            <div className="flex items-start gap-2 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl rounded-bl-xs px-4 py-2.5 border border-slate-100 shadow-xs flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium">Ассистент печатает</span>
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ========================================================= */}
        {/* НИЖНЯЯ ПАНЕЛЬ ДЕЙСТВИЙ (ИНТЕРАКТИВ ПО ШАГАМ) */}
        {/* ========================================================= */}
        <footer className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md p-3 border-t border-slate-100">
          
          {/* ШАГ 1: ВЫБОР УСЛУГИ ИЗ БАЗЫ ДАННЫХ */}
          {step === 1 && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Выберите услугу мастера:
                </span>
                <span className="text-[10px] text-indigo-600 font-semibold">1 клик</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {services.map((srv) => (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => handleSelectService(srv)}
                    disabled={isTyping}
                    className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-left transition-all active:scale-98 flex items-center justify-between group shadow-xs disabled:opacity-50"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-800 group-hover:text-indigo-950 block truncate">
                        {srv.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {srv.duration_min} мин
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-extrabold text-xs sm:text-sm text-indigo-600 group-hover:text-indigo-700 bg-white px-2.5 py-1 rounded-xl border border-slate-200 shadow-2xs">
                        {srv.price.toLocaleString('ru-RU')} ₽
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-all" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ШАГ 2: ВЫБОР ТОЛЬКО СВОБОДНЫХ СЛОТОВ ИЗ БАЗЫ ДАННЫХ */}
          {step === 2 && (
            <div className="space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Свободные окна на неделю вперед:
                </span>
                <button
                  onClick={fetchAvailableSlots}
                  className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingSlots ? 'animate-spin' : ''}`} />
                  <span>Обновить</span>
                </button>
              </div>

              {loadingSlots ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-600" />
                  Проверяем свободные окна...
                </div>
              ) : (
                <div className="space-y-3">
                  {availableSlots.length > 0 ? (
                    <>
                      {/* Группировка слотов по датам для красивой подачи */}
                      <div className="space-y-3">
                        {(() => {
                          const grouped = {}
                          availableSlots.forEach(slot => {
                            const datePart = slot.split(', ')[0]
                            if (!grouped[datePart]) grouped[datePart] = []
                            grouped[datePart].push(slot)
                          })
                          return Object.entries(grouped).map(([date, slots], di) => (
                            <div key={date} className="space-y-2">
                              <div className="flex items-center gap-2 px-1">
                                <div className="w-px h-5 bg-slate-200 rounded-full" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {date === 'Завтра' || date.includes('.') ? date : date}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
                                {slots.map((slot, si) => {
                                  const isSelected = selectedDateTime === slot
                                  const isWaitlisted = waitlistSlots.has(slot)
                                  return (
                                    <div key={slot} className="flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => handleSelectDateTime(slot)}
                                        disabled={isTyping}
                                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                                          isSelected
                                            ? 'bg-indigo-600 text-white border border-indigo-500 shadow-lg shadow-indigo-500/30'
                                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
                                        }`}
                                      >
                                        {slot.split(', ')[1]}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleWaitlistToggle(slot)
                                        }}
                                        disabled={isTyping}
                                        title={isWaitlisted ? 'Уже подписаны на уведомление' : 'Сообщить если освободится раньше'}
                                        className={`p-1.5 rounded-lg transition-all ${
                                          isWaitlisted
                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                            : 'bg-white text-slate-400 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200'
                                        }`}
                                      >
                                        <Bell className={`w-3.5 h-3.5 ${isWaitlisted ? 'animate-pulse' : ''}`} />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="py-4 px-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-amber-800">Нет свободных окон</span>
                      </div>
                      <p className="text-[10px] text-amber-700">
                        Все окна на ближайшую неделю заняты. Подпишитесь ниже, и мы сообщим, когда освободится удобное время.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* МОДАЛКА: ПОДПИСКА НА ОСВОБОЖДЕНИЕ СЛОТА */}
          {showWaitlistModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in zoom-in duration-300">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm">Сообщить, если освободится</h3>
                  <button onClick={() => setShowWaitlistModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mb-4">
                  Вы подпишетесь на слот <span className="font-bold text-indigo-600">{waitlistSlot}</span>. Как только он освободится — вы получите уведомление в браузере.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Ваше имя</label>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => {
                        setNameInput(e.target.value)
                        setClientName(e.target.value)
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Телефон</label>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => {
                        const formatted = formatPhone(e.target.value)
                        setPhoneInput(formatted)
                        setClientPhone(formatted)
                      }}
                      placeholder="+7 (999) 000-00-00"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => handleWaitlistSubmit(waitlistSlot)}
                    disabled={waitlistLoading || !nameInput.trim() || !isPhoneValid(phoneInput)}
                    className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-md disabled:opacity-50 active:scale-95"
                  >
                    {waitlistLoading ? 'Оформляем...' : 'Подписаться на уведомление 🔔'}
                  </button>
                  <button
                    onClick={() => setShowWaitlistModal(false)}
                    className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* КНОПКА ОЖИДАНИЯ СВОБОДНОГО ОКНА (если нет слотов) */}
          {availableSlots.length === 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <button
                onClick={() => setShowWaitlistModal(true)}
                disabled={!nameInput.trim() || !phoneInput.trim()}
                className="w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-sm border border-indigo-100 hover:bg-indigo-100 disabled:opacity-50"
              >
                {nameInput.trim() && phoneInput.trim()
                  ? 'Я хочу слот первым — подписаться на уведомление 🔔'
                  : 'Введите имя и телефон, чтобы подписаться'}
              </button>
            </div>
          )}

          {/* ШАГ 3: ВВОД ИМЕНИ КЛИЕНТА */}
          {step === 3 && (
            <form onSubmit={handleSubmitName} className="space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Как к вам обращаться:
                </span>
                <span className="text-[10px] text-rose-500 font-semibold">* обязательно</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={nameInputRef}
                    type="text"
                    required
                    placeholder="Ваше имя"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    disabled={isTyping}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-300 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!nameInput.trim() || isTyping}
                  className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md active:scale-95 disabled:opacity-40"
                >
                  Далее →
                </button>
              </div>
            </form>
          )}

          {/* ШАГ 4: СТРОГИЙ ВВОД ТЕЛЕФОНА */}
          {step === 4 && (
            <form onSubmit={handleSubmitPhone} className="space-y-2 animate-in fade-in duration-200">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Телефон для подтверждения:
                </span>
                <span className={`text-[10px] font-semibold ${isPhoneValid(phoneInput) ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {isPhoneValid(phoneInput) ? 'Номер корректен ✓' : 'минимум 10 цифр'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    required
                    placeholder="+7 (999) 000-00-00"
                    value={phoneInput}
                    onChange={handlePhoneChange}
                    disabled={isTyping}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-300 rounded-2xl text-xs sm:text-sm font-mono text-slate-800 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!isPhoneValid(phoneInput) || isTyping}
                  className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md active:scale-95 disabled:opacity-40"
                >
                  Далее →
                </button>
              </div>
            </form>
          )}

          {/* ШАГ 5: ИТОГОВАЯ КНОПКА ОТПРАВКИ */}
          {step === 5 && bookingStatus !== 'pending' && bookingStatus !== 'confirmed' && (
            <div className="space-y-2 animate-in fade-in duration-200">
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting || slotConflict}
                className={`w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold text-sm sm:text-base shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${slotConflict ? 'bg-slate-400 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Отправка заявки...</span>
                  </>
                ) : (
                  <span>Отправить заявку мастеру ✅</span>
                )}
              </button>
              <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                <button
                  type="button"
                  onClick={handleResetChat}
                  className="hover:text-indigo-600"
                >
                  ← Начать сначала
                </button>
                <span>Сверка с блокнотом 📒</span>
              </div>
            </div>
          )}

          {/* ШАГ 6: СТАТУС БРОНИРОВАНИЯ */}
          {step === 6 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1 animate-in fade-in duration-200">
              {bookingStatus === 'confirmed' ? (
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Ваша запись подтверждена мастером!</span>
                </div>
              ) : bookingStatus === 'cancelled' ? (
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-700">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Окно занято. Выберите другое время выше</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-800">
                  <Clock className="w-4 h-4 text-amber-600 animate-spin-slow" />
                  <span>Ожидаем подтверждения мастера... (автопроверка каждые 2с)</span>
                </div>
              )}
            </div>
          )}

          {/* Подвал */}
          <div className="mt-2 text-center text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
            <span>Powered by</span>
            <span className="font-bold text-slate-700">МастерБосс</span>
            <span>•</span>
            <span>Онлайн-запись 24/7</span>
          </div>
        </footer>

      </div>
    </div>
  )
}
