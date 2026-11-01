import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { api } from '../api/client'

/**
 * Inline settlement controls for one pending/failed billing row.
 *
 * Confirm  → POST /subscriptions/<cid>/billing/<bid>/confirm
 *            (payment_reference optional — the EFT/wallet reference)
 * Mark fail→ POST /subscriptions/<cid>/billing/<bid>/fail
 *            (reason required — stored in the billing row + audit log)
 *
 * onDone is called after a successful action so the parent can reload.
 */
export default function SettleInline({ companyId, billingId, onDone }) {
  const [mode, setMode] = useState(null) // null | 'confirm' | 'fail'
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const open = (m) => {
    setMode(m)
    setValue('')
    setError('')
  }

  const close = () => {
    if (busy) return
    setMode(null)
    setValue('')
    setError('')
  }

  const submit = async () => {
    if (mode === 'fail' && !value.trim()) {
      setError('A failure reason is required.')
      return
    }

    setBusy(true)
    setError('')

    try {
      if (mode === 'confirm') {
        await api.post(
          `/subscriptions/${companyId}/billing/${billingId}/confirm`,
          { payment_reference: value.trim() || null }
        )
      } else {
        await api.post(
          `/subscriptions/${companyId}/billing/${billingId}/fail`,
          { reason: value.trim() }
        )
      }

      setMode(null)
      setValue('')
      onDone && onDone()
    } catch (err) {
      setError(err?.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (!mode) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => open('confirm')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
        >
          <CheckCircle2 size={14} />
          Confirm payment
        </button>

        <button
          type="button"
          onClick={() => open('fail')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-error/10 text-error hover:bg-error/20 transition-colors"
        >
          <XCircle size={14} />
          Mark failed
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <input
        type="text"
        autoFocus
        disabled={busy}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') close()
        }}
        placeholder={
          mode === 'confirm'
            ? 'Payment reference (EFT / wallet ref) — optional'
            : 'Failure reason — required'
        }
        className="flex-1 min-w-0 bg-surface-900 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent"
      />

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mode === 'confirm'
              ? 'bg-success text-surface-950 hover:bg-success/80'
              : 'bg-error text-surface-100 hover:bg-error/80'
          } disabled:opacity-50`}
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {mode === 'confirm' ? 'Confirm' : 'Record failure'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={close}
          className="px-2.5 py-1.5 rounded-lg text-xs text-surface-400 hover:text-surface-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      {error && (
        <span className="text-xs text-error sm:basis-full">{error}</span>
      )}
    </div>
  )
}
