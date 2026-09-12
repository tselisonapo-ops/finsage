import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Users,
  Ticket,
  Network,
  GitBranch,
  Layers,
  BriefcaseBusiness,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  CreditCard,
  ArrowUpRight,
} from 'lucide-react'

import { api } from '../api/client'
import { formatDateTime } from '../utils/formatters'

function valueOrDash(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : value
}

function CompanyHeader({ company }) {
  return (
    <div className="finsage-card-dark p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="
            w-12 h-12
            rounded-xl
            bg-accent-muted
            border border-accent/20
            flex items-center justify-center
            shrink-0
          ">
            <Building2 size={24} className="text-accent" />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-surface-100">
              {company.company_name}
            </h1>

            <div className="text-sm text-surface-400 mt-1">
              Company #{company.company_id}

              {company.system_company_code
                ? ` · ${company.system_company_code}`
                : ''}
            </div>
          </div>
        </div>

        <span
          className={`
            inline-flex
            w-fit
            px-2.5 py-1
            rounded-full
            text-xs
            font-medium
            ${
              company.is_active
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-surface-700 text-surface-400 border border-surface-600'
            }
          `}
        >
          {company.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  )
}

function InfoCard({ title, children }) {
  return (
    <div className="finsage-card-dark p-5">
      <h2 className="text-sm font-semibold text-surface-100 mb-4">
        {title}
      </h2>

      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="
      flex flex-col gap-1
      sm:flex-row sm:items-center sm:justify-between
      py-2.5
      border-b border-surface-600
      last:border-b-0
    ">
      <span className="text-sm text-surface-400">
        {label}
      </span>

      <span className="
        text-sm
        text-surface-200
        sm:text-right
        break-words
      ">
        {valueOrDash(value)}
      </span>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, count, subtitle }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className="
            mt-0.5
            w-8 h-8
            rounded-lg
            bg-accent-muted
            flex items-center justify-center
            shrink-0
          ">
            <Icon size={16} className="text-accent" />
          </div>
        )}

        <div>
          <h2 className="font-semibold text-surface-100">
            {title}
          </h2>

          {subtitle && (
            <p className="text-xs text-surface-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {count !== undefined && (
        <span className="
          px-2 py-1
          rounded-md
          bg-surface-700
          text-xs
          text-surface-300
          shrink-0
        ">
          {count}
        </span>
      )}
    </div>
  )
}

function ItemCard({ children, className = '' }) {
  return (
    <div
      className={`
        border border-surface-600
        rounded-lg
        p-4
        bg-surface-800/60
        hover:bg-surface-700/40
        hover:border-surface-500
        transition-colors
        ${className}
      `}
    >
      {children}
    </div>
  )
}

function ExternalButton({ onClick, label = 'Open' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="
        w-8 h-8
        rounded-lg
        flex items-center justify-center
        text-surface-400
        hover:text-accent
        hover:bg-accent-muted
        transition-colors
      "
    >
      <ExternalLink size={16} />
    </button>
  )
}

export default function Customer360() {
  const { companyId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCustomer = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await api.get(`/customers/${companyId}`)
      setData(result)
    } catch (err) {
      console.error('Failed to load customer:', err)

      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Unable to load company'
      )
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadCustomer()
  }, [loadCustomer])

  if (loading) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <div className="
          finsage-card-dark
          p-8
          text-sm
          text-surface-300
        ">
          Loading company...
        </div>
      </div>
    )
  }

  if (error || !data?.company) {
    return (
      <div className="w-full min-h-full p-5 lg:p-6">
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="
            flex items-center gap-2
            text-sm
            text-surface-400
            hover:text-surface-100
            mb-6
            transition-colors
          "
        >
          <ArrowLeft size={16} />
          Back to customers
        </button>

        <div className="finsage-card-dark p-8">
          <div className="
            w-10 h-10
            rounded-lg
            bg-error/10
            flex items-center justify-center
            mb-4
          ">
            <Building2 size={20} className="text-error" />
          </div>

          <h1 className="text-lg font-semibold text-surface-100 mb-2">
            Company not found
          </h1>

          <p className="text-sm text-surface-400">
            {error || 'The requested company could not be loaded.'}
          </p>
        </div>
      </div>
    )
  }

  const {
    company,
    users = [],
    tickets = [],
    ticket_stats = {},
    related_parties = [],
    provisioned_companies = [],
    source_company = null,
    branches = [],
    segments = [],
    engagements = [],
  } = data

  const customerSupportTickets =
    data.customer_support_tickets || []

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">

      {/* Back */}
      <button
        type="button"
        onClick={() => navigate('/customers')}
        className="
          flex items-center gap-2
          text-sm
          text-surface-400
          hover:text-surface-100
          transition-colors
        "
      >
        <ArrowLeft size={16} />
        Back to customers
      </button>

      {/* Company Header */}
      <CompanyHeader company={company} />

      {/* Subscription */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            navigate(
              `/customers/${company.company_id}/subscription`
            )
          }
          className="
            flex items-center gap-2
            px-3 py-2
            rounded-lg
            bg-surface-700
            border border-surface-600
            text-surface-200
            text-sm
            hover:bg-surface-600
            hover:text-surface-100
            transition-colors
          "
        >
          <CreditCard size={16} />
          Subscription
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard title="Users">
          <div className="text-2xl font-semibold text-surface-100">
            {users.length}
          </div>

          <div className="text-xs text-surface-400 mt-1">
            Registered users
          </div>
        </InfoCard>

        <InfoCard title="Open tickets">
          <div className="text-2xl font-semibold text-surface-100">
            {ticket_stats.open || 0}
          </div>

          <div className="text-xs text-surface-400 mt-1">
            Currently open
          </div>
        </InfoCard>

        <InfoCard title="Related parties">
          <div className="text-2xl font-semibold text-surface-100">
            {related_parties.length}
          </div>

          <div className="text-xs text-surface-400 mt-1">
            Corporate relationships
          </div>
        </InfoCard>

        <InfoCard title="Provisioned companies">
          <div className="text-2xl font-semibold text-surface-100">
            {provisioned_companies.length}
          </div>

          <div className="text-xs text-surface-400 mt-1">
            Linked companies
          </div>
        </InfoCard>
      </div>

      {/* Company Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InfoCard title="Company information">
          <InfoRow
            label="Company ID"
            value={company.company_id}
          />

          <InfoRow
            label="System code"
            value={company.system_company_code}
          />

          <InfoRow
            label="Client code"
            value={company.client_code}
          />

          <InfoRow
            label="Industry"
            value={company.industry}
          />

          <InfoRow
            label="Sub-industry"
            value={company.sub_industry}
          />

          <InfoRow
            label="Currency"
            value={company.currency}
          />

          <InfoRow
            label="Country"
            value={company.country}
          />

          <InfoRow
            label="Organisation type"
            value={company.organization_type}
          />

          <InfoRow
            label="Entity kind"
            value={company.entity_kind}
          />

          <InfoRow
            label="Registration number"
            value={company.company_reg_no}
          />

          <InfoRow
            label="TIN"
            value={company.tin}
          />

          <InfoRow
            label="VAT"
            value={company.vat}
          />
        </InfoCard>

        <InfoCard title="Contact & lifecycle">
          <InfoRow
            label="Email"
            value={company.company_email}
          />

          <InfoRow
            label="Phone"
            value={company.company_phone}
          />

          <InfoRow
            label="Created via"
            value={company.created_via}
          />

          <InfoRow
            label="Created"
            value={formatDateTime(company.company_created_at)}
          />

          <InfoRow
            label="Last login"
            value={formatDateTime(company.last_login_at)}
          />

          <InfoRow
            label="Last transaction"
            value={formatDateTime(company.last_transaction_at)}
          />

          <InfoRow
            label="Last error"
            value={formatDateTime(company.last_error_at)}
          />

          <InfoRow
            label="App version"
            value={company.app_version}
          />
        </InfoCard>
      </div>

      {/* Provisioned By */}
      {source_company && (
        <InfoCard title="Provisioned by">
          <div className="
            flex items-center justify-between
            gap-4
          ">
            <div>
              <div className="font-medium text-surface-100">
                {source_company.company_name}
              </div>

              <div className="text-sm text-surface-400 mt-1">
                Company #{source_company.company_id}
              </div>
            </div>

            <ExternalButton
              label="Open source company"
              onClick={() =>
                navigate(
                  `/customers/${source_company.company_id}`
                )
              }
            />
          </div>

          {company.provisioning_context && (
            <div className="
              mt-4
              p-3
              rounded-lg
              bg-surface-700/50
              border border-surface-600
              text-sm text-surface-300
            ">
              {company.provisioning_context}
            </div>
          )}
        </InfoCard>
      )}

      {/* Corporate Relationships */}
      <InfoCard title="Corporate related parties">
        <SectionHeader
          icon={Network}
          title="Corporate relationships"
          count={related_parties.length}
        />

        {related_parties.length === 0 ? (
          <div className="text-sm text-surface-400">
            No active corporate relationships recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {related_parties.map((relationship) => (
              <ItemCard key={relationship.relationship_id}>
                <div className="
                  flex justify-between
                  gap-4
                ">
                  <div className="min-w-0">
                    <div className="font-medium text-surface-100">
                      {relationship.related_company_name}
                    </div>

                    <div className="text-xs text-surface-400 mt-1">
                      {relationship.relationship_type}
                      {' · '}
                      {relationship.relationship_direction}
                    </div>
                  </div>

                  <ExternalButton
                    label="Open related company"
                    onClick={() =>
                      navigate(
                        `/customers/${relationship.related_company_id}`
                      )
                    }
                  />
                </div>

                <div className="
                  grid
                  grid-cols-2
                  md:grid-cols-4
                  gap-4
                  mt-4
                ">
                  <div>
                    <div className="text-xs text-surface-400">
                      Ownership
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(
                        relationship.ownership_percent
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">
                      Voting
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(
                        relationship.voting_percent
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">
                      Control
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(
                        relationship.control_basis
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">
                      Consolidation
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(
                        relationship.consolidation_method
                      )}
                    </div>
                  </div>
                </div>
              </ItemCard>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Provisioned Companies */}
      <InfoCard title="Provisioned companies">
        <SectionHeader
          icon={Users}
          title="Companies provisioned from this company"
          count={provisioned_companies.length}
        />

        {provisioned_companies.length === 0 ? (
          <div className="text-sm text-surface-400">
            No companies are currently recorded as provisioned
            by this company.
          </div>
        ) : (
          <div className="space-y-3">
            {provisioned_companies.map((item) => (
              <ItemCard
                key={item.company_id}
                className="
                  flex items-center
                  justify-between
                  gap-4
                "
              >
                <div className="min-w-0">
                  <div className="font-medium text-surface-100">
                    {item.company_name}
                  </div>

                  <div className="text-xs text-surface-400 mt-1">
                    Company #{item.company_id}
                    {' · '}
                    {item.currency || '—'}
                  </div>
                </div>

                <ExternalButton
                  label="Open company"
                  onClick={() =>
                    navigate(
                      `/customers/${item.company_id}`
                    )
                  }
                />
              </ItemCard>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Branches & Segments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Branches */}
        <InfoCard title="Branches">
          <SectionHeader
            icon={GitBranch}
            title="Internal branches"
            count={branches.length}
          />

          {branches.length === 0 ? (
            <div className="text-sm text-surface-400">
              No branches recorded.
            </div>
          ) : (
            <div className="space-y-3">
              {branches.map((branch) => (
                <ItemCard key={branch.branch_id}>
                  <div className="font-medium text-surface-100">
                    {branch.name}
                  </div>

                  <div className="text-xs text-surface-400 mt-1">
                    {valueOrDash(branch.code)}
                    {' · '}
                    {valueOrDash(branch.country)}
                  </div>

                  {branch.phone && (
                    <div className="
                      text-sm text-surface-300
                      mt-3
                      flex items-center gap-2
                    ">
                      <Phone
                        size={14}
                        className="text-surface-400"
                      />
                      {branch.phone}
                    </div>
                  )}

                  {branch.email && (
                    <div className="
                      text-sm text-surface-300
                      mt-2
                      flex items-center gap-2
                    ">
                      <Mail
                        size={14}
                        className="text-surface-400"
                      />
                      {branch.email}
                    </div>
                  )}

                  {branch.address && (
                    <div className="
                      text-sm text-surface-300
                      mt-2
                      flex items-center gap-2
                    ">
                      <MapPin
                        size={14}
                        className="text-surface-400"
                      />
                      {branch.address}
                    </div>
                  )}
                </ItemCard>
              ))}
            </div>
          )}
        </InfoCard>

        {/* Segments */}
        <InfoCard title="Segments">
          <SectionHeader
            icon={Layers}
            title="Company segments"
            count={segments.length}
          />

          {segments.length === 0 ? (
            <div className="text-sm text-surface-400">
              No segments recorded.
            </div>
          ) : (
            <div className="space-y-3">
              {segments.map((segment) => (
                <ItemCard key={segment.segment_id}>
                  <div className="font-medium text-surface-100">
                    {segment.name}
                  </div>

                  <div className="text-xs text-surface-400 mt-1">
                    {valueOrDash(segment.code)}
                    {' · '}
                    {valueOrDash(segment.segment_type)}
                  </div>

                  {segment.description && (
                    <div className="text-sm text-surface-300 mt-3 leading-relaxed">
                      {segment.description}
                    </div>
                  )}
                </ItemCard>
              ))}
            </div>
          )}
        </InfoCard>
      </div>

      {/* Engagements */}
      <InfoCard title="Engagements">
        <SectionHeader
          icon={BriefcaseBusiness}
          title="Company engagements"
          count={engagements.length}
        />

        {engagements.length === 0 ? (
          <div className="text-sm text-surface-400">
            No active engagements recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {engagements.map((engagement) => (
              <ItemCard key={engagement.id}>
                <div className="
                  flex justify-between
                  gap-4
                ">
                  <div className="min-w-0">
                    <div className="font-medium text-surface-100">
                      {engagement.engagement_name}
                    </div>

                    <div className="text-xs text-surface-400 mt-1">
                      {valueOrDash(
                        engagement.engagement_code
                      )}
                      {' · '}
                      {valueOrDash(
                        engagement.engagement_type
                      )}
                    </div>
                  </div>

                  <div className="
                    px-2 py-1
                    rounded-md
                    bg-surface-700
                    text-xs text-surface-300
                    capitalize
                    shrink-0
                  ">
                    {valueOrDash(engagement.status)}
                  </div>
                </div>

                <div className="
                  grid
                  grid-cols-2
                  md:grid-cols-4
                  gap-4
                  mt-4
                ">
                  <div>
                    <div className="text-xs text-surface-400">
                      Priority
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(engagement.priority)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">
                      Workflow
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(
                        engagement.workflow_stage
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">
                      Start
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(engagement.start_date)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-surface-400">
                      Due
                    </div>

                    <div className="text-sm text-surface-200 mt-1">
                      {valueOrDash(engagement.due_date)}
                    </div>
                  </div>
                </div>
              </ItemCard>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Control Activity */}
      <InfoCard title="Control activity">
        <SectionHeader
          icon={Ticket}
          title="Support tickets"
          count={tickets.length}
        />

        {tickets.length === 0 ? (
          <div className="text-sm text-surface-400">
            No Control tickets recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <ItemCard key={ticket.id}>
                <div className="
                  flex justify-between
                  gap-4
                ">
                  <div className="min-w-0">
                    <div className="font-medium text-surface-100">
                      {ticket.subject}
                    </div>

                    <div className="text-xs text-surface-400 mt-1">
                      {ticket.ticket_number}
                    </div>
                  </div>

                  <div className="
                    px-2 py-1
                    rounded-md
                    bg-surface-700
                    text-xs text-surface-300
                    capitalize
                    shrink-0
                  ">
                    {ticket.status}
                  </div>
                </div>

                <div className="
                  text-sm
                  text-surface-400
                  mt-3
                ">
                  {ticket.priority}
                  {' · '}
                  {ticket.ticket_type}

                  {ticket.agent_name
                    ? ` · ${ticket.agent_name}`
                    : ''}
                </div>
              </ItemCard>
            ))}
          </div>
        )}
      </InfoCard>

      {/* Customer Support Tickets */}
      <InfoCard title="Customer Support Tickets">
        <SectionHeader
          icon={Ticket}
          title="Customer support tickets"
          subtitle="Tickets created from the customer's FinSage workspace"
          count={customerSupportTickets.length}
        />

        {customerSupportTickets.length === 0 ? (
          <div className="
            rounded-lg
            border border-surface-600
            bg-surface-800/50
            p-5
            text-sm text-surface-400
          ">
            No customer support tickets found.
          </div>
        ) : (
          <div className="space-y-3">
            {customerSupportTickets.map((ticket) => (
              <ItemCard key={ticket.id}>
                <div className="
                  flex flex-col
                  gap-4
                  sm:flex-row
                  sm:items-start
                  sm:justify-between
                ">
                  <div className="min-w-0">
                    <div className="font-medium text-surface-100">
                      {ticket.subject}
                    </div>

                    <div className="mt-1 text-xs text-surface-400">
                      Ticket #{ticket.id}
                      {' · '}
                      {ticket.status}
                      {' · '}
                      {ticket.priority}
                    </div>

                    {ticket.email && (
                      <div className="mt-2 text-xs text-surface-500">
                        {ticket.email}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const controlTicket = await api.post(
                        `/customers/${company.company_id}/support-tickets/${ticket.id}/escalate`
                      )

                      navigate(`/tickets/${controlTicket.id}`)
                    }}
                    className="
                      flex items-center
                      justify-center
                      gap-2
                      rounded-lg
                      bg-accent
                      text-surface-900
                      px-3 py-2
                      text-sm
                      font-medium
                      hover:bg-accent-hover
                      transition-colors
                      shrink-0
                    "
                  >
                    <ArrowUpRight size={15} />
                    Escalate
                  </button>
                </div>

                {ticket.description && (
                  <div className="
                    mt-3
                    pt-3
                    border-t border-surface-600
                    text-sm
                    text-surface-300
                    leading-relaxed
                  ">
                    {ticket.description}
                  </div>
                )}
              </ItemCard>
            ))}
          </div>
        )}
      </InfoCard>
    </div>
  )
}