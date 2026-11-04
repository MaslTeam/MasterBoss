import React from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, MessageCircle, CalendarCheck, Wallet, Bell, Check } from 'lucide-react'
import { getSession } from '../api'

const STEPS = [
  ['Создайте страницу', 'Имя, ниша и PIN — услуги с ценами подставятся сами'],
  ['Отправьте ссылку', 'В профиль Telegram, MAX или Instagram и в ответ на «а когда можно?»'],
  ['Подтверждайте записи', 'Клиент выбирает свободное окно, вам остаётся нажать «Подтвердить»']
]

const FEATURES = [
  [MessageCircle, 'Запись без переписки', 'Клиент видит только свободные окна с учётом длительности услуги'],
  [CalendarCheck, 'Ваш график', 'Рабочие дни и часы, никаких двойных записей'],
  [Bell, 'Напоминания', 'Push клиенту перед визитом и мягкое «пора вернуться»'],
  [Wallet, 'Касса без таблиц', 'Доход сам после визита, расходы — фразой: «взяла базы на 3200»']
]

const PLANS = [
  ['Старт', '0 ₽', ['Страница записи', 'До 30 записей в месяц', 'Касса и напоминания']],
  ['Мастер', '790 ₽', ['Без лимита записей', 'ИИ-помощник GigaChat', 'Аудит бизнеса за месяц'], true],
  ['Студия', '1 490 ₽', ['До 3 мастеров', 'Общая касса', 'Приоритетная поддержка']]
]

export default function Landing() {
  const loggedIn = Boolean(getSession().token)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-black">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          МастерБосс
        </div>
        <Link to="/app" className="px-3.5 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 rounded-xl hover:bg-purple-50">
          {loggedIn ? 'Кабинет' : 'Войти'}
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-4">
        <section className="pt-6 pb-10 sm:pt-12 sm:pb-14 text-center">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight max-w-2xl mx-auto">
            Отвечает клиентам, пока вы работаете
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
            Онлайн-запись, напоминания и касса для частного мастера. Без переписки в мессенджерах и бумажного блокнота.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              to="/register"
              className="px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-purple-600/20"
            >
              Создать страницу бесплатно
            </Link>
            <Link
              to="/demo"
              className="px-5 py-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 font-bold text-sm rounded-xl"
            >
              Открыть демо-кабинет
            </Link>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Без карты и договора. Или{' '}
            <Link to="/c/demo" className="font-bold text-purple-700 hover:underline">запишитесь как клиент</Link>
            {' '}в демо-салон.
          </p>
        </section>

        <section className="grid sm:grid-cols-3 gap-3 pb-10">
          {STEPS.map(([title, text], i) => (
            <div key={title} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card">
              <div className="text-xs font-black text-purple-600 mb-1">Шаг {i + 1}</div>
              <div className="font-bold text-sm">{title}</div>
              <div className="text-xs text-slate-500 mt-1">{text}</div>
            </div>
          ))}
        </section>

        <section className="pb-10">
          <h2 className="text-xl sm:text-2xl font-black mb-4">Что внутри</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map(([Icon, title, text]) => (
              <div key={title} className="flex gap-3 bg-white rounded-2xl p-4 border border-slate-100">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-purple-600" />
                </span>
                <div>
                  <div className="font-bold text-sm">{title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-12">
          <h2 className="text-xl sm:text-2xl font-black mb-4">Тарифы</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {PLANS.map(([name, price, items, featured]) => (
              <div
                key={name}
                className={`rounded-2xl p-4 border ${featured ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-slate-100'}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-sm">{name}</span>
                  <span className="font-black text-lg">{price}<span className="text-xs font-semibold opacity-70"> / мес</span></span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {items.map(item => (
                    <li key={item} className="flex items-center gap-1.5 text-xs">
                      <Check className={`w-3.5 h-3.5 shrink-0 ${featured ? 'text-white' : 'text-purple-600'}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-5 text-center text-[11px] text-slate-400">
        МастерБосс · сервис для частных мастеров
      </footer>
    </div>
  )
}
