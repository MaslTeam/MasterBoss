// Push-подписка браузера (мастера или клиента)

export const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID_KEY)
}

function urlBase64ToUint8Array(base64String) {
  const clean = base64String.trim()
  const padding = '='.repeat((4 - clean.length % 4) % 4)
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}

function bufferToBase64(buffer) {
  if (!buffer) return ''
  return window.btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

// Возвращает данные подписки для POST /api/app/notifications/push-subscribe
// или бросает ошибку с понятным текстом.
export async function getPushSubscription() {
  if (!pushSupported()) throw new Error('Этот браузер не поддерживает уведомления')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Уведомления запрещены в настройках браузера')
  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    })
  }
  return {
    endpoint: sub.endpoint,
    p256dh: bufferToBase64(sub.getKey('p256dh')),
    auth: bufferToBase64(sub.getKey('auth')),
    user_agent: navigator.userAgent,
  }
}

// Адрес уже оформленной подписки (без запроса разрешения) или null
export async function currentPushEndpoint() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return null
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    return sub ? sub.endpoint : null
  } catch {
    return null
  }
}
