import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { TICKET_TYPES, PRIORITIES } from '../lib/constants'
import { ArrowLeft, Save } from 'lucide-react'

export default function NewTicket() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [categories, setCategories] = useState([])
  const [companies, setCompanies] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    subject: '',
    description: '',
    ticket_type: 'support',
    priority: 'p3_medium',
    company_id: '',
    company_name: '',
    user_id: '',
    user_name: '',
    user_email: '',
    product: 'finsage',
    module_code: '',
    page_code: '',
    transaction_ref: '',
    error_ref: '',
    app_version: '',
    category_id: '',
    assigned_agent_id: '',
  })

  useEffect(() => {
    Promise.all([
      api.get('/settings/agents').catch(() => []),
      api.get('/settings/categories').catch(() => []),
      api.get('/customers?per_page=100').catch(() => []),
    ]).then(([a, c, co]) => {
      setAgents((a || []).filter(x => x.is_active))
      setCategories((c || []).filter(x => x.is_active))
      setCompanies(co.customers || [])
    })
  }, [])

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleCompanyChange = (companyId) => {
    const c = companies.find(x => x.company_id == companyId)
    setForm(prev => ({
      ...prev,
      company_id: companyId || '',
      company_name: c?.company_name || '',
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = { ...form }
      // Convert empty strings to null for numeric fields
      if (!payload.company_id) payload.company_id = null
      else payload.company_id = parseInt(payload.company_id)
      if (!payload.user_id) payload.user_id = null
      else payload.user_id = parseInt(payload.user_id)
      if (!payload.category_id) payload.category_id = null
      else payload.category_id = parseInt(payload.category_id)
      if (!payload.assigned_agent_id) delete payload.assigned_agent_id
      else payload.assigned_agent_id = parseInt(payload.assigned_agent_id)

      const ticket = await api.post('/tickets', payload)
      navigate(`/control/tickets/${ticket.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate('/control/tickets')}
        className="flex items-center gap-1.5 text-sm text-surface-300 hover:text-surface-100 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to tickets
      </button>

      <h1 className="text-xl font-bold text-surface-100 mb-6">Create New Ticket</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Ticket Type</label>
            <select
              value={form.ticket_type}
              onChange={(e) => set('ticket_type', e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Company</label>
            <select
              value={form.company_id}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              <option value="">— Select Company —</option>
              {companies.map(c => (
                <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => set('category_id', e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              <option value="">— Select Category —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Assign to */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Assign To</label>
            <select
              value={form.assigned_agent_id}
              onChange={(e) => set('assigned_agent_id', e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.display_name}</option>
              ))}
            </select>
          </div>

          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1">Product</label>
            <select
              value={form.product}
              onChange={(e) => set('product', e.target.value)}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 focus:outline-none focus:border-accent"
            >
              <option value="finsage">FinSage</option>
              <option value="nexus">FinSage Nexus</option>
            </select>
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1">Subject</label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            placeholder="Brief description of the issue"
            required
            className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-surface-200 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Detailed description of the issue..."
            required
            rows={5}
            className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent resize-none"
          />
        </div>

        {/* Support Context section */}
        <details className="bg-surface-800 rounded-xl border border-surface-600">
          <summary className="px-4 py-3 text-sm font-medium text-surface-200 cursor-pointer hover:text-surface-100">
            Support Context (optional)
          </summary>
          <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">Module</label>
              <input type="text" value={form.module_code} onChange={(e) => set('module_code', e.target.value)}
                placeholder="e.g. general_ledger"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Page</label>
              <input type="text" value={form.page_code} onChange={(e) => set('page_code', e.target.value)}
                placeholder="e.g. journal_entry"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Transaction Reference</label>
              <input type="text" value={form.transaction_ref} onChange={(e) => set('transaction_ref', e.target.value)}
                placeholder="e.g. JV-2026-00452"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Error Reference</label>
              <input type="text" value={form.error_ref} onChange={(e) => set('error_ref', e.target.value)}
                placeholder="e.g. ERR-91X72"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">App Version</label>
              <input type="text" value={form.app_version} onChange={(e) => set('app_version', e.target.value)}
                placeholder="e.g. 3.4.2"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Reporter Name</label>
              <input type="text" value={form.user_name} onChange={(e) => set('user_name', e.target.value)}
                placeholder="Customer name"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs text-surface-400 mb-1">Reporter Email</label>
              <input type="email" value={form.user_email} onChange={(e) => set('user_email', e.target.value)}
                placeholder="Customer email"
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent" />
            </div>
          </div>
        </details>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/control/tickets')}
            className="px-4 py-2 text-sm text-surface-200 hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors"
          >Cancel</button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}