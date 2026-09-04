// ── Ticket Types ──
export const TICKET_TYPES = [
  { value: 'support', label: 'Support', icon: 'LifeBuoy' },
  { value: 'bug', label: 'Bug', icon: 'Bug' },
  { value: 'feature_request', label: 'Feature Request', icon: 'Lightbulb' },
  { value: 'access_issue', label: 'Access Issue', icon: 'Shield' },
  { value: 'billing', label: 'Billing', icon: 'CreditCard' },
  { value: 'incident', label: 'Incident', icon: 'AlertTriangle' },
  { value: 'training', label: 'Training', icon: 'BookOpen' },
]

// ── Statuses ──
export const TICKET_STATUSES = [
  { value: 'new', label: 'New', color: 'bg-blue-500' },
  { value: 'triaged', label: 'Triaged', color: 'bg-cyan-500' },
  { value: 'assigned', label: 'Assigned', color: 'bg-purple-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-500' },
  { value: 'waiting_customer', label: 'Waiting Customer', color: 'bg-orange-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-500' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-500' },
]

// ── Priorities ──
export const PRIORITIES = [
  { value: 'p1_critical', label: 'P1 Critical', color: 'text-p1', bg: 'bg-p1/15', dot: 'bg-p1' },
  { value: 'p2_high', label: 'P2 High', color: 'text-p2', bg: 'bg-p2/15', dot: 'bg-p2' },
  { value: 'p3_medium', label: 'P3 Medium', color: 'text-p3', bg: 'bg-p3/15', dot: 'bg-p3' },
  { value: 'p4_low', label: 'P4 Low', color: 'text-p4', bg: 'bg-p4/15', dot: 'bg-p4' },
]

export const getStatusLabel = (status) =>
  TICKET_STATUSES.find(s => s.value === status)?.label || status

export const getStatusColor = (status) =>
  TICKET_STATUSES.find(s => s.value === status)?.color || 'bg-gray-500'

export const getPriority = (priority) =>
  PRIORITIES.find(p => p.value === priority) || PRIORITIES[2]

export const getTicketTypeLabel = (type) =>
  TICKET_TYPES.find(t => t.value === type)?.label || type

export const formatDateTime = (dt) => {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString('en-ZA', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dt
  }
}

export const timeAgo = (dt) => {
  if (!dt) return ''
  const seconds = Math.floor((Date.now() - new Date(dt)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDateTime(dt)
}