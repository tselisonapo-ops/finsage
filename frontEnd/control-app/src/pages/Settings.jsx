import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { PRIORITIES } from '../lib/constants'
import {
  Users,
  Shield,
  Tag,
  Clock,
  Plus,
  Save,
} from 'lucide-react'

const TABS = [
  { key: 'agents', label: 'Agents', icon: Users },
  { key: 'teams', label: 'Teams', icon: Shield },
  { key: 'categories', label: 'Categories', icon: Tag },
  { key: 'slas', label: 'SLAs', icon: Clock },
]

const inputClass = `
  w-full
  bg-surface-700
  border border-surface-500
  rounded-lg
  px-3 py-2
  text-sm
  text-surface-100
  placeholder:text-surface-400
  focus:outline-none
  focus:border-accent
  focus:ring-1
  focus:ring-accent/30
  transition-colors
`

const primaryButtonClass = `
  inline-flex
  items-center
  justify-center
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
`

const secondaryButtonClass = `
  inline-flex
  items-center
  justify-center
  gap-2
  bg-surface-700
  hover:bg-surface-600
  border border-surface-500
  text-surface-200
  text-sm
  font-medium
  px-4
  py-2
  rounded-lg
  transition-colors
`

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
        api
          .get('/settings/agents?include_inactive=true')
          .catch(() => []),
        api
          .get('/settings/teams')
          .catch(() => []),
        api
          .get('/settings/categories')
          .catch(() => []),
        api
          .get('/settings/slas')
          .catch(() => []),
      ])

      setAgents(a || [])
      setTeams(t || [])
      setCategories(c || [])
      setSlas(s || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-surface-100">
          Settings
        </h1>

        <p className="text-sm text-surface-300 mt-1">
          Configure agents, teams, ticket categories, and SLA policies.
        </p>
      </div>

      {/* Tabs */}
      <div className="
        border-b
        border-surface-600
        overflow-x-auto
      ">
        <div className="flex min-w-max">
          {TABS.map((item) => {
            const Icon = item.icon
            const active = tab === item.key

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`
                  flex
                  items-center
                  gap-2
                  px-4
                  py-3
                  text-sm
                  font-medium
                  border-b-2
                  transition-colors
                  whitespace-nowrap
                  ${
                    active
                      ? 'border-accent text-accent'
                      : 'border-transparent text-surface-300 hover:text-surface-100 hover:border-surface-500'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="
          rounded-xl
          border border-surface-600
          bg-surface-800
          p-8
          text-center
          text-sm
          text-surface-400
        ">
          Loading settings...
        </div>
      ) : (
        <div>
          {tab === 'agents' && (
            <AgentsTab
              agents={agents}
              teams={teams}
              onRefresh={fetchAll}
              isAdmin={isAdmin}
            />
          )}

          {tab === 'teams' && (
            <TeamsTab
              teams={teams}
              onRefresh={fetchAll}
              isAdmin={isAdmin}
            />
          )}

          {tab === 'categories' && (
            <CategoriesTab
              categories={categories}
              onRefresh={fetchAll}
              isAdmin={isAdmin}
            />
          )}

          {tab === 'slas' && (
            <SlasTab
              slas={slas}
              onRefresh={fetchAll}
              isAdmin={isAdmin}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// AGENTS TAB
// ─────────────────────────────────────────────

function AgentsTab({
  agents,
  teams,
  onRefresh,
  isAdmin,
}) {
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    user_id: '',
    display_name: '',
    role: 'agent',
    team_id: '',
    max_tickets: 15,
  })

  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      await api.post('/settings/agents', {
        user_id: parseInt(form.user_id),
        display_name: form.display_name,
        role: form.role,
        team_id: form.team_id
          ? parseInt(form.team_id)
          : null,
        max_tickets: parseInt(form.max_tickets),
      })

      setShowForm(false)

      setForm({
        user_id: '',
        display_name: '',
        role: 'agent',
        team_id: '',
        max_tickets: 15,
      })

      onRefresh()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {isAdmin && (
        <div>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className={primaryButtonClass}
          >
            <Plus className="w-4 h-4" />
            Add Agent
          </button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <form
          onSubmit={create}
          className="
            bg-surface-800
            rounded-xl
            border border-surface-600
            p-5
          "
        >
          <div className="
            grid
            grid-cols-1
            md:grid-cols-2
            xl:grid-cols-4
            gap-4
            mb-4
          ">
            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                FinSage User ID
              </label>

              <input
                type="number"
                required
                value={form.user_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    user_id: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Display Name
              </label>

              <input
                type="text"
                required
                value={form.display_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    display_name: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Role
              </label>

              <select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value,
                  })
                }
                className={inputClass}
              >
                <option value="admin">
                  Admin
                </option>

                <option value="senior_agent">
                  Senior Agent
                </option>

                <option value="agent">
                  Agent
                </option>

                <option value="viewer">
                  Viewer
                </option>
              </select>
            </div>

            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Team
              </label>

              <select
                value={form.team_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    team_id: e.target.value,
                  })
                }
                className={inputClass}
              >
                <option value="">
                  None
                </option>

                {teams.map((team) => (
                  <option
                    key={team.id}
                    value={team.id}
                  >
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className={primaryButtonClass}
            >
              <Save className="w-4 h-4" />

              {saving
                ? 'Saving...'
                : 'Save Agent'}
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Agents Table */}
      <div className="
        bg-surface-800
        rounded-xl
        border border-surface-600
        overflow-hidden
      ">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="
                bg-surface-700/70
                border-b border-surface-600
                text-xs
                text-surface-300
                uppercase
                tracking-wide
              ">
                <th className="
                  text-left
                  px-4 py-3
                  font-medium
                ">
                  Name
                </th>

                <th className="
                  text-left
                  px-4 py-3
                  font-medium
                ">
                  Email
                </th>

                <th className="
                  text-left
                  px-4 py-3
                  font-medium
                ">
                  Role
                </th>

                <th className="
                  text-left
                  px-4 py-3
                  font-medium
                ">
                  Team
                </th>

                <th className="
                  text-center
                  px-4 py-3
                  font-medium
                ">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-600">
              {agents.map((agent) => (
                <tr
                  key={agent.id}
                  className="
                    hover:bg-surface-700/40
                    transition-colors
                  "
                >
                  <td className="
                    px-4 py-3
                    text-sm
                    text-surface-100
                    font-medium
                  ">
                    {agent.display_name}
                  </td>

                  <td className="
                    px-4 py-3
                    text-sm
                    text-surface-300
                  ">
                    {agent.user_email}
                  </td>

                  <td className="px-4 py-3">
                    <span className="
                      inline-flex
                      items-center
                      text-xs
                      capitalize
                      bg-surface-600
                      text-surface-200
                      px-2
                      py-1
                      rounded-md
                    ">
                      {agent.role?.replace(
                        '_',
                        ' '
                      )}
                    </span>
                  </td>

                  <td className="
                    px-4 py-3
                    text-sm
                    text-surface-300
                  ">
                    {agent.team_name || '—'}
                  </td>

                  <td className="
                    px-4 py-3
                    text-center
                  ">
                    <span className="
                      inline-flex
                      items-center
                      gap-2
                      text-xs
                      text-surface-300
                    ">
                      <span
                        className={`
                          w-2
                          h-2
                          rounded-full
                          ${
                            agent.is_active
                              ? 'bg-success'
                              : 'bg-error'
                          }
                        `}
                      />

                      {agent.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}

              {!agents.length && (
                <tr>
                  <td
                    colSpan="5"
                    className="
                      px-4 py-10
                      text-center
                      text-sm
                      text-surface-400
                    "
                  >
                    No agents configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// TEAMS TAB
// ─────────────────────────────────────────────

function TeamsTab({
  teams,
  onRefresh,
  isAdmin,
}) {
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
  })

  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      await api.post('/settings/teams', form)

      setShowForm(false)

      setForm({
        name: '',
        description: '',
      })

      onRefresh()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className={primaryButtonClass}
        >
          <Plus className="w-4 h-4" />
          Add Team
        </button>
      )}

      {showForm && (
        <form
          onSubmit={create}
          className="
            bg-surface-800
            rounded-xl
            border border-surface-600
            p-5
          "
        >
          <div className="
            grid
            grid-cols-1
            lg:grid-cols-2
            gap-4
            mb-4
          ">
            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Name
              </label>

              <input
                type="text"
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Description
              </label>

              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className={primaryButtonClass}
            >
              <Save className="w-4 h-4" />

              {saving
                ? 'Saving...'
                : 'Save Team'}
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="
        grid
        grid-cols-1
        lg:grid-cols-2
        xl:grid-cols-3
        gap-4
      ">
        {teams.map((team) => (
          <div
            key={team.id}
            className="
              bg-surface-800
              rounded-xl
              border border-surface-600
              p-5
              hover:border-surface-500
              hover:bg-surface-700/40
              transition-colors
            "
          >
            <div className="flex items-start gap-3">
              <div className="
                w-9 h-9
                rounded-lg
                bg-accent-muted
                text-accent
                flex
                items-center
                justify-center
                shrink-0
              ">
                <Shield className="w-4 h-4" />
              </div>

              <div className="min-w-0">
                <div className="
                  text-sm
                  font-semibold
                  text-surface-100
                ">
                  {team.name}
                </div>

                <div className="
                  text-xs
                  text-surface-400
                  mt-1
                ">
                  {team.description ||
                    'No description'}
                </div>

                <div className="
                  text-xs
                  text-surface-300
                  mt-3
                ">
                  {team.agent_count} agent
                  {team.agent_count !== 1
                    ? 's'
                    : ''}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!teams.length && (
          <div className="
            lg:col-span-2
            xl:col-span-3
            rounded-xl
            border border-surface-600
            bg-surface-800
            px-5 py-10
            text-center
            text-sm
            text-surface-400
          ">
            No teams configured.
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CATEGORIES TAB
// ─────────────────────────────────────────────

function CategoriesTab({
  categories,
  onRefresh,
  isAdmin,
}) {
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    sort_order: 0,
  })

  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      await api.post('/settings/categories', {
        ...form,
        sort_order: parseInt(form.sort_order),
      })

      setShowForm(false)

      setForm({
        name: '',
        description: '',
        sort_order: 0,
      })

      onRefresh()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className={primaryButtonClass}
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      )}

      {showForm && (
        <form
          onSubmit={create}
          className="
            bg-surface-800
            rounded-xl
            border border-surface-600
            p-5
          "
        >
          <div className="
            grid
            grid-cols-1
            md:grid-cols-2
            xl:grid-cols-3
            gap-4
            mb-4
          ">
            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Name
              </label>

              <input
                type="text"
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Description
              </label>

              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="
                block
                text-xs
                font-medium
                text-surface-300
                mb-1.5
              ">
                Sort Order
              </label>

              <input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sort_order: e.target.value,
                  })
                }
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className={primaryButtonClass}
            >
              <Save className="w-4 h-4" />

              {saving
                ? 'Saving...'
                : 'Save Category'}
            </button>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="
        bg-surface-800
        rounded-xl
        border border-surface-600
        overflow-hidden
      ">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="
                bg-surface-700/70
                border-b border-surface-600
                text-xs
                text-surface-300
                uppercase
                tracking-wide
              ">
                <th className="
                  text-left
                  px-4 py-3
                  font-medium
                ">
                  Category
                </th>

                <th className="
                  text-left
                  px-4 py-3
                  font-medium
                ">
                  Description
                </th>

                <th className="
                  text-center
                  px-4 py-3
                  font-medium
                ">
                  Tickets
                </th>

                <th className="
                  text-center
                  px-4 py-3
                  font-medium
                ">
                  Active
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-600">
              {categories.map((category) => (
                <tr
                  key={category.id}
                  className="
                    hover:bg-surface-700/40
                    transition-colors
                  "
                >
                  <td className="
                    px-4 py-3
                    text-sm
                    text-surface-100
                    font-medium
                  ">
                    {category.name}
                  </td>

                  <td className="
                    px-4 py-3
                    text-xs
                    text-surface-400
                    max-w-md
                    truncate
                  ">
                    {category.description ||
                      'No description'}
                  </td>

                  <td className="
                    px-4 py-3
                    text-center
                    text-sm
                    text-surface-300
                  ">
                    {category.ticket_count || 0}
                  </td>

                  <td className="
                    px-4 py-3
                    text-center
                  ">
                    <span className="
                      inline-flex
                      items-center
                      gap-2
                      text-xs
                      text-surface-300
                    ">
                      <span
                        className={`
                          w-2
                          h-2
                          rounded-full
                          ${
                            category.is_active
                              ? 'bg-success'
                              : 'bg-error'
                          }
                        `}
                      />

                      {category.is_active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}

              {!categories.length && (
                <tr>
                  <td
                    colSpan="4"
                    className="
                      px-4 py-10
                      text-center
                      text-sm
                      text-surface-400
                    "
                  >
                    No categories configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// SLAS TAB
// ─────────────────────────────────────────────

function SlasTab({
  slas,
  onRefresh,
  isAdmin,
}) {
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const startEdit = (sla) => {
    setEditing(sla.id)

    setForm({
      response_minutes:
        sla.response_minutes,
      resolution_hours:
        sla.resolution_hours,
    })
  }

  const save = async (id) => {
    setSaving(true)

    try {
      await api.put(
        `/settings/slas/${id}`,
        {
          response_minutes:
            parseInt(form.response_minutes),
          resolution_hours:
            parseInt(form.resolution_hours),
        }
      )

      setEditing(null)
      onRefresh()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="
      grid
      grid-cols-1
      xl:grid-cols-2
      gap-4
    ">
      {slas.map((sla) => {
        const priority = PRIORITIES.find(
          (item) =>
            item.value === sla.priority
        )

        return (
          <div
            key={sla.id}
            className="
              bg-surface-800
              rounded-xl
              border border-surface-600
              p-5
              hover:border-surface-500
              transition-colors
            "
          >
            <div className="
              flex
              items-start
              justify-between
              gap-4
              mb-4
            ">
              <div className="
                flex
                items-center
                gap-3
              ">
                <PriorityDot
                  priority={priority}
                />

                <div>
                  <span
                    className={`
                      text-sm
                      font-semibold
                      ${
                        priority?.color ||
                        'text-surface-100'
                      }
                    `}
                  >
                    {sla.name}
                  </span>

                  <div className="
                    text-xs
                    text-surface-400
                    mt-0.5
                    capitalize
                  ">
                    {sla.priority || 'Priority'}
                  </div>
                </div>
              </div>

              {isAdmin &&
                editing !== sla.id && (
                  <button
                    type="button"
                    onClick={() =>
                      startEdit(sla)
                    }
                    className="
                      text-xs
                      font-medium
                      text-accent
                      hover:text-accent-hover
                      transition-colors
                    "
                  >
                    Edit
                  </button>
                )}
            </div>

            {editing === sla.id ? (
              <div className="
                space-y-4
              ">
                <div className="
                  grid
                  grid-cols-1
                  md:grid-cols-2
                  gap-4
                ">
                  <div>
                    <label className="
                      block
                      text-xs
                      text-surface-400
                      mb-1.5
                    ">
                      Response (min)
                    </label>

                    <input
                      type="number"
                      value={
                        form.response_minutes
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          response_minutes:
                            e.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="
                      block
                      text-xs
                      text-surface-400
                      mb-1.5
                    ">
                      Resolution (hrs)
                    </label>

                    <input
                      type="number"
                      value={
                        form.resolution_hours
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          resolution_hours:
                            e.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      save(sla.id)
                    }
                    disabled={saving}
                    className={primaryButtonClass}
                  >
                    <Save className="w-4 h-4" />

                    {saving
                      ? 'Saving...'
                      : 'Save'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditing(null)
                    }
                    className={secondaryButtonClass}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="
                grid
                grid-cols-1
                sm:grid-cols-2
                gap-3
              ">
                <div className="
                  rounded-lg
                  bg-surface-900/60
                  border border-surface-600
                  px-4 py-3
                ">
                  <div className="
                    text-[11px]
                    uppercase
                    tracking-wide
                    text-surface-400
                  ">
                    Response
                  </div>

                  <div className="
                    text-sm
                    text-surface-100
                    font-semibold
                    mt-1
                  ">
                    {sla.response_minutes} min
                  </div>
                </div>

                <div className="
                  rounded-lg
                  bg-surface-900/60
                  border border-surface-600
                  px-4 py-3
                ">
                  <div className="
                    text-[11px]
                    uppercase
                    tracking-wide
                    text-surface-400
                  ">
                    Resolution
                  </div>

                  <div className="
                    text-sm
                    text-surface-100
                    font-semibold
                    mt-1
                  ">
                    {sla.resolution_hours} hrs
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {!slas.length && (
        <div className="
          xl:col-span-2
          rounded-xl
          border border-surface-600
          bg-surface-800
          px-5 py-10
          text-center
          text-sm
          text-surface-400
        ">
          No SLA policies configured.
        </div>
      )}
    </div>
  )
}

function PriorityDot({ priority }) {
  if (!priority) {
    return (
      <span className="
        w-3
        h-3
        rounded-full
        bg-surface-500
      " />
    )
  }

  return (
    <span
      className={`
        w-3
        h-3
        rounded-full
        shrink-0
        ${priority.dot}
      `}
    />
  )
}