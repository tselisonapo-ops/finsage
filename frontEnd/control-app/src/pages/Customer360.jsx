import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  CalendarDays,
  ExternalLink,
  CreditCard,
} from 'lucide-react';

import { api } from '../api/client';
import { formatDateTime } from '../utils/formatters';

function valueOrDash(value) {
  return value === null || value === undefined || value === ''
    ? '—'
    : value;
}

function CompanyHeader({ company }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
            <Building2 size={24} />
          </div>

          <div>
            <h1 className="text-xl font-semibold">
              {company.company_name}
            </h1>

            <div className="text-sm text-slate-400 mt-1">
              Company #{company.company_id}
              {company.system_company_code
                ? ` · ${company.system_company_code}`
                : ''}
            </div>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-full text-xs ${
            company.is_active
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-slate-700 text-slate-400'
          }`}
        >
          {company.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-200 mb-4">
        {title}
      </h2>

      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-800 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 text-right">
        {valueOrDash(value)}
      </span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={18} />
        <h2 className="font-semibold">{title}</h2>
      </div>

      <span className="text-xs text-slate-500">
        {count}
      </span>
    </div>
  );
}

export default function Customer360() {
  const { companyId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const customerSupportTickets = data.customer_support_tickets || [];
  const loadCustomer = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.get(`/customers/${companyId}`);
      setData(result);
    } catch (err) {
      console.error('Failed to load customer:', err);

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Unable to load company'
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  if (loading) {
    return (
      <div className="p-6 text-slate-400">
        Loading company...
      </div>
    );
  }

  if (error || !data?.company) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft size={16} />
          Back to customers
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <h1 className="text-lg font-semibold mb-2">
            Company not found
          </h1>

          <p className="text-sm text-slate-400">
            {error || 'The requested company could not be loaded.'}
          </p>
        </div>
      </div>
    );
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
  } = data;

  return (
    <div className="p-6 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/customers')}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to customers
      </button>

      <CompanyHeader company={company} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            navigate(`/customers/${company.company_id}/subscription`)
          }
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
        >
          <CreditCard size={16} />
          Subscription
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard title="Users">
          <div className="text-2xl font-semibold">
            {users.length}
          </div>
        </InfoCard>

        <InfoCard title="Open tickets">
          <div className="text-2xl font-semibold">
            {ticket_stats.open || 0}
          </div>
        </InfoCard>

        <InfoCard title="Related parties">
          <div className="text-2xl font-semibold">
            {related_parties.length}
          </div>
        </InfoCard>

        <InfoCard title="Provisioned companies">
          <div className="text-2xl font-semibold">
            {provisioned_companies.length}
          </div>
        </InfoCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InfoCard title="Company information">
          <InfoRow label="Company ID" value={company.company_id} />
          <InfoRow label="System code" value={company.system_company_code} />
          <InfoRow label="Client code" value={company.client_code} />
          <InfoRow label="Industry" value={company.industry} />
          <InfoRow label="Sub-industry" value={company.sub_industry} />
          <InfoRow label="Currency" value={company.currency} />
          <InfoRow label="Country" value={company.country} />
          <InfoRow label="Organisation type" value={company.organization_type} />
          <InfoRow label="Entity kind" value={company.entity_kind} />
          <InfoRow label="Registration number" value={company.company_reg_no} />
          <InfoRow label="TIN" value={company.tin} />
          <InfoRow label="VAT" value={company.vat} />
        </InfoCard>

        <InfoCard title="Contact & lifecycle">
          <InfoRow label="Email" value={company.company_email} />
          <InfoRow label="Phone" value={company.company_phone} />
          <InfoRow label="Created via" value={company.created_via} />
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

      {source_company && (
        <InfoCard title="Provisioned by">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">
                {source_company.company_name}
              </div>

              <div className="text-sm text-slate-500 mt-1">
                Company #{source_company.company_id}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(`/customers/${source_company.company_id}`)
              }
              className="text-slate-400 hover:text-white"
            >
              <ExternalLink size={17} />
            </button>
          </div>

          {company.provisioning_context && (
            <div className="mt-4 text-sm text-slate-400">
              {company.provisioning_context}
            </div>
          )}
        </InfoCard>
      )}

      <InfoCard title="Corporate related parties">
        <SectionHeader
          icon={Network}
          title="Corporate relationships"
          count={related_parties.length}
        />

        {related_parties.length === 0 ? (
          <div className="text-sm text-slate-500">
            No active corporate relationships recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {related_parties.map((relationship) => (
              <div
                key={relationship.relationship_id}
                className="border border-slate-800 rounded-lg p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {relationship.related_company_name}
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      {relationship.relationship_type}
                      {' · '}
                      {relationship.relationship_direction}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/customers/${relationship.related_company_id}`
                      )
                    }
                    className="text-slate-400 hover:text-white"
                  >
                    <ExternalLink size={17} />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">
                      Ownership
                    </div>
                    <div>
                      {valueOrDash(relationship.ownership_percent)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Voting
                    </div>
                    <div>
                      {valueOrDash(relationship.voting_percent)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Control
                    </div>
                    <div>
                      {valueOrDash(relationship.control_basis)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Consolidation
                    </div>
                    <div>
                      {valueOrDash(relationship.consolidation_method)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Provisioned companies">
        <SectionHeader
          icon={Users}
          title="Companies provisioned from this company"
          count={provisioned_companies.length}
        />

        {provisioned_companies.length === 0 ? (
          <div className="text-sm text-slate-500">
            No companies are currently recorded as provisioned by this company.
          </div>
        ) : (
          <div className="space-y-3">
            {provisioned_companies.map((item) => (
              <div
                key={item.company_id}
                className="border border-slate-800 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">
                    {item.company_name}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    Company #{item.company_id}
                    {' · '}
                    {item.currency || '—'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate(`/customers/${item.company_id}`)
                  }
                  className="text-slate-400 hover:text-white"
                >
                  <ExternalLink size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InfoCard title="Branches">
          <SectionHeader
            icon={GitBranch}
            title="Internal branches"
            count={branches.length}
          />

          {branches.length === 0 ? (
            <div className="text-sm text-slate-500">
              No branches recorded.
            </div>
          ) : (
            <div className="space-y-3">
              {branches.map((branch) => (
                <div
                  key={branch.branch_id}
                  className="border border-slate-800 rounded-lg p-4"
                >
                  <div className="font-medium">
                    {branch.name}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {valueOrDash(branch.code)}
                    {' · '}
                    {valueOrDash(branch.country)}
                  </div>

                  {branch.phone && (
                    <div className="text-sm text-slate-400 mt-3 flex items-center gap-2">
                      <Phone size={14} />
                      {branch.phone}
                    </div>
                  )}

                  {branch.email && (
                    <div className="text-sm text-slate-400 mt-2 flex items-center gap-2">
                      <Mail size={14} />
                      {branch.email}
                    </div>
                  )}

                  {branch.address && (
                    <div className="text-sm text-slate-400 mt-2 flex items-center gap-2">
                      <MapPin size={14} />
                      {branch.address}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard title="Segments">
          <SectionHeader
            icon={Layers}
            title="Company segments"
            count={segments.length}
          />

          {segments.length === 0 ? (
            <div className="text-sm text-slate-500">
              No segments recorded.
            </div>
          ) : (
            <div className="space-y-3">
              {segments.map((segment) => (
                <div
                  key={segment.segment_id}
                  className="border border-slate-800 rounded-lg p-4"
                >
                  <div className="font-medium">
                    {segment.name}
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    {valueOrDash(segment.code)}
                    {' · '}
                    {valueOrDash(segment.segment_type)}
                  </div>

                  {segment.description && (
                    <div className="text-sm text-slate-400 mt-3">
                      {segment.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      </div>

      <InfoCard title="Engagements">
        <SectionHeader
          icon={BriefcaseBusiness}
          title="Company engagements"
          count={engagements.length}
        />

        {engagements.length === 0 ? (
          <div className="text-sm text-slate-500">
            No active engagements recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {engagements.map((engagement) => (
              <div
                key={engagement.id}
                className="border border-slate-800 rounded-lg p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {engagement.engagement_name}
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      {valueOrDash(engagement.engagement_code)}
                      {' · '}
                      {valueOrDash(engagement.engagement_type)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    {valueOrDash(engagement.status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">
                      Priority
                    </div>
                    <div>
                      {valueOrDash(engagement.priority)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Workflow
                    </div>
                    <div>
                      {valueOrDash(engagement.workflow_stage)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Start
                    </div>
                    <div>
                      {valueOrDash(engagement.start_date)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">
                      Due
                    </div>
                    <div>
                      {valueOrDash(engagement.due_date)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <InfoCard title="Control activity">
        <SectionHeader
          icon={Ticket}
          title="Support tickets"
          count={tickets.length}
        />

        {tickets.length === 0 ? (
          <div className="text-sm text-slate-500">
            No Control tickets recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="border border-slate-800 rounded-lg p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {ticket.subject}
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      {ticket.ticket_number}
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    {ticket.status}
                  </div>
                </div>

                <div className="text-sm text-slate-500 mt-3">
                  {ticket.priority}
                  {' · '}
                  {ticket.ticket_type}
                  {ticket.agent_name
                    ? ` · ${ticket.agent_name}`
                    : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </InfoCard>

      <div className="space-y-4">
        <SectionHeader
          icon={Ticket}
          title="Customer Support Tickets"
          subtitle="Tickets created from the customer's FinSage workspace"
        />

        {customerSupportTickets.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
            No customer support tickets found.
          </div>
        ) : (
          <div className="space-y-3">
            {customerSupportTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-white">
                      {ticket.subject}
                    </div>

                    <div className="mt-1 text-xs text-slate-400">
                      Ticket #{ticket.id} · {ticket.status} · {ticket.priority}
                    </div>

                    {ticket.email && (
                      <div className="mt-2 text-xs text-slate-500">
                        {ticket.email}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const controlTicket =
                        await api.post(
                          `/customers/${company.company_id}/support-tickets/${ticket.id}/escalate`
                        );

                      navigate(`/tickets/${controlTicket.id}`);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                  >
                    <ArrowUpRight size={15} />
                    Escalate
                  </button>
                </div>

                {ticket.description && (
                  <div className="mt-3 text-sm text-slate-300">
                    {ticket.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}