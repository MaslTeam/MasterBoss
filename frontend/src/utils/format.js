// Форматирование чисел, дат и текста для интерфейса

export function rub(value, { sign = false } = {}) {
  const n = Math.round(Number(value) || 0)
  const abs = Math.abs(n).toLocaleString('ru-RU').replace(/ /g, ' ')
  const prefix = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : (n < 0 ? '−' : '')
  return `${prefix}${abs} ₽`
}

export function num(value) {
  return Math.round(Number(value) || 0).toLocaleString('ru-RU').replace(/ /g, ' ')
}

export const WEEKDAY_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

// «05.11» → Date этого года (или следующего, если месяц уже прошёл давно)
export function parseDayMonth(dayMonth) {
  const m = /^(\d{2})\.(\d{2})$/.exec(dayMonth || '')
  if (!m) return null
  const now = new Date()
  let year = now.getFullYear()
  const month = Number(m[2]) - 1
  if (month < now.getMonth() - 6) year += 1
  return new Date(year, month, Number(m[1]))
}

// Подпись дня: «Сегодня», «Завтра», «чт, 05.11»
export function dayLabel(date) {
  const today = startOfDay(new Date())
  const diff = Math.round((startOfDay(date) - today) / 86400000)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Завтра'
  return `${WEEKDAY_SHORT[date.getDay()]}, ${dd}.${mm}`
}

export function timeOf(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function durationText(min) {
  const m = Number(min) || 0
  if (m >= 60 && m % 60 === 0) return m === 60 ? '1 час' : `${m / 60} часа`
  if (m > 60) return `${Math.floor(m / 60)} ч ${m % 60} мин`
  return `${m} мин`
}

export function agoText(date) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime())
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.round(h / 24)
  return `${d} дн назад`
}

export function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

export const REF_LABELS = { insta: 'Instagram', tg: 'Telegram', max: 'MAX', vk: 'ВКонтакте', avito: 'Авито', qr: 'QR-код' }

export function refLabel(ref) {
  if (!ref) return 'прямая ссылка'
  return REF_LABELS[ref] || ref
}

// Телефон при вводе: +7 (999) 123-45-67
export function formatPhoneInput(value) {
  let digits = (value || '').replace(/\D/g, '')
  if (digits.startsWith('8')) digits = '7' + digits.slice(1)
  if (!digits.startsWith('7')) digits = '7' + digits
  digits = digits.slice(0, 11)
  const d = digits.slice(1)
  let out = '+7'
  if (d.length) out += ' (' + d.slice(0, 3)
  if (d.length >= 3) out += ')'
  if (d.length > 3) out += ' ' + d.slice(3, 6)
  if (d.length > 6) out += '-' + d.slice(6, 8)
  if (d.length > 8) out += '-' + d.slice(8, 10)
  return out
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
