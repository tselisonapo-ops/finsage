import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { opsApi, getCompanyId } from "../api/api";

export default function ContractsPage() {
  const companyId = getCompanyId();
  const navigate = useNavigate();

  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  
  // New contract form state
  const [newContract, setNewContract] = useState({
    vendor_id: "",
    title: "",
    contract_type: "supply",
    start_date: "",
    end_date: "",
    value: "",
    currency: "USD",
    payment_terms: "net_30",
    auto_renew: false,
    primary_contact_name: "",
    primary_contact_email: ""
  });

  useEffect(() => {
    if (companyId) {
      loadContracts();
    }
  }, [companyId, statusFilter]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      const data = await opsApi.procurementContracts(companyId, { status: statusFilter });
      setContracts(data.rows || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContract = async () => {
    try {
      const created = await opsApi.createProcurementContract(companyId, newContract);
      setShowCreateModal(false);
      resetForm();
      loadContracts();
      navigate(`/procurement/contracts/${created.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleActivate = async (contractId) => {
    try {
      await opsApi.activateContract(companyId, contractId, {});
      loadContracts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTerminate = async (contractId) => {
    if (!window.confirm("Are you sure you want to terminate this contract?")) return;
    
    try {
      await opsApi.terminateContract(companyId, contractId, {
        termination_reason: "mutual_convenience",
        notes: "Terminated by user"
      });
      loadContracts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRenew = async (contractId) => {
    try {
      // Default to extend by 1 year
      const contract = contracts.find(c => c.id === contractId);
      if (contract?.end_date) {
        const currentEnd = new Date(contract.end_date);
        const newEnd = new Date(currentEnd.setFullYear(currentEnd.getFullYear() + 1));
        
        await opsApi.renewContract(companyId, contractId, {
          new_end_date: newEnd.toISOString().split('T')[0],
          value_increase: 0,
          notes: "Annual renewal"
        });
        loadContracts();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setNewContract({
      vendor_id: "",
      title: "",
      contract_type: "supply",
      start_date: "",
      end_date: "",
      value: "",
      currency: "USD",
      payment_terms: "net_30",
      auto_renew: false,
      primary_contact_name: "",
      primary_contact_email: ""
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: "bg-gray-100 text-gray-800",
      pending_approval: "bg-yellow-100 text-yellow-800",
      active: "bg-green-100 text-green-800",
      expired: "bg-red-100 text-red-800",
      terminated: "bg-red-100 text-red-900",
      cancelled: "bg-gray-100 text-gray-600",
      pending_renewal: "bg-orange-100 text-orange-800",
      suspended: "bg-purple-100 text-purple-800"
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.draft}`;
  };

  const getTypeBadge = (type) => {
    const labels = {
      supply: "Supply Agreement",
      service: "Service Contract",
      framework: "Framework Agreement",
      blanket: "Blanket Order",
      maintenance: "Maintenance Contract"
    };
    return labels[type] || type;
  };

  const getDaysUntilExpiry = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { days: diffDays, class: "text-red-600", label: "Expired" };
    if (diffDays <= 30) return { days: diffDays, class: "text-red-600", label: "Expiring Soon" };
    if (diffDays <= 90) return { days: diffDays, class: "text-yellow-600", label: "Renewal Due" };
    return { days: diffDays, class: "text-green-600", label: "Active" };
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">Please select a company to view contracts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procurement Contracts</h1>
          <p className="mt-1 text-sm text-gray-500">Manage vendor agreements and contracts</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Contract
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center space-x-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
            <option value="pending_renewal">Pending Renewal</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={() => setError(null)} className="mt-1 text-sm text-red-700 underline hover:text-red-900">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {/* Contracts List */}
          {contracts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No contracts found</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating a new procurement contract.</p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contract</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contracts.map((contract) => {
                    const expiryInfo = getDaysUntilExpiry(contract.end_date);
                    return (
                      <tr key={contract.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-indigo-600">{contract.contract_number}</div>
                          <div className="text-sm text-gray-500">{contract.title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{contract.vendor_name}</div>
                          <div className="text-sm text-gray-500">{contract.primary_contact_email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {getTypeBadge(contract.contract_type)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${Number(contract.value || 0).toLocaleString()} {contract.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>{contract.start_date} → {contract.end_date}</div>
                          {expiryInfo && (
                            <div className={`text-xs ${expiryInfo.class}`}>
                              {expiryInfo.label}: {Math.abs(expiryInfo.days)}d
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={getStatusBadge(contract.status)}>
                            {contract.status.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          <button
                            onClick={() => navigate(`/procurement/contracts/${contract.id}`)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View
                          </button>
                          
                          {contract.status === "draft" && (
                            <button
                              onClick={() => handleActivate(contract.id)}
                              className="text-green-600 hover:text-green-900 ml-3"
                            >
                              Activate
                            </button>
                          )}
                          
                          {(contract.status === "active" || contract.status === "pending_renewal") && (
                            <>
                              <button
                                onClick={() => handleRenew(contract.id)}
                                className="text-blue-600 hover:text-blue-900 ml-3"
                              >
                                Renew
                              </button>
                              <button
                                onClick={() => handleTerminate(contract.id)}
                                className="text-red-600 hover:text-red-900 ml-3"
                              >
                                Terminate
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Create Contract Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Create New Procurement Contract
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Contract Title *</label>
                    <input
                      type="text"
                      value={newContract.title}
                      onChange={(e) => setNewContract({ ...newContract, title: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="e.g., Annual IT Supplies Agreement"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Vendor ID *</label>
                    <input
                      type="number"
                      value={newContract.vendor_id}
                      onChange={(e) => setNewContract({ ...newContract, vendor_id: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="Vendor ID"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Contract Type</label>
                    <select
                      value={newContract.contract_type}
                      onChange={(e) => setNewContract({ ...newContract, contract_type: e.target.value })}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 sm:text-sm rounded-md"
                    >
                      <option value="supply">Supply Agreement</option>
                      <option value="service">Service Contract</option>
                      <option value="framework">Framework Agreement</option>
                      <option value="blanket">Blanket Order</option>
                      <option value="maintenance">Maintenance Contract</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Start Date *</label>
                    <input
                      type="date"
                      value={newContract.start_date}
                      onChange={(e) => setNewContract({ ...newContract, start_date: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">End Date *</label>
                    <input
                      type="date"
                      value={newContract.end_date}
                      onChange={(e) => setNewContract({ ...newContract, end_date: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Value ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newContract.value}
                      onChange={(e) => setNewContract({ ...newContract, value: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Currency</label>
                    <select
                      value={newContract.currency}
                      onChange={(e) => setNewContract({ ...newContract, currency: e.target.value })}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 sm:text-sm rounded-md"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="ZAR">ZAR - South African Rand</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment Terms</label>
                    <select
                      value={newContract.payment_terms}
                      onChange={(e) => setNewContract({ ...newContract, payment_terms: e.target.value })}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 sm:text-sm rounded-md"
                    >
                      <option value="net_15">Net 15</option>
                      <option value="net_30">Net 30</option>
                      <option value="net_45">Net 45</option>
                      <option value="net_60">Net 60</option>
                      <option value="cod">COD</option>
                    </select>
                  </div>

                  <div className="col-span-2 flex items-center">
                    <input
                      id="auto_renew"
                      type="checkbox"
                      checked={newContract.auto_renew}
                      onChange={(e) => setNewContract({ ...newContract, auto_renew: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="auto_renew" className="ml-2 block text-sm text-gray-900">
                      Auto-renew this contract
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Primary Contact Name</label>
                    <input
                      type="text"
                      value={newContract.primary_contact_name}
                      onChange={(e) => setNewContract({ ...newContract, primary_contact_name: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Primary Contact Email</label>
                    <input
                      type="email"
                      value={newContract.primary_contact_email}
                      onChange={(e) => setNewContract({ ...newContract, primary_contact_email: e.target.value })}
                      className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleCreateContract}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Create Contract
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetForm(); }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
