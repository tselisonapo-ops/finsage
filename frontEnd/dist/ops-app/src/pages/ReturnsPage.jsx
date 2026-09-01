import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { opsApi, getCompanyId } from "../api/api";

export default function ReturnsPage() {
  const { receiptId } = useParams();
  const companyId = getCompanyId();
  const navigate = useNavigate();

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New return form state
  const [newReturn, setNewReturn] = useState({
    return_reason: "defective",
    return_type: "credit",
    lines: [],
    notes: ""
  });

  useEffect(() => {
    if (companyId && receiptId) {
      loadReturns();
    }
  }, [companyId, receiptId]);

  const loadReturns = async () => {
    try {
      setLoading(true);
      const data = await opsApi.returns(companyId, parseInt(receiptId));
      setReturns(data.rows || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReturn = async () => {
    try {
      const created = await opsApi.createReturn(companyId, parseInt(receiptId), newReturn);
      setShowCreateModal(false);
      setNewReturn({ return_reason: "defective", return_type: "credit", lines: [], notes: "" });
      loadReturns(); // Refresh list
      navigate(`/procurement/receipts/${receiptId}/returns/${created.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmitReturn = async (returnId) => {
    try {
      await opsApi.submitReturn(companyId, parseInt(receiptId), returnId, {});
      loadReturns();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApproveReturn = async (returnId) => {
    try {
      await opsApi.approveReturn(companyId, parseInt(receiptId), returnId, {
        decision: "credit",
        approval_notes: "Approved"
      });
      loadReturns();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProcessReturn = async (returnId) => {
    try {
      await opsApi.processReturn(companyId, parseInt(receiptId), returnId, {
        gl_credit_account: "4500",
        gl_debit_account: "1200"
      });
      loadReturns();
    } catch (err) {
      setError(err.message);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: "bg-gray-100 text-gray-800",
      submitted: "bg-blue-100 text-blue-800",
      under_review: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      processing: "bg-purple-100 text-purple-800",
      completed: "bg-green-100 text-green-900",
      cancelled: "bg-gray-100 text-gray-600"
    };
    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.draft}`;
  };

  const getReasonBadge = (reason) => {
    const labels = {
      defective: "Defective",
      wrong_item: "Wrong Item",
      excess: "Excess Quantity",
      damaged_in_transit: "Damaged in Transit",
      quality_issue: "Quality Issue",
      expired: "Expired",
      other: "Other"
    };
    return labels[reason] || reason;
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">Please select a company to view returns.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Returns Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Receipt #{receiptId} • Manage vendor returns and credits
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          New Return
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
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
          {/* Returns List */}
          {returns.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No returns found</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating a new return for this receipt.</p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {returns.map((ret) => (
                  <li key={ret.id}>
                    <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0 flex-1">
                          <div className="min-w-0 flex-1 px-4 md:grid md:grid-cols-2 md:gap-4">
                            <div>
                              <p className="text-sm font-medium text-indigo-600 truncate">
                                {ret.return_number}
                              </p>
                              <p className="mt-1 flex items-center text-sm text-gray-500">
                                <span className={getStatusBadge(ret.status)}>
                                  {ret.status.replace("_", " ").toUpperCase()}
                                </span>
                                <span className="ml-2">{getReasonBadge(ret.return_reason)}</span>
                              </p>
                            </div>
                            <div className="hidden md:block">
                              <div>
                                <p className="text-sm text-gray-900">
                                  Value: ${(ret.total_return_value || 0).toLocaleString()}
                                </p>
                                <p className="mt-1 text-sm text-gray-500">
                                  Created: {new Date(ret.created_at).toLocaleDateString()}
                                  {ret.approved_at && ` • Approved: ${new Date(ret.approved_at).toLocaleDateString()}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-4 space-x-2">
                          {/* Action buttons based on status */}
                          {ret.status === "draft" && (
                            <button
                              onClick={() => handleSubmitReturn(ret.id)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700"
                            >
                              Submit
                            </button>
                          )}
                          {(ret.status === "submitted" || ret.status === "under_review") && (
                            <button
                              onClick={() => handleApproveReturn(ret.id)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700"
                            >
                              Approve
                            </button>
                          )}
                          {ret.status === "approved" && (
                            <button
                              onClick={() => handleProcessReturn(ret.id)}
                              className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-purple-600 hover:bg-purple-700"
                            >
                              Process
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/procurement/receipts/${receiptId}/returns/${ret.id}`)}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Create Return Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Create New Return
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Return Reason</label>
                        <select
                          value={newReturn.return_reason}
                          onChange={(e) => setNewReturn({ ...newReturn, return_reason: e.target.value })}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                          <option value="defective">Defective</option>
                          <option value="wrong_item">Wrong Item Received</option>
                          <option value="excess">Excess Quantity</option>
                          <option value="damaged_in_transit">Damaged in Transit</option>
                          <option value="quality_issue">Quality Issue</option>
                          <option value="expired">Expired</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Resolution Type</label>
                        <select
                          value={newReturn.return_type}
                          onChange={(e) => setNewReturn({ ...newReturn, return_type: e.target.value })}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                          <option value="credit">Vendor Credit</option>
                          <option value="replace">Replacement</option>
                          <option value="dispose">Dispose</option>
                          <option value="repair">Repair</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                          value={newReturn.notes}
                          onChange={(e) => setNewReturn({ ...newReturn, notes: e.target.value })}
                          rows={3}
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border-gray-300 rounded-md"
                          placeholder="Describe the reason for return..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleCreateReturn}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Create Return
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
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
