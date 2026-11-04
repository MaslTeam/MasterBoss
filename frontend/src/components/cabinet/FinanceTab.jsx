import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '../../api'
import { Icon, Button, Sheet, Spinner, Empty } from '../ui'
import { TabHeader } from './shared'
import { rub, num, MONTHS } from '../../utils/format'

const EXPENSE_CATEGORIES = [
  'Материалы (базы, топы, гель-лаки)',
  'Аренда кабинета / места',
  'Стерилизация и крафт-пакеты',
  'Реклама',
  'Обучение',
  'Прочее',
]
const INCOME_CATEGORIES = ['Услуга вне записи', 'Продажа товара', 'Чаевые', 'Прочее']

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default function FinanceTab({ toast }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [data, setData] = useState(null)
  const [phrase, setPhrase] = useState('')
  const [parsing, setParsing] = useState(false)
  const [editor, setEditor] = useState(null)   // { mode: 'new'|'edit', type, amount, category, source, id, hint }
  const [audit, setAudit] = useState(null)     // { loading, text, source }

  const load = useCallback(async () => {
    try {
      setData(await apiJson(`/api/app/finance?month=${monthKey(month)}`))
    } catch (err) {
      toast(err.message, 'error')
    }
  }, [month, toast])

  useEffect(() => { setData(null); load() }, [load])

  const isCurrentMonth = monthKey(month) === monthKey(new Date())
  const shiftMonth = (delta) => setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))

  const maxWeek = useMemo(() => Math.max(1, ...(data?.weeks || []).map(w => w.income)), [data])

  const parsePhrase = async (e) => {
    e.preventDefault()
    if (phrase.trim().length < 2) return
    setParsing(true)
    try {
      const res = await apiJson('/api/app/ai/parse-expense', { method: 'POST', body: { phrase: phrase.trim() } })
      setEditor({
        mode: 'new', type: 'expense', amount: String(Math.round(res.amount)), category: res.category, source: 'ai',
        hint: res.source === 'gigachat' ? `GigaChat понял «${res.raw_phrase}» так — проверьте` : `Распознано по шаблону из «${res.raw_phrase}» — проверьте`,
      })
      setPhrase('')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setParsing(false)
    }
  }

  const runAudit = async () => {
    setAudit({ loading: true })
    try {
      const res = await apiJson('/api/app/ai/business-audit', { method: 'POST' })
      setAudit({ loading: false, text: res.audit_text, source: res.source })
    } catch (err) {
      setAudit(null)
      toast(err.message, 'error')
    }
  }

  return (
    <div className="pb-6">
      <TabHeader
        title="Касса"
        action={
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Предыдущий месяц" onClick={() => shiftMonth(-1)} className="w-10 h-10 rounded-full border border-silver bg-white flex items-center justify-center hover:border-ink"><Icon name="left" size={16} stroke={2.2} /></button>
            <span className="min-w-[92px] text-center text-[13px] font-extrabold">{MONTHS[month.getMonth()]}{month.getFullYear() !== new Date().getFullYear() ? ` ${month.getFullYear()}` : ''}</span>
            <button type="button" aria-label="Следующий месяц" disabled={isCurrentMonth} onClick={() => shiftMonth(1)} className="w-10 h-10 rounded-full border border-silver bg-white flex items-center justify-center hover:border-ink disabled:opacity-30"><Icon name="right" size={16} stroke={2.2} /></button>
          </div>
        }
      />

      {!data ? (
        <div className="py-16 flex justify-center text-muted"><Spinner /></div>
      ) : (
        <>
          <div className="mx-5 mt-4 p-5 rounded-[26px] bg-ink text-white relative overflow-hidden mb-in">
            <span aria-hidden="true" className="absolute -right-[30px] -top-[30px] w-[120px] h-[120px] rounded-full bg-sun" />
            <div className="relative text-[13px] text-onink font-semibold">Прибыль за месяц</div>
            <div className="relative font-display font-bold text-[34px] tracking-[-0.03em] mt-1.5">{rub(data.profit)}</div>
            <div className="relative grid grid-cols-3 gap-2 mt-[18px]">
              <div><div className="text-[11px] text-onink">Доход</div><div className="font-extrabold text-[15px] mt-0.5">{num(data.income)}</div></div>
              <div><div className="text-[11px] text-onink">Расход</div><div className="font-extrabold text-[15px] mt-0.5">{num(data.expense)}</div></div>
              <div><div className="text-[11px] text-onink">Налог 4%</div><div className="font-extrabold text-[15px] mt-0.5">{num(data.tax)}</div></div>
            </div>
          </div>

          <div className="mx-5 mt-2.5 px-[18px] py-4 bg-white border border-silver mb-in mb-d2">
            <div className="text-xs font-bold text-muted">Доход по неделям</div>
            <div className="h-[104px] mt-3 border-b border-ink grid grid-cols-4 gap-3.5 items-end">
              {data.weeks.map(w => {
                const top = w.income === maxWeek && w.income > 0
                return (
                  <div key={w.label} className="flex flex-col items-center gap-1.5">
                    <span className={`text-[11px] ${top ? 'font-extrabold' : 'font-bold'}`}>{w.income ? num(w.income) : '—'}</span>
                    <span className={`w-full transition-[height] duration-700 ease-out ${top ? 'bg-sun' : 'bg-silverline'}`} style={{ height: `${Math.max(4, Math.round((w.income / maxWeek) * 66))}px` }} />
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-4 gap-3.5 mt-1.5 text-center text-[10px] text-muted">{data.weeks.map(w => <span key={w.label}>{w.label}</span>)}</div>
          </div>
        </>
      )}

      <form onSubmit={parsePhrase} className="mx-5 mt-2.5 pl-[18px] pr-1.5 py-1.5 rounded-full bg-white border-[1.5px] border-ink flex items-center gap-2.5 focus-within:ring-[3px] focus-within:ring-sun/60 transition-shadow mb-in mb-d3">
        <label htmlFor="ai-phrase" className="sr-only">Расход фразой</label>
        <input
          id="ai-phrase"
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          placeholder="«взяла базы и топы на 3200»"
          className="flex-1 min-w-0 border-0 p-0 text-sm bg-transparent focus:shadow-none"
        />
        <button type="submit" aria-label="Распознать расход" disabled={parsing} className="w-11 h-11 shrink-0 rounded-full bg-ink text-sun flex items-center justify-center">
          {parsing ? <Spinner /> : <Icon name="spark" size={18} stroke={2} />}
        </button>
      </form>

      <div className="px-6 pt-[18px] pb-2 flex justify-between items-center">
        <span className="text-xs font-extrabold text-graphite uppercase tracking-[0.12em]">Операции</span>
        <button type="button" onClick={() => setEditor({ mode: 'new', type: 'expense', amount: '', category: EXPENSE_CATEGORIES[0], source: 'manual' })} className="h-9 px-3 rounded-full text-[13px] font-bold hover:bg-white">
          + Вручную
        </button>
      </div>

      <div className="mx-5">
        {data && (data.transactions.length ? (
          <div className="rounded-[22px] bg-white px-4 py-1 mb-in mb-d4">
            {data.transactions.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setEditor({ mode: 'edit', id: t.id, type: t.type, amount: String(Math.round(t.amount)), category: t.category, source: t.source })}
                className={`w-full text-left flex items-center gap-3 py-3 rounded-none hover:bg-cream ${i < data.transactions.length - 1 ? 'border-b border-[#E4E5E8]' : ''}`}
              >
                <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-extrabold ${t.type === 'income' ? 'bg-sunsoft' : 'bg-[#E4E5E8]'}`}>{t.type === 'income' ? '+' : '−'}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-sm truncate">
                    {t.category}
                    {t.source === 'ai' && <span className="ml-1.5 px-[7px] py-0.5 rounded-full bg-ink text-sun text-[10px] font-extrabold align-[2px]">ИИ</span>}
                  </span>
                  <span className="block text-xs text-muted">{new Date(t.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}{t.source === 'booking' ? ' · после визита' : ''}</span>
                </span>
                <span className="font-extrabold text-sm whitespace-nowrap">{t.type === 'income' ? '+' : '−'}{num(t.amount)}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="Операций за месяц нет" text="Доход появится сам, когда отметите «Пришла». Расход можно записать фразой выше." />
        ))}
      </div>

      <div className="mx-5 mt-4">
        <Button variant="outline" className="w-full" onClick={runAudit}><Icon name="spark" size={18} /> Разбор месяца от GigaChat</Button>
      </div>

      <TransactionSheet editor={editor} setEditor={setEditor} toast={toast} onSaved={load} />

      <Sheet open={Boolean(audit)} onClose={() => setAudit(null)} title="Разбор месяца" subtitle={audit?.source === 'gigachat' ? 'Составил GigaChat по вашим цифрам' : audit?.loading ? '' : 'Шаблонный разбор: GigaChat сейчас недоступен'}>
        {audit?.loading ? (
          <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted"><Spinner /> Считаем цифры месяца…</div>
        ) : (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{audit?.text}</div>
        )}
      </Sheet>
    </div>
  )
}

function TransactionSheet({ editor, setEditor, toast, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { setConfirmDelete(false) }, [editor?.id, editor?.mode])

  if (!editor) return <Sheet open={false} onClose={() => {}} title="" />
  const categories = editor.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const update = (patch) => setEditor(prev => ({ ...prev, ...patch }))
  const close = () => setEditor(null)

  const save = async () => {
    const amount = Number(String(editor.amount).replace(',', '.'))
    if (!amount || amount <= 0) return toast('Введите сумму больше нуля', 'error')
    if (!editor.category.trim()) return toast('Укажите категорию', 'error')
    setSaving(true)
    try {
      if (editor.mode === 'new') {
        await apiJson('/api/app/transaction', { method: 'POST', body: { type: editor.type, amount, category: editor.category.trim(), source: editor.source === 'ai' ? 'ai' : 'manual' } })
        toast(editor.type === 'income' ? 'Доход записан' : 'Расход записан')
      } else {
        await apiJson(`/api/app/transaction/${editor.id}`, { method: 'PUT', body: { amount, category: editor.category.trim() } })
        toast('Операция изменена')
      }
      close()
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true)
    setSaving(true)
    try {
      await apiJson(`/api/app/transaction/${editor.id}`, { method: 'DELETE' })
      toast('Операция удалена')
      close()
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const title = editor.mode === 'edit' ? 'Изменить операцию' : editor.source === 'ai' ? 'Проверьте расход' : 'Новая операция'

  return (
    <Sheet open onClose={close} title={title} subtitle={editor.hint}>
      <div className="flex flex-col gap-4">
        {editor.mode === 'new' && editor.source !== 'ai' && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-[#E4E5E8]">
            {[['expense', 'Расход'], ['income', 'Доход']].map(([type, label]) => (
              <button key={type} type="button" aria-pressed={editor.type === type}
                onClick={() => update({ type, category: (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] })}
                className={`h-10 rounded-full text-[13px] ${editor.type === type ? 'bg-white font-extrabold' : 'font-bold text-body'}`}>{label}</button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5 px-4 py-3 rounded-[18px] bg-mist text-xs font-bold text-muted focus-within:ring-[3px] focus-within:ring-sun/60">Сумма, ₽
          <input inputMode="decimal" value={editor.amount} onChange={e => update({ amount: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0"
            className="border-0 p-0 bg-transparent font-display font-bold text-[28px] text-ink focus:shadow-none" autoFocus={editor.mode === 'new' && editor.source !== 'ai'} />
        </label>
        <div>
          <div className="text-xs font-bold text-muted mb-2">Категория</div>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <button key={c} type="button" aria-pressed={editor.category === c} onClick={() => update({ category: c })}
                className={`px-3.5 py-2 rounded-full border text-[13px] font-bold ${editor.category === c ? 'bg-ink text-white border-ink' : 'bg-white border-silver hover:border-ink'}`}>{c}</button>
            ))}
          </div>
          {!categories.includes(editor.category) && (
            <input value={editor.category} onChange={e => update({ category: e.target.value })} aria-label="Своя категория"
              className="mt-2 w-full px-4 py-3 rounded-[18px] border-0 bg-mist text-sm font-semibold" />
          )}
        </div>
        <Button variant="sun" size="lg" loading={saving} onClick={save} className="w-full">Сохранить</Button>
        {editor.mode === 'edit' && (
          <Button variant={confirmDelete ? 'dark' : 'danger'} onClick={remove} disabled={saving} className={`w-full ${confirmDelete ? '!bg-danger' : ''}`}>
            <Icon name="trash" size={18} /> {confirmDelete ? 'Точно удалить?' : 'Удалить операцию'}
          </Button>
        )}
      </div>
    </Sheet>
  )
}
