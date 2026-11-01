import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import {
  formatDateTime,
  TICKET_STATUSES,
  PRIORITIES,
  getTicketTypeLabel,
} from '../lib/constants'
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Lock,
  History,
  Save,
  ChevronDown,
  Building2,
  User,
  Cpu,
  FileText,
  AlertCircle,
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

  // Refs for click-outside detection on dropdowns
  const statusDropRef = useRef(null)
  const assignDropRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)

      const [t, m, n, hist] = await Promise.all([
        api.get(`/tickets/${id}`),
        api.get(`/tickets/${id}/messages`),
        api.get(`/tickets/${id}/notes`),
        api.get(`/tickets/${id}/history`),
      ])

      setTicket(t)
      setMessages(m || [])
      setNotes(n || [])
      setHistory(hist || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Load agents and categories once on mount; guard against unmounted setState
  useEffect(() => {
    let isMounted = true

    Promise.all([
      api.get('/settings/agents').catch(() => []),
      api.get('/settings/categories').catch(() => []),
    ]).then(([a, c]) => {
      if (!isMounted) return
      setAgents(a || [])
      setCategories(c || [])
    })

    return () => {
      isMounted = false
    }
  }, [])

  // Close dropdowns when clicking outside their containers
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        statusDropRef.current &&
        !statusDropRef.current.contains(e.target)
      ) {
        setShowStatusDrop(false)
      }
      if (
        assignDropRef.current &&
        !assignDropRef.current.contains(e.target)
      ) {
        setShowAssignDrop(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () =>
      document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Update ticket fields. Prevents concurrent saves to avoid race conditions
  // and closes dropdowns immediately for responsive UX.
  const updateTicket = useCallback(
    async (data) => {
      if (saving) return
      setSaving(true)
      setShowStatusDrop(false)
      setShowAssignDrop(false)

      try {
        const updated = await api.patch(`/tickets/${id}`, data)
        setTicket(updated)

        const hist = await api.get(`/tickets/${id}/history`)
        setHistory(hist || [])
      } catch (err) {
        console.error(err)
      } finally {
        setSaving(false)
      }
    },
    [id, saving],
  )

  const sendReply = useCallback(
    async () => {
      if (!replyBody.trim() || saving) return

      setSaving(true)

      try {
        const msg = await api.post(`/tickets/${id}/messages`, {
          body: replyBody,
        })

        setMessages((prev) => [...prev, msg])
        setReplyBody('')

        const t = await api.get(`/tickets/${id}`)
        setTicket(t)
      } catch (err) {
        console.error(err)
      } finally {
        setSaving(false)
      }
    },
    [id, replyBody, saving],
  )

  const addNote = useCallback(
    async () => {
      if (!noteBody.trim() || saving) return

      setSaving(true)

      try {
        const note = await api.post(`/tickets/${id}/notes`, {
          body: noteBody,
        })

        setNotes((prev) => [...prev, note])
        setNoteBody('')
      } catch (err) {
        console.error(err)
      } finally {
        setSaving(false)
      }
    },
    [id, noteBody, saving],
  )

  if (loading) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="rounded-xl border border-surface-600 bg-surface-800 p-8 text-center text-sm text-surface-400">
          Loading ticket...
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="rounded-xl border border-error/30 bg-error/10 p-6 text-sm text-error">
          Ticket not found
        </div>
      </div>
    )
  }

  const tabs = [
    {
      key: 'conversation',
      label: 'Conversation',
      icon: MessageSquare,
      count: messages.length,
    },
    {
      key: 'internal',
      label: 'Internal Notes',
      icon: Lock,
      count: notes.length,
    },
    {
      key: 'history',
      label: 'History',
      icon: History,
      count: history.length,
    },
  ]

  const sourceContext = ticket.support_context || {}

  const contextFields = [
    ticket.module_code && {
      icon: Cpu,
      label: 'Module',
      value: ticket.module_code.replace(/_/g, ' '),
    },
    ticket.page_code && {
      icon: FileText,
      label: 'Page',
      value: ticket.page_code,
    },
    ticket.transaction_ref && {
      icon: FileText,
      label: 'Reference',
      value: ticket.transaction_ref,
    },
    ticket.error_ref && {
      icon: AlertCircle,
      label: 'Error',
      value: ticket.error_ref,
    },
    ticket.app_version && {
      icon: Cpu,
      label: 'Version',
      value: ticket.app_version,
    },
    sourceContext.source && {
      icon: FileText,
      label: 'Source',
      value: sourceContext.source.replace(/_/g, ' '),
    },
    sourceContext.system_event_id && {
      icon: AlertCircle,
      label: 'System Error',
      value: `#${sourceContext.system_event_id}`,
    },
    sourceContext.source_ticket_id && {
      icon: FileText,
      label: 'Customer Ticket',
      value: `#${sourceContext.source_ticket_id}`,
    },
  ].filter(Boolean)

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/tickets')}
          className="
            inline-flex
            items-center
            gap-1.5
            text-sm
            text-surface-300
            hover:text-surface-100
            mb-4
            transition-colors
          "
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tickets
        </button>

        <div className="
          flex
          flex-col
          lg:flex-row
          lg:items-start
          lg:justify-between
          gap-4
        ">
          <div className="min-w-0">
            <div className="
              flex
              flex-wrap
              items-center
              gap-2
              mb-1.5
            ">
              <span className="
                text-xs
                font-mono
                text-surface-400
              ">
                {ticket.ticket_number}
              </span>

              <span className="
                text-xs
                text-surface-300
                px-2
                py-0.5
                rounded-md
                bg-surface-700
                border border-surface-600
              ">
                {getTicketTypeLabel(ticket.ticket_type)}
              </span>
            </div>

            <h1 className="
              text-xl
              lg:text-2xl
              font-semibold
              text-surface-100
              break-words
            ">
              {ticket.subject}
            </h1>
          </div>

          <div className="
            flex
            items-center
            gap-2
            shrink-0
          ">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>
      </div>

      <div className="
        grid
        grid-cols-1
        xl:grid-cols-[minmax(0,1fr)_18rem]
        gap-5
        items-start
      ">
        {/* Main column */}
        <div className="min-w-0">
          {/* Tabs */}
          <div className="
            overflow-x-auto
            border-b border-surface-600
          ">
            <div className="flex min-w-max">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.key

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`
                      flex
                      items-center
                      gap-2
                      px-4
                      py-2.5
                      text-sm
                      font-medium
                      border-b-2
                      transition-colors
                      whitespace-nowrap
                      ${
                        active
                          ? 'border-accent text-accent'
                          : 'border-transparent text-surface-300 hover:text-surface-100'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}

                    {tab.count > 0 && (
                      <span className="
                        text-xs
                        bg-surface-600
                        text-surface-200
                        rounded-full
                        px-1.5
                        py-0.5
                      ">
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="
            bg-surface-800
            rounded-b-xl
            border
            border-t-0
            border-surface-600
            overflow-hidden
          ">
            {/* Conversation */}
            {activeTab === 'conversation' && (
              <div>
                <div className="
                  max-h-[32rem]
                  overflow-auto
                ">
                  {/* Original description */}
                  <div className="
                    p-4
                    lg:p-5
                    border-b border-surface-600
                  ">
                    <div className="
                      flex
                      items-center
                      gap-2
                      mb-2
                    ">
                      <div className="
                        w-8
                        h-8
                        rounded-full
                        bg-accent-muted
                        flex
                        items-center
                        justify-center
                        text-xs
                        font-bold
                        text-accent
                        shrink-0
                      ">
                        {(ticket.user_name || 'C')
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <div className="
                          flex
                          flex-wrap
                          items-center
                          gap-x-2
                          gap-y-0.5
                        ">
                          <span className="
                            text-sm
                            font-medium
                            text-surface-100
                          ">
                            {ticket.user_name || 'Customer'}
                          </span>

                          <span className="
                            text-xs
                            text-surface-400
                          ">
                            {formatDateTime(ticket.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="
                      text-sm
                      text-surface-200
                      whitespace-pre-wrap
                      ml-10
                      break-words
                    ">
                      {ticket.description}
                    </div>
                  </div>

                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`
                        p-4
                        lg:p-5
                        border-b border-surface-600
                        ${
                          msg.is_from_customer
                            ? 'bg-surface-800'
                            : 'bg-surface-700/30'
                        }
                      `}
                    >
                      <div className="
                        flex
                        items-center
                        gap-2
                        mb-2
                      ">
                        <div
                          className={`
                            w-8
                            h-8
                            rounded-full
                            flex
                            items-center
                            justify-center
                            text-xs
                            font-bold
                            shrink-0
                            ${
                              msg.is_from_customer
                                ? 'bg-info/10 text-info'
                                : 'bg-accent-muted text-accent'
                            }
                          `}
                        >
                          {msg.sender_name
                            ?.charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="
                            flex
                            flex-wrap
                            items-center
                            gap-x-2
                            gap-y-0.5
                          ">
                            <span className="
                              text-sm
                              font-medium
                              text-surface-100
                            ">
                              {msg.sender_name}
                            </span>

                            {!msg.is_from_customer && (
                              <span className="
                                text-xs
                                text-accent
                              ">
                                FinSage Support
                              </span>
                            )}

                            <span className="
                              text-xs
                              text-surface-400
                            ">
                              {formatDateTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="
                        text-sm
                        text-surface-200
                        whitespace-pre-wrap
                        ml-10
                        break-words
                      ">
                        {msg.body}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reply */}
                <div className="
                  p-4
                  lg:p-5
                  border-t border-surface-600
                  bg-surface-800
                ">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Type your reply to the customer..."
                    rows={3}
                    className="
                      w-full
                      bg-surface-700
                      border border-surface-500
                      rounded-lg
                      px-3
                      py-2
                      text-sm
                      text-surface-100
                      placeholder:text-surface-400
                      focus:outline-none
                      focus:border-accent
                      focus:ring-1
                      focus:ring-accent/30
                      resize-none
                      transition-colors
                    "
                  />

                  <div className="
                    flex
                    justify-end
                    mt-2
                  ">
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={!replyBody.trim() || saving}
                      className="
                        inline-flex
                        items-center
                        gap-2
                        bg-accent
                        hover:bg-accent-hover
                        text-surface-900
                        text-sm
                        font-medium
                        px-4
                        py-2
                        rounded-lg
                        transition-colors
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                      "
                    >
                      <Send className="w-4 h-4" />
                      {saving ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Internal Notes */}
            {activeTab === 'internal' && (
              <div>
                <div className="
                  max-h-[32rem]
                  overflow-auto
                ">
                  {notes.length === 0 && (
                    <div className="
                      p-8
                      text-center
                      text-sm
                      text-surface-400
                    ">
                      No internal notes yet
                    </div>
                  )}

                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="
                        p-4
                        lg:p-5
                        border-b border-surface-600
                        bg-warning/5
                      "
                    >
                      <div className="
                        flex
                        flex-wrap
                        items-center
                        gap-2
                        mb-2
                      ">
                        <div className="
                          w-7
                          h-7
                          rounded-lg
                          bg-warning/10
                          text-warning
                          flex
                          items-center
                          justify-center
                          shrink-0
                        ">
                          <Lock className="w-3.5 h-3.5" />
                        </div>

                        <span className="
                          text-sm
                          font-medium
                          text-surface-100
                        ">
                          {note.agent_name}
                        </span>

                        <span className="
                          text-xs
                          text-surface-400
                        ">
                          {formatDateTime(note.created_at)}
                        </span>
                      </div>

                      <div className="
                        text-sm
                        text-surface-200
                        whitespace-pre-wrap
                        ml-9
                        break-words
                      ">
                        {note.body}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="
                  p-4
                  lg:p-5
                  border-t border-surface-600
                ">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Add an internal note (only visible to support team)..."
                    rows={3}
                    className="
                      w-full
                      bg-surface-700
                      border border-surface-500
                      rounded-lg
                      px-3
                      py-2
                      text-sm
                      text-surface-100
                      placeholder:text-surface-400
                      focus:outline-none
                      focus:border-warning
                      focus:ring-1
                      focus:ring-warning/20
                      resize-none
                      transition-colors
                    "
                  />

                  <div className="
                    flex
                    justify-end
                    mt-2
                  ">
                    <button
                      type="button"
                      onClick={addNote}
                      disabled={!noteBody.trim() || saving}
                      className="
                        inline-flex
                        items-center
                        gap-2
                        bg-warning
                        hover:opacity-90
                        text-surface-900
                        text-sm
                        font-medium
                        px-4
                        py-2
                        rounded-lg
                        transition-opacity
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                      "
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : 'Add Note'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* History */}
            {activeTab === 'history' && (
              <div className="
                max-h-[36rem]
                overflow-auto
              ">
                {history.length === 0 && (
                  <div className="
                    p-8
                    text-center
                    text-sm
                    text-surface-400
                  ">
                    No history recorded
                  </div>
                )}

                {history.map((h) => (
                  <div
                    key={h.id}
                    className="
                      px-4
                      py-3
                      lg:px-5
                      border-b border-surface-600
                      flex
                      items-start
                      gap-3
                      hover:bg-surface-700/30
                      transition-colors
                    "
                  >
                    <div className="
                      w-2
                      h-2
                      rounded-full
                      bg-accent
                      shrink-0
                      mt-2
                    " />

                    <div className="
                      flex-1
                      min-w-0
                    ">
                      <div className="
                        text-sm
                        text-surface-200
                        break-words
                      ">
                        <span className="
                          font-medium
                          text-surface-100
                        ">
                          {h.changed_by_name}
                        </span>

                        {' '}changed{' '}

                        <span className="
                          text-accent
                          font-mono
                          text-xs
                        ">
                          {h.field}
                        </span>

                        {h.old_value && (
                          <span className="
                            text-xs
                            text-surface-400
                            ml-1
                            line-through
                          ">
                            {h.old_value}
                          </span>
                        )}

                        {h.new_value && (
                          <span className="
                            text-xs
                            text-surface-200
                            ml-1
                          ">
                            → {h.new_value}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="
                      text-xs
                      text-surface-400
                      shrink-0
                      whitespace-nowrap
                    ">
                      {formatDateTime(h.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="
          w-full
          space-y-3
        ">
          {/* Status / Priority / Assignment */}
          <div className="
            bg-surface-800
            rounded-xl
            border border-surface-600
            p-4
            space-y-4
          ">
            {/* Status */}
            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-400
                mb-1.5
              ">
                Status
              </label>

              <div className="relative" ref={statusDropRef}>
                <button
                  type="button"
                  onClick={() => setShowStatusDrop(!showStatusDrop)}
                  disabled={saving}
                  className="
                    w-full
                    flex
                    items-center
                    justify-between
                    gap-2
                    bg-surface-700
                    border border-surface-500
                    rounded-lg
                    px-3
                    py-2
                    text-sm
                    text-left
                    hover:border-surface-400
                    transition-colors
                    disabled:opacity-50
                    disabled:cursor-not-allowed
                  "
                >
                  <StatusBadge status={ticket.status} />

                  <ChevronDown className="
                    w-4
                    h-4
                    text-surface-400
                  " />
                </button>

                {showStatusDrop && (
                  <div className="
                    absolute
                    z-20
                    top-full
                    left-0
                    right-0
                    mt-1
                    bg-surface-700
                    border border-surface-500
                    rounded-lg
                    shadow-2xl
                    py-1
                    max-h-56
                    overflow-auto
                  ">
                    {TICKET_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          updateTicket({
                            status: s.value,
                          })
                        }
                        className="
                          w-full
                          text-left
                          px-3
                          py-2
                          text-sm
                          text-surface-200
                          hover:bg-surface-600
                          flex
                          items-center
                          gap-2
                          transition-colors
                        "
                      >
                        <span
                          className={`
                            w-2
                            h-2
                            rounded-full
                            ${s.color}
                          `}
                        />
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-400
                mb-1.5
              ">
                Priority
              </label>

              <div className="
                grid
                grid-cols-2
                sm:grid-cols-4
                xl:grid-cols-2
                gap-1
              ">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateTicket({
                        priority: p.value,
                      })
                    }
                    className={`
                      text-center
                      py-1.5
                      rounded-lg
                      text-xs
                      font-medium
                      transition-colors
                      ${
                        ticket.priority === p.value
                          ? `${p.bg} ${p.color} ring-1 ring-current`
                          : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200'
                      }
                    `}
                  >
                    {p.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Assigned Agent */}
            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-400
                mb-1.5
              ">
                Assigned To
              </label>

              <div className="relative" ref={assignDropRef}>
                <button
                  type="button"
                  onClick={() =>
                    setShowAssignDrop(!showAssignDrop)
                  }
                  disabled={saving}
                  className="
                    w-full
                    flex
                    items-center
                    justify-between
                    gap-2
                    bg-surface-700
                    border border-surface-500
                    rounded-lg
                    px-3
                    py-2
                    text-sm
                    text-left
                    hover:border-surface-400
                    transition-colors
                    disabled:opacity-50
                    disabled:cursor-not-allowed
                  "
                >
                  <span className="
                    text-surface-200
                    truncate
                  ">
                    {ticket.agent_name || 'Unassigned'}
                  </span>

                  <ChevronDown className="
                    w-4
                    h-4
                    text-surface-400
                    shrink-0
                  " />
                </button>

                {showAssignDrop && (
                  <div className="
                    absolute
                    z-20
                    top-full
                    left-0
                    right-0
                    mt-1
                    bg-surface-700
                    border border-surface-500
                    rounded-lg
                    shadow-2xl
                    py-1
                    max-h-56
                    overflow-auto
                  ">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        updateTicket({
                          assigned_agent_id: null,
                        })
                      }
                      className="
                        w-full
                        text-left
                        px-3
                        py-2
                        text-sm
                        text-surface-300
                        hover:bg-surface-600
                        transition-colors
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                      "
                    >
                      Unassign
                    </button>

                    {agents
                      .filter((a) => a.is_active)
                      .map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            const payload = {
                              assigned_agent_id: a.id,
                            }

                            if (ticket.status === 'new') {
                              payload.status = 'assigned'
                            }

                            updateTicket(payload)
                          }}
                          className={`
                            w-full
                            text-left
                            px-3
                            py-2
                            text-sm
                            hover:bg-surface-600
                            transition-colors
                            ${
                              ticket.assigned_agent_id === a.id
                                ? 'text-accent'
                                : 'text-surface-200'
                            }
                          `}
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
              <label className="
                block
                text-xs
                font-medium
                text-surface-400
                mb-1.5
              ">
                Category
              </label>

              <select
                value={ticket.category_id || ''}
                disabled={saving}
                onChange={(e) =>
                  updateTicket({
                    category_id: e.target.value
                      ? parseInt(e.target.value, 10)
                      : null,
                  })
                }
                className="
                  w-full
                  bg-surface-700
                  border border-surface-500
                  rounded-lg
                  px-3
                  py-2
                  text-sm
                  text-surface-100
                  focus:outline-none
                  focus:border-accent
                  focus:ring-1
                  focus:ring-accent/30
                  transition-colors
                "
              >
                <option value="">None</option>

                {categories
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Customer Info */}
          <div className="
            bg-surface-800
            rounded-xl
            border border-surface-600
            p-4
          ">
            <h3 className="
              text-xs
              font-semibold
              text-surface-400
              uppercase
              tracking-wide
              mb-3
            ">
              Customer
            </h3>

            {ticket.company_name && (
              <button
                type="button"
                onClick={() =>
                  navigate(`/customers/${ticket.company_id}`)
                }
                className="
                  text-left
                  w-full
                  group
                "
              >
                <div className="
                  flex
                  items-center
                  gap-2
                  mb-2
                ">
                  <Building2 className="
                    w-4
                    h-4
                    text-accent
                    shrink-0
                  " />

                  <span className="
                    text-sm
                    font-medium
                    text-accent
                    group-hover:underline
                    truncate
                  ">
                    {ticket.company_name}
                  </span>
                </div>
              </button>
            )}

            {ticket.user_name && (
              <div className="
                flex
                items-center
                gap-2
                mb-1
              ">
                <User className="
                  w-3.5
                  h-3.5
                  text-surface-400
                  shrink-0
                " />

                <span className="
                  text-sm
                  text-surface-200
                ">
                  {ticket.user_name}
                </span>
              </div>
            )}

            {ticket.user_email && (
              <div className="
                text-xs
                text-surface-400
                ml-5
                break-all
              ">
                {ticket.user_email}
              </div>
            )}
          </div>

          {/* Support Context */}
          {contextFields.length > 0 && (
            <div className="
              bg-surface-800
              rounded-xl
              border border-surface-600
              p-4
            ">
              <h3 className="
                text-xs
                font-semibold
                text-surface-400
                uppercase
                tracking-wide
                mb-3
              ">
                Support Context
              </h3>

              <div className="space-y-3">
                {contextFields.map((field, index) => {
                  const Icon = field.icon

                  return (
                    <div
                      key={`${field.label}-${index}`}
                      className="
                        flex
                        items-start
                        gap-2.5
                      "
                    >
                      <Icon className="
                        w-3.5
                        h-3.5
                        text-accent
                        mt-0.5
                        shrink-0
                      " />

                      <div className="min-w-0">
                        <div className="
                          text-xs
                          text-surface-400
                        ">
                          {field.label}
                        </div>

                        <div className="
                          text-sm
                          text-surface-200
                          font-mono
                          break-words
                          mt-0.5
                        ">
                          {field.value}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ticket Source */}
          {ticket.support_context?.source && (
            <div className="
              rounded-xl
              border border-surface-600
              bg-surface-800
              p-4
            ">
              <div className="
                text-xs
                uppercase
                tracking-wide
                font-semibold
                text-surface-400
              ">
                Ticket Source
              </div>

              <div className="
                mt-2
                text-sm
                font-medium
                text-surface-100
              ">
                {ticket.support_context.source ===
                'customer_support_ticket'
                  ? 'Customer Support Ticket'
                  : ticket.support_context.source === 'system_error'
                    ? 'System Error'
                    : ticket.support_context.source}
              </div>

              {ticket.support_context.source_ticket_id && (
                <div className="
                  mt-1
                  text-xs
                  text-surface-400
                ">
                  Customer ticket #{ticket.support_context.source_ticket_id}
                </div>
              )}

              {ticket.support_context.system_event_id && (
                <div className="
                  mt-1
                  text-xs
                  text-surface-400
                ">
                  System event #{ticket.support_context.system_event_id}
                </div>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="
            bg-surface-800
            rounded-xl
            border border-surface-600
            p-4
          ">
            <h3 className="
              text-xs
              font-semibold
              text-surface-400
              uppercase
              tracking-wide
              mb-3
            ">
              Timeline
            </h3>

            <div className="space-y-2.5 text-xs">
              <TimelineRow
                label="Created"
                value={ticket.created_at}
              />

              {ticket.triaged_at && (
                <TimelineRow
                  label="Triaged"
                  value={ticket.triaged_at}
                />
              )}

              {ticket.assigned_at && (
                <TimelineRow
                  label="Assigned"
                  value={ticket.assigned_at}
                />
              )}

              {ticket.first_response_at && (
                <TimelineRow
                  label="First Response"
                  value={ticket.first_response_at}
                />
              )}

              {ticket.resolved_at && (
                <TimelineRow
                  label="Resolved"
                  value={ticket.resolved_at}
                />
              )}

              {ticket.closed_at && (
                <TimelineRow
                  label="Closed"
                  value={ticket.closed_at}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineRow({ label, value }) {
  return (
    <div className="
      flex
      items-start
      justify-between
      gap-3
      border-b border-surface-600
      pb-2
      last:border-b-0
      last:pb-0
    ">
      <span className="text-surface-400">
        {label}
      </span>

      <span className="
        text-surface-200
        text-right
        break-words
      ">
        {formatDateTime(value)}
      </span>
    </div>
  )
}