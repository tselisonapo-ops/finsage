import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { Search, Building2, ArrowUpRight } from 'lucide-react'

export default function CustomerList() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(
    params.get('search') || ''
  )

  const page = parseInt(params.get('page') || '1')
  const perPage = 20

  const fetchCustomers = useCallback(async () => {
    setLoading(true)

    try {
      const qs = new URLSearchParams({
        page,
        per_page: perPage,
        ...(params.get('search') && {
          search: params.get('search'),
        }),
      }).toString()

      const data = await api.get(`/customers?${qs}`)

      setCustomers(data.customers || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [params, page])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  const totalPages = Math.ceil(total / perPage)

  const handleSearch = () => {
    const p = new URLSearchParams(params)

    if (search.trim()) {
      p.set('search', search.trim())
    } else {
      p.delete('search')
    }

    p.delete('page')
    setParams(p)
  }

  const handlePrevious = () => {
    const p = new URLSearchParams(params)
    p.set('page', String(page - 1))
    setParams(p)
  }

  const handleNext = () => {
    const p = new URLSearchParams(params)
    p.set('page', String(page + 1))
    setParams(p)
  }

  return (
    <div className="w-full min-h-full p-5 lg:p-6 space-y-6">

      {/* Header */}
      <div className="
        flex flex-col
        gap-3
        sm:flex-row
        sm:items-center
        sm:justify-between
      ">
        <div>
          <h1 className="text-xl font-semibold text-surface-100">
            Customers
          </h1>

          <p className="text-sm text-surface-400 mt-1">
            {total} compan{total !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="
        flex
        flex-col
        sm:flex-row
        gap-2
        w-full
      ">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="
              absolute
              left-3
              top-1/2
              -translate-y-1/2
              w-4 h-4
              text-surface-400
            "
          />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch()
              }
            }}
            placeholder="Search companies..."
            className="
              w-full
              bg-surface-800
              border border-surface-600
              rounded-lg
              pl-9 pr-3 py-2.5
              text-sm
              text-surface-100
              placeholder:text-surface-400
              focus:outline-none
              focus:border-accent
              focus:ring-1
              focus:ring-accent/30
              transition-colors
            "
          />
        </div>

        <button
          type="button"
          onClick={handleSearch}
          className="
            px-4 py-2.5
            rounded-lg
            bg-accent
            text-surface-900
            text-sm
            font-medium
            hover:bg-accent-hover
            transition-colors
          "
        >
          Search
        </button>
      </div>

      {/* Customer List */}
      <div className="
        finsage-card-dark
        overflow-hidden
      ">
        {loading ? (
          <div className="
            p-10
            text-center
            text-sm
            text-surface-400
          ">
            Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <div className="
            p-12
            text-center
          ">
            <div className="
              w-12 h-12
              rounded-xl
              bg-accent-muted
              border border-accent/20
              flex items-center justify-center
              mx-auto
              mb-4
            ">
              <Building2
                className="w-6 h-6 text-accent"
              />
            </div>

            <p className="
              text-surface-200
              text-sm
              font-medium
            ">
              No companies found
            </p>

            {search && (
              <p className="
                text-surface-400
                text-xs
                mt-1
              ">
                Try adjusting your search.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Responsive table wrapper */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="
                    bg-surface-700/70
                    border-b border-surface-600
                    text-xs
                    text-surface-400
                    uppercase
                    tracking-wide
                  ">
                    <th className="
                      text-left
                      px-4 py-3
                      font-medium
                    ">
                      Company
                    </th>

                    <th className="
                      text-left
                      px-4 py-3
                      font-medium
                    ">
                      Industry
                    </th>

                    <th className="
                      text-center
                      px-4 py-3
                      font-medium
                    ">
                      Users
                    </th>

                    <th className="
                      text-center
                      px-4 py-3
                      font-medium
                    ">
                      Open Tickets
                    </th>

                    <th className="
                      text-left
                      px-4 py-3
                      font-medium
                    ">
                      Modules
                    </th>

                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-surface-600">
                  {customers.map((c) => {
                    let modules = []

                    try {
                      modules = c.enabled_modules
                        ? typeof c.enabled_modules === 'string'
                          ? JSON.parse(c.enabled_modules)
                          : c.enabled_modules
                        : []
                    } catch {
                      modules = []
                    }

                    return (
                      <tr
                        key={c.company_id}
                        onClick={() =>
                          navigate(
                            `/customers/${c.company_id}`
                          )
                        }
                        className="
                          group
                          hover:bg-surface-700/40
                          cursor-pointer
                          transition-colors
                        "
                      >
                        {/* Company */}
                        <td className="px-4 py-3">
                          <div className="
                            flex
                            items-center
                            gap-3
                          ">
                            <div className="
                              w-9 h-9
                              rounded-lg
                              bg-accent-muted
                              flex
                              items-center
                              justify-center
                              shrink-0
                            ">
                              <Building2
                                className="
                                  w-4 h-4
                                  text-accent
                                "
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="
                                text-sm
                                font-medium
                                text-surface-100
                                truncate
                              ">
                                {c.company_name}
                              </div>

                              <div className="
                                text-xs
                                text-surface-400
                                mt-0.5
                              ">
                                ID: {c.company_id}
                                {' · '}
                                {c.currency || 'ZAR'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Industry */}
                        <td className="
                          px-4 py-3
                          text-sm
                          text-surface-200
                        ">
                          {c.industry || '—'}

                          {c.sub_industry && (
                            <span className="
                              text-surface-400
                            ">
                              {' / '}
                              {c.sub_industry}
                            </span>
                          )}
                        </td>

                        {/* Users */}
                        <td className="
                          px-4 py-3
                          text-center
                          text-sm
                          text-surface-200
                        ">
                          {c.user_count || 0}
                        </td>

                        {/* Open Tickets */}
                        <td className="
                          px-4 py-3
                          text-center
                        ">
                          <span
                            className={`
                              inline-flex
                              min-w-7
                              justify-center
                              px-2 py-1
                              rounded-md
                              text-sm
                              font-medium
                              ${
                                c.open_ticket_count > 0
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-surface-700 text-surface-300'
                              }
                            `}
                          >
                            {c.open_ticket_count || 0}
                          </span>
                        </td>

                        {/* Modules */}
                        <td className="px-4 py-3">
                          <div className="
                            flex
                            flex-wrap
                            gap-1
                            max-w-sm
                          ">
                            {modules
                              .slice(0, 3)
                              .map((m, i) => (
                                <span
                                  key={i}
                                  className="
                                    text-xs
                                    bg-surface-600
                                    text-surface-200
                                    px-2 py-1
                                    rounded-md
                                    border
                                    border-surface-500/50
                                  "
                                >
                                  {typeof m === 'string'
                                    ? m.replace(/_/g, ' ')
                                    : m}
                                </span>
                              ))}

                            {modules.length > 3 && (
                              <span className="
                                text-xs
                                bg-accent-muted
                                text-accent
                                px-2 py-1
                                rounded-md
                              ">
                                +{modules.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Open */}
                        <td className="px-4 py-3">
                          <div className="
                            w-8 h-8
                            rounded-lg
                            flex
                            items-center
                            justify-center
                            text-surface-500
                            group-hover:text-accent
                            group-hover:bg-accent-muted
                            transition-colors
                          ">
                            <ArrowUpRight
                              className="w-4 h-4"
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="
                px-4 py-3
                border-t border-surface-600
                flex
                items-center
                justify-between
                gap-4
              ">
                <span className="
                  text-xs
                  text-surface-400
                ">
                  Page {page} of {totalPages}
                </span>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={handlePrevious}
                    className="
                      px-3 py-1.5
                      rounded-lg
                      text-xs
                      text-surface-200
                      bg-surface-700
                      border border-surface-600
                      hover:bg-surface-600
                      disabled:opacity-30
                      disabled:cursor-not-allowed
                      transition-colors
                    "
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={handleNext}
                    className="
                      px-3 py-1.5
                      rounded-lg
                      text-xs
                      text-surface-200
                      bg-surface-700
                      border border-surface-600
                      hover:bg-surface-600
                      disabled:opacity-30
                      disabled:cursor-not-allowed
                      transition-colors
                    "
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}