import { getStatusLabel, getStatusColor } from '../lib/constants'

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${getStatusColor(status)}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
      {getStatusLabel(status)}
    </span>
  )
}