import { getPriority } from '../lib/constants'

export default function PriorityBadge({ priority }) {
  const p = getPriority(priority)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${p.color} ${p.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  )
}