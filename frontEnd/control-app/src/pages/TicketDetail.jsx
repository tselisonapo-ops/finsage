import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import { formatDateTime, timeAgo, TICKET_STATUSES, PRIORITIES, getTicketTypeLabel } from '../lib/constants'
import {
  ArrowLeft, Send, MessageSquare, Lock, History, Save, Trash2, ChevronDown, Building2, User, Cpu, FileText, AlertCircle
} from 'lucide-react'

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [notes, setNotes] = useState([])
  const [history, setHistory] = useState([])
  const [activeTab, setActiveTab] = useState('conversation')
  const [replyBody, setReplyBody] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showStatusDrop, setShowStatusDrop] = useState(false)
  const [showAssignDrop, setShowAssignDrop] = useState(false)
  const [agents, setAgents] = useState([])
  const [categories, setCategories] = useState([])

  const fetchAll = useCallback(async () => {
    try {
      const [t, m, n, h] = await Promise.all([
        api.get(`/tickets/${id}`),
        api.get(`/tickets/${id}/messages`),
        api.get(`/tickets/${id}/notes`),
        api.get(`/tickets/${id}/history`),
      ])
      setTicket(t)
      setMessages(m || [])
      setNotes(n || [])
      setHistory(h || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    Promise.all([
      api.get('/settings/agents').catch(() => []),
      api.get('/settings/categories').catch(() => []),
    ]).then(([a, c]) => {
      setAgents(a || [])
      setCategories(c || [])
    })
  }, [])

  const updateTicket = async (data) => {
    setSaving(true)
    try {
      const updated = await api.patch(`/tickets/${id}`, data)
      setTicket(updated)
      const h = await api.get(`/tickets/${id}/history`)
      setHistory(h || [])
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
      setShowStatusDrop(false)
      setShowAssignDrop(false)
    }
  }

  const sendReply = async () => {
    if (!replyBody.trim()) return
    setSaving(true)
    try {
      const msg = await api.post(`/tickets/${id}/messages`, { body: replyBody })
      setMessages(prev => [...prev, msg])
      setReplyBody('')
      // refresh ticket for first_response_at
      const t = await api.get(`/tickets/${id}`)
      setTicket(t)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const addNote = async () => {
    if (!noteBody.trim()) return
    setSaving(true)
    try {
      const note = await api.post(`/tickets/${id}/notes`, { body: noteBody })
      setNotes(prev => [...prev, note])
      setNoteBody('')
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-surface-300">Loading ticket...</div>
  if (!ticket) return <div className="p-8 text-red-400">Ticket not found</div>

  const tabs = [
    { key: 'conversation', label: 'Conversation', icon: MessageSquare, count: messages.length },
    { key: 'internal', label: 'Internal Notes', icon: Lock, count: notes.length },
    { key: 'history', label: 'History', icon: History, count: history.length },
  ]

  const contextFields = [
    ticket.module_code && { icon: Cpu, label: 'Module', value: ticket.module_code?.replace(/_/g, ' ') },
    ticket.page_code && { icon: FileText, label: 'Page', value: ticket.page_code },
    ticket.transaction_ref && { icon: FileText, label: 'Reference', value: ticket.transaction_ref },
    ticket.error_ref && { icon: AlertCircle, label: 'Error', value: ticket.error_ref },
    ticket.app_version && { icon: Cpu, label: 'Version', value: ticket.app_version },
  ].filter(Boolean)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate('/control/tickets')}
        className="flex items-center gap-1.5 text-sm text-surface-300 hover:text-surface-100 mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to tickets
      </button>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-surface-400">{ticket.ticket_number}</span>
                <span className="text-xs text-surface-400 px-2 py-0.5 rounded bg-surface-700">
                  {getTicketTypeLabel(ticket.ticket_type)}
                </span>
              </div>
              <h1 className="text-lg font-bold text-surface-100">{ticket.subject}</h1>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-surface-600 mb-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-surface-300 hover:text-surface-100'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="text-xs bg-surface-600 rounded-full px-1.5 py-0.5">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-surface-800 rounded-b-xl border border-t-0 border-surface-600">
            {/* Conversation tab */}
            {activeTab === 'conversation' && (
              <div>
                <div className="max-h-96 overflow-auto">
                  {/* Original description */}
                  <div className="p-4 border-b border-surface-600">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                        {(ticket.user_name || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-surface-100">{ticket.user_name || 'Customer'}</span>
                        <span className="text-xs text-surface-400 ml-2">{formatDateTime(ticket.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-sm text-surface-200 whitespace-pre-wrap ml-9">{ticket.description}</div>
                  </div>

                  {messages.map(msg => (
                    <div key={msg.id} className={`p-4 border-b border-surface-600 ${msg.is_from_customer ? 'bg-surface-800' : 'bg-surface-700/30'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          msg.is_from_customer ? 'bg-blue-500/20 text-blue-400' : 'bg-accent/20 text-accent'
                        }`}>
                          {msg.sender_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-surface-100">
                            {msg.sender_name}
                          </span>
                          {!msg.is_from_customer && (
                            <span className="text-xs text-accent ml-1.5">FinSage Support</span>
                          )}
                          <span className="text-xs text-surface-400 ml-2">{formatDateTime(msg.created_at)}</span>
                        </div>
                      </div>
                      <div className="text-sm text-surface-200 whitespace-pre-wrap ml-9">{msg.body}</div>
                    </div>
                  ))}
                </div>

                {/* Reply box */}
                <div className="p-4 border-t border-surface-600">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type your reply to the customer..."
                    rows={3}
                    className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-accent resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={sendReply}
                      disabled={!replyBody.trim() || saving}
                      className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> Send Reply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Internal Notes tab */}
            {activeTab === 'internal' && (
              <div>
                <div className="max-h-96 overflow-auto">
                  {notes.length === 0 && (
                    <div className="p-8 text-center text-sm text-surface-400">No internal notes yet</div>
                  )}
                  {notes.map(note => (
                    <div key={note.id} className="p-4 border-b border-surface-600 bg-yellow-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Lock className="w-3 h-3 text-yellow-500" />
                        <span className="text-sm font-medium text-surface-100">{note.agent_name}</span>
                        <span className="text-xs text-surface-400">{formatDateTime(note.created_at)}</span>
                      </div>
                      <div className="text-sm text-surface-200 whitespace-pre-wrap ml-5">{note.body}</div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-surface-600">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Add an internal note (only visible to support team)..."
                    rows={3}
                    className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder-surface-400 focus:outline-none focus:border-yellow-500 resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={addNote}
                      disabled={!noteBody.trim() || saving}
                      className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" /> Add Note
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* History tab */}
            {activeTab === 'history' && (
              <div className="max-h-96 overflow-auto">
                {history.length === 0 && (
                  <div className="p-8 text-center text-sm text-surface-400">No history recorded</div>
                )}
                {history.map(h => (
                  <div key={h.id} className="px-4 py-3 border-b border-surface-600 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-surface-200">
                        <span className="font-medium text-surface-100">{h.changed_by_name}</span>
                        {' '}changed <span className="text-accent font-mono text-xs">{h.field}</span>
                      </span>
                      {h.old_value && (
                        <span className="text-xs text-surface-400 ml-1 line-through">{h.old_value}</span>
                      )}
                      {h.new_value && (
                        <span className="text-xs text-surface-200 ml-1">→ {h.new_value}</span>
                      )}
                    </div>
                    <span className="text-xs text-surface-400 shrink-0">{formatDateTime(h.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 shrink-0 space-y-3">
          {/* Status & Priority */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-4 space-y-3">
            {/* Status */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Status</label>
              <div className="relative">
                <button
                  onClick={() => setShowStatusDrop(!showStatusDrop)}
                  className="w-full flex items-center justify-between bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-left"
                >
                  <StatusBadge status={ticket.status} />
                  <ChevronDown className="w-4 h-4 text-surface-400" />
                </button>
                {showStatusDrop && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 max-h-48 overflow-auto">
                    {TICKET_STATUSES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => updateTicket({ status: s.value })}
                        className="w-full text-left px-3 py-1.5 text-sm text-surface-200 hover:bg-surface-600 flex items-center gap-2"
                      >
                        <span className={`w-2 h-2 rounded-full ${s.color}`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Priority</label>
              <div className="flex gap-1">
                {PRIORITIES.map(p => (
                  <button
                    key={p.value}
                    onClick={() => updateTicket({ priority: p.value })}
                    className={`flex-1 text-center py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      ticket.priority === p.value ? `${p.bg} ${p.color} ring-1 ring-current` : 'text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    {p.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned Agent */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Assigned To</label>
              <div className="relative">
                <button
                  onClick={() => setShowAssignDrop(!showAssignDrop)}
                  className="w-full flex items-center justify-between bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-left"
                >
                  <span className="text-surface-200">{ticket.agent_name || 'Unassigned'}</span>
                  <ChevronDown className="w-4 h-4 text-surface-400" />
                </button>
                {showAssignDrop && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-500 rounded-lg shadow-xl py-1 max-h-48 overflow-auto">
                    <button
                      onClick={() => updateTicket({ assigned_agent_id: null })}
                      className="w-full text-left px-3 py-1.5 text-sm text-surface-300 hover:bg-surface-600"
                    >Unassign</button>
                    {agents.filter(a => a.is_active).map(a => (
                      <button
                        key={a.id}
                        onClick={() => updateTicket({ assigned_agent_id: a.id, status: ticket.status === 'new' ? 'assigned' : undefined })}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-600 ${ticket.assigned_agent_id === a.id ? 'text-accent' : 'text-surface-200'}`}
                      >
                        {a.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs text-surface-400 mb-1">Category</label>
              <select
                value={ticket.category_id || ''}
                onChange={(e) => updateTicket({ category_id: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-surface-100 focus:outline-none focus:border-accent"
              >
                <option value="">None</option>
                {categories.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">Customer</h3>
            {ticket.company_name ? (
              <button
                onClick={() => navigate(`/control/customers/${ticket.company_id}`)}
                className="text-left w-full"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium text-accent hover:underline">{ticket.company_name}</span>
                </div>
              </button>
            ) : null}
            {ticket.user_name && (
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-sm text-surface-200">{ticket.user_name}</span>
              </div>
            )}
            {ticket.user_email && (
              <div className="text-xs text-surface-400 ml-5.5">{ticket.user_email}</div>
            )}
          </div>

          {/* Support Context */}
          {contextFields.length > 0 && (
            <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">Support Context</h3>
              <div className="space-y-2">
                {contextFields.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <f.icon className="w-3.5 h-3.5 text-surface-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs text-surface-400">{f.label}</div>
                      <div className="text-sm text-surface-200 font-mono">{f.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="bg-surface-800 rounded-xl border border-surface-600 p-4">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">Timeline</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-surface-400">Created</span><span className="text-surface-200">{formatDateTime(ticket.created_at)}</span></div>
              {ticket.triaged_at && <div className="flex justify-between"><span className="text-surface-400">Triaged</span><span className="text-surface-200">{formatDateTime(ticket.triaged_at)}</span></div>}
              {ticket.assigned_at && <div className="flex justify-between"><span className="text-surface-400">Assigned</span><span className="text-surface-200">{formatDateTime(ticket.assigned_at)}</span></div>}
              {ticket.first_response_at && <div className="flex justify-between"><span className="text-surface-400">First Response</span><span className="text-surface-200">{formatDateTime(ticket.first_response_at)}</span></div>}
              {ticket.resolved_at && <div className="flex justify-between"><span className="text-surface-400">Resolved</span><span className="text-surface-200">{formatDateTime(ticket.resolved_at)}</span></div>}
              {ticket.closed_at && <div className="flex justify-between"><span className="text-surface-400">Closed</span><span className="text-surface-200">{formatDateTime(ticket.closed_at)}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}