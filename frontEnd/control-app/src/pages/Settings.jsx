import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { PRIORITIES } from '../lib/constants'
import {
  Users, Shield, Tag, Clock, Plus, Save, X, Edit2, Trash2
} from 'lucide-react'

const TABS = [
  { key: 'agents', label: 'Agents', icon: Users },
  { key: 'teams', label: 'Teams', icon: Shield },
  { key: 'categories', label: 'Categories', icon: Tag },
  { key: 'slas', label: 'SLAs', icon: Clock },
]

export default function Settings() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('agents')
  const [agents, setAgents] = useState([])
  const [teams, setTeams] = useState([])
  const [categories, setCategories] = useState([])
  const [slas, setSlas] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [a, t, c, s] = await Promise.all([
        api.get('/settings/agents?include_inactive=true').catch(() => []),
        api.get('/settings/teams').catch(() => []),
        api.get('/settings/categories').catch(() => []),
        api.get('/settings/slas').catch(() => []),
      ])
      setAgents(a || [])
      setTeams(t || [])
      setCategories(c || [])
      setSlas(s || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-surface-100 mb-6">Settings</h1>

      <div className="flex border-b border-surface-600 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-surface-300 hover:text-surface-100'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-sm text-surface-400">Loading...</div> : (
        <div>
          {tab === 'agents' && <AgentsTab agents={agents} teams={teams} onRefresh={fetchAll} isAdmin={isAdmin} />}
          {tab === 'teams' && <TeamsTab teams={teams} onRefresh={fetchAll} isAdmin={isAdmin} />}
          {tab === 'categories' && <CategoriesTab categories={categories} onRefresh={fetchAll} isAdmin={isAdmin} />}
          {tab === 'slas' && <SlasTab slas={slas} onRefresh={fetchAll} isAdmin={isAdmin} />}
        </div>
      )}
    </div>
  )
}

// ── AGENTS TAB ──
function AgentsTab({ agents, teams, onRefresh, isAdmin }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ user_id: '', display_name: '', role: 'agent', team_id: '', max_tickets: 15 })
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/settings/agents', {
        user_id: parseInt(form.user_id),
        display_name: form.display_name,
        role: form.role,
        team_id: form.team_id ? parseInt(form.team_id) : null,
        max_tickets: parseInt(form.max_tickets),
      })
      setShowForm(false)
      setForm({ user_id: '', display_name: '', role: 'agent', team_id: '', max_tickets: 15 })
      onRefresh()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {isAdmin && (
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-lg mb-4 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Agent
        </button>
      )}

      {showForm && (
        <form onSubmit={create} className="bg-surface-800 rounded-xl border border-surface-600 p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">FinSage User ID</label>
              <input type="number" required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Display Name</label>
              <input type="text" required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent">
                <option value="admin">Admin</option>
                <option value="senior_agent">Senior Agent</option>
                <option value="agent">Agent</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Team</label>
              <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent">
                <option value="">None</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex items-center gap-1 bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
              <Save className="w-3 h-3" /> Save
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-surface-300 hover:text-surface-100 px-3 py-1.5">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-600 text-xs text-surface-400 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Team</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-600">
            {agents.map(a => (
              <tr key={a.id} className="hover:bg-surface-700/30">
                <td className="px-4 py-2.5 text-sm text-surface-100 font-medium">{a.display_name}</td>
                <td className="px-4 py-2.5 text-sm text-surface-300">{a.user_email}</td>
                <td className="px-4 py-2.5"><span className="text-xs capitalize bg-surface-600 text-surface-200 px-2 py-0.5 rounded">{a.role?.replace('_', ' ')}</span></td>
                <td className="px-4 py-2.5 text-sm text-surface-300">{a.team_name || '—'}</td>
                <td className="px-4 py-2.5 text-center"><span className={`w-2 h-2 rounded-full inline-block ${a.is_active ? 'bg-success' : 'bg-p1'}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── TEAMS TAB ──
function TeamsTab({ teams, onRefresh, isAdmin }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/settings/teams', form)
      setShowForm(false)
      setForm({ name: '', description: '' })
      onRefresh()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      {isAdmin && (
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-lg mb-4">
          <Plus className="w-4 h-4" /> Add Team
        </button>
      )}
      {showForm && (
        <form onSubmit={create} className="bg-surface-800 rounded-xl border border-surface-600 p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">Name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex items-center gap-1 bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
              <Save className="w-3 h-3" /> Save
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-surface-300 hover:text-surface-100 px-3 py-1.5">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-3">
        {teams.map(t => (
          <div key={t.id} className="bg-surface-800 rounded-xl border border-surface-600 p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-surface-100">{t.name}</div>
              <div className="text-xs text-surface-400">{t.description || 'No description'} &middot; {t.agent_count} agent{t.agent_count !== 1 ? 's' : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CATEGORIES TAB ──
function CategoriesTab({ categories, onRefresh, isAdmin }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/settings/categories', { ...form, sort_order: parseInt(form.sort_order) })
      setShowForm(false)
      setForm({ name: '', description: '', sort_order: 0 })
      onRefresh()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      {isAdmin && (
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-lg mb-4">
          <Plus className="w-4 h-4" /> Add Category
        </button>
      )}
      {showForm && (
        <form onSubmit={create} className="bg-surface-800 rounded-xl border border-surface-600 p-4 mb-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs text-surface-400 mb-1">Name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-surface-400 mb-1">Sort Order</label>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex items-center gap-1 bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50">
              <Save className="w-3 h-3" /> Save
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-surface-300 hover:text-surface-100 px-3 py-1.5">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-surface-800 rounded-xl border border-surface-600 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-600 text-xs text-surface-400 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="text-center px-4 py-3 font-medium">Tickets</th>
              <th className="text-center px-4 py-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-600">
            {categories.map(c => (
              <tr key={c.id} className="hover:bg-surface-700/30">
                <td className="px-4 py-2.5 text-sm text-surface-100 font-medium">{c.name}</td>
                <td className="px-4 py-2.5 text-xs text-surface-400 max-w-xs truncate">{c.description}</td>
                <td className="px-4 py-2.5 text-center text-sm text-surface-300">{c.ticket_count || 0}</td>
                <td className="px-4 py-2.5 text-center"><span className={`w-2 h-2 rounded-full inline-block ${c.is_active ? 'bg-success' : 'bg-p1'}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── SLAS TAB ──
function SlasTab({ slas, onRefresh, isAdmin }) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const startEdit = (sla) => {
    setEditing(sla.id)
    setForm({ response_minutes: sla.response_minutes, resolution_hours: sla.resolution_hours })
  }

  const save = async (id) => {
    setSaving(true)
    try {
      await api.put(`/settings/slas/${id}`, {
        response_minutes: parseInt(form.response_minutes),
        resolution_hours: parseInt(form.resolution_hours),
      })
      setEditing(null)
      onRefresh()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="grid gap-3">
      {slas.map(sla => {
        const p = PRIORITIES.find(pr => pr.value === sla.priority)
        return (
          <div key={sla.id} className="bg-surface-800 rounded-xl border border-surface-600 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <PriorityDot priority={p} />
                <span className={`text-sm font-semibold ${p?.color}`}>{sla.name}</span>
              </div>
              {isAdmin && editing !== sla.id && (
                <button onClick={() => startEdit(sla)} className="text-xs text-accent hover:text-accent-hover">Edit</button>
              )}
            </div>
            {editing === sla.id ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-400">Response (min):</label>
                  <input type="number" value={form.response_minutes} onChange={(e) => setForm({ ...form, response_minutes: e.target.value })}
                    className="w-20 bg-surface-700 border border-surface-500 rounded px-2 py-1 text-sm text-surface-100 focus:outline-none focus:border-accent" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-surface-400">Resolution (hrs):</label>
                  <input type="number" value={form.resolution_hours} onChange={(e) => setForm({ ...form, resolution_hours: e.target.value })}
                    className="w-20 bg-surface-700 border border-surface-500 rounded px-2 py-1 text-sm text-surface-100 focus:outline-none focus:border-accent" />
                </div>
                <button onClick={() => save(sla.id)} disabled={saving} className="text-xs bg-accent text-white px-2 py-1 rounded">Save</button>
                <button onClick={() => setEditing(null)} className="text-xs text-surface-300 px-2 py-1">Cancel</button>
              </div>
            ) : (
              <div className="flex gap-6 text-xs text-surface-400">
                <span>Response: <span className="text-surface-200 font-medium">{sla.response_minutes} min</span></span>
                <span>Resolution: <span className="text-surface-200 font-medium">{sla.resolution_hours} hrs</span></span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PriorityDot({ priority }) {
  if (!priority) return null
  return <span className={`w-3 h-3 rounded-full ${priority.dot}`} />
}
