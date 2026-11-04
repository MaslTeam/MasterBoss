// Общие настройки API и сессии мастера

export const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL
  : (import.meta.env.DEV ? 'http://localhost:8000' : '')

const TOKEN_KEY = 'mb_token'
const SLUG_KEY = 'mb_master_slug'
const NAME_KEY = 'mb_master_name'

export function getSession() {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY) || '',
      slug: localStorage.getItem(SLUG_KEY) || '',
      name: localStorage.getItem(NAME_KEY) || ''
    }
  } catch {
    return { token: '', slug: '', name: '' }
  }
}

export function saveSession({ token, slug, name }) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(SLUG_KEY, slug)
    localStorage.setItem(NAME_KEY, name || '')
  } catch { /* приватный режим браузера */ }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    // slug оставляем, чтобы подставить его в форму входа
  } catch { /* приватный режим браузера */ }
}

// fetch с токеном мастера. При 401 сессия сбрасывается, кабинет показывает вход.
export async function apiFetch(url, options = {}) {
  const { token } = getSession()
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401) {
    clearSession()
    window.dispatchEvent(new Event('mb-logout'))
  }
  return res
}

// Транслитерация имени в адрес страницы: «Анна Nails» → «anna-nails»
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
}

export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .split('')
    .map(ch => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '')
}
