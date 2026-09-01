import React, { useState, useEffect } from "react";
import { opsApi, getCompanyId } from "../api/api";

export default function ProcurementDashboardPage() {
  const companyId = getCompanyId();

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("current_month");
  const [activeTab, setActiveTab] = useState("overview");

  // Analytics data states
  const [spendByVendor, setSpendByVendor] = useState([]);
  const [spendByCategory, setSpendByCategory] = useState([]);
  const [cycleTime, setCycleTime] = useState([]);
  const [savings, setSavings] = useState([]);
  const [compliance, setCompliance] = useState([]);

  useEffect(() => {
    if (companyId) {
      loadDashboard();
    }
  }, [companyId, period]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      
      // Load main dashboard
      const dashData = await opsApi.procurementDashboard(companyId, { period });
      setDashboardData(dashData);

      // Load analytics in parallel
      const [vendorData, categoryData, cycleData, savingsData, complianceData] = await Promise.all([
        opsApi.procurementSpendByVendor(companyId, {}).catch(() => ({ rows: [] })),
        opsApi.procurementSpendByCategory(companyId, {}).catch(() => ({ rows: [] })),
        opsApi.procurementCycleTime(companyId, {}).catch(() => ({ rows: [] })),
        opsApi.savingsAnalysis(companyId, {}).catch(() => ({ details: [], summary: {} })),
        opsApi.complianceReport(companyId, {}).catch(() => ({ rows: [], summary: {} }))
      ]);

      setSpendByVendor(vendorData.rows || []);
      setSpendByCategory(categoryData.rows || []);
      setCycleTime(cycleData.rows || []);
      setSavings(savingsData.details || []);
      setCompliance(complianceData.rows || []);

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value || 0);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US').format(value || 0);
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">Please select a company to view dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procurement Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Analytics, insights, and performance metrics</p>
        </div>
        
        {/* Period Selector */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          <option value="current_week">This Week</option>
          <option value="current_month">This Month</option>
          <option value="current_quarter">This Quarter</option>
          <option value="current_year">This Year</option>
          <option value="last_30d">Last 30 Days</option>
          <option value="last_90d">Last 90 Days</option>
          <option value="last_12m">Last 12 Months</option>
        </select>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="mt-1 text-sm text-red-700 underline hover:text-red-900">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {dashboardData?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2m0 0c0 1.105-1.343 2-3 2s-3 .895-3-2m9-4h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Spend</dt>
                    <dd className="text-lg font-medium text-gray-900">{formatCurrency(dashboardData.summary.total_spend)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Purchase Orders</dt>
                    <dd className="text-lg font-medium text-gray-900">{formatNumber(dashboardData.summary.po_count)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Pending Approvals</dt>
                    <dd className="text-lg font-medium text-yellow-600">{formatNumber(dashboardData.summary.pending_approvals)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Overdue Deliveries</dt>
                    <dd className="text-lg font-medium text-red-600">{formatNumber(dashboardData.summary.overdue_deliveries)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {["overview", "spend-vendor", "spend-category", "cycle-time", "savings", "compliance"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white shadow rounded-lg p-6">
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Alerts */}
            {dashboardData?.alerts?.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Alerts</h3>
                <div className="space-y-2">
                  {dashboardData.alerts.map((alert, idx) => (
                    <div key={idx} className={`p-3 rounded-md ${
                      alert.severity === "high" ? "bg-red-50" :
                      alert.severity === "warning" ? "bg-yellow-50" : "bg-blue-50"
                    }`}>
                      <p className={`text-sm ${
                        alert.severity === "high" ? "text-red-800" :
                        alert.severity === "warning" ? "text-yellow-800" : "text-blue-800"
                      }`}>{alert.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Distribution */}
            {dashboardData?.charts?.status_distribution?.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">PO Status Distribution</h3>
                <div className="space-y-2">
                  {dashboardData.charts.status_distribution.map((status, idx) => (
                    <div key={idx} className="flex items-center">
                      <div className="w-32 text-sm text-gray-600">{status.status}</div>
                      <div className="flex-1 mx-4 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{ width: `${(status.count / dashboardData.charts.status_distribution.reduce((acc, s) => acc + s.count, 0)) * 100}%` }}
                        ></div>
                      </div>
                      <div className="w-16 text-sm text-gray-900 text-right">{status.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spend by Vendor Tab */}
        {activeTab === "spend-vendor" && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Vendors by Spend</h3>
            {spendByVendor.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No vendor data available for this period.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Count</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spend</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Unit Price</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {spendByVendor.slice(0, 20).map((vendor, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                        {vendor.vendor_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatNumber(vendor.po_count)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(vendor.total_spend)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(vendor.avg_unit_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Spend by Category Tab */}
        {activeTab === "spend-category" && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Spend by Category</h3>
            {spendByCategory.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No category data available.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {spendByCategory.map((cat, idx) => (
                  <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="text-sm text-gray-500">{cat.category_description || cat.category_code}</div>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{formatCurrency(cat.total_spend)}</div>
                    <div className="text-xs text-gray-500 mt-1">{formatNumber(cat.po_count)} POs • {formatNumber(cat.total_quantity)} units</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cycle Time Tab */}
        {activeTab === "cycle-time" && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Procurement Cycle Time Analysis</h3>
            {cycleTime.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No cycle time data available.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requests</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PR → PO (days)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO → Award (days)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Cycle (days)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {cycleTime.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(row.month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatNumber(row.request_count)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.avg_pr_to_po_days || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.avg_po_to_award_days || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.avg_total_cycle_days || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Savings Tab */}
        {activeTab === "savings" && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Savings Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600">Total Actual Spend</div>
                <div className="text-2xl font-bold text-green-900">{formatCurrency(savings.reduce((acc, r) => acc + (r.actual_spend || 0), 0))}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600">Quoted Value</div>
                <div className="text-2xl font-bold text-blue-900">{formatCurrency(savings.reduce((acc, r) => acc + (r.quoted_value || 0), 0))}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm text-purple-600">Total Savings</div>
                <div className="text-2xl font-bold text-purple-900">{formatCurrency(savings.reduce((acc, r) => acc + (r.savings_amount || 0), 0))}</div>
              </div>
            </div>
            
            {savings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No savings data available.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quoted</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Savings</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">% Saved</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {savings.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.month ? new Date(row.month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.vendor_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.actual_spend)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(row.quoted_value)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">{formatCurrency(row.savings_amount)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.savings_percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Compliance Tab */}
        {activeTab === "compliance" && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Compliance Report</h3>
            {compliance.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No compliance data available.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-gray-900">{compliance.length}</div>
                    <div className="text-sm text-gray-500">Total POs</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-900">
                      {compliance.filter(c => c.compliance_status === "compliant").length}
                    </div>
                    <div className="text-sm text-green-600">Compliant</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-900">
                      {compliance.filter(c => c.compliance_status === "non_compliant").length}
                    </div>
                    <div className="text-sm text-red-600">Non-Compliant</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-900">
                      {compliance.filter(c => c.compliance_status === "pending").length}
                    </div>
                    <div className="text-sm text-yellow-600">Pending</div>
                  </div>
                </div>

                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Compliance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {compliance.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                          {row.purchase_order_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.status}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            row.compliance_status === "compliant" ? "bg-green-100 text-green-800" :
                            row.compliance_status === "non_compliant" ? "bg-red-100 text-red-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {row.compliance_status.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(row.total_value)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.compliance_issue || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {/* Last Updated */}
      <div className="mt-6 text-xs text-gray-500 text-right">
        Last updated: {dashboardData?.generated_at ? new Date(dashboardData.generated_at).toLocaleString() : "-"}
      </div>
    </div>
  );
}
