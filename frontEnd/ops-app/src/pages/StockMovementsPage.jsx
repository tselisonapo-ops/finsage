// ============================================================
// FinSage Nexus - Phase 6: Stock Movements Page
// ============================================================
// Shows transaction history for inventory items with
// running balance, filtering, and detail views

import React, { useState, useEffect, useCallback } from 'react';
import request from '../../utils/request';
import './StockMovementsPage.css';

const StockMovementsPage = ({ companyId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [movementsData, setMovementsData] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [items, setItems] = useState([]);
  
  // Filters
  const [filters, setFilters] = useState({
    item_id: '',
    tx_type: '',
    from_date: '',
    to_date: '',
    limit: 50,
    offset: 0,
  });

  // Fetch items for dropdown (on-hand items)
  const fetchItems = useCallback(async () => {
    try {
      const response = await request(`/api/companies/${companyId}/ops/inventory/on-hand`, {
        method: 'GET',
        params: { include_zero_qty: false },
      });
      
      if (response.data) {
        setItems(response.data);
      }
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  }, [companyId]);

  // Fetch movements for selected item or list all transactions
  const fetchMovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let data;
      
      if (filters.item_id) {
        // Get specific item movements with running balance
        const response = await request(
          `/api/companies/${companyId}/ops/inventory/items/${filters.item_id}/movements`,
          { method: 'GET', params: filters }
        );
        data = response.data;
      } else {
        // Get all transactions list
        const response = await request(
          `/api/companies/${companyId}/ops/inventory/transactions`,
          { method: 'GET', params: filters }
        );
        data = response.data;
      }
      
      setMovementsData(data);
      
      // If item selected, also get item detail
      if (filters.item_id && !selectedItem) {
        const itemResponse = await request(
          `/api/companies/${companyId}/ops/inventory/items/${filters.item_id}`,
          { method: 'GET' }
        );
        setSelectedItem(itemResponse.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load stock movements');
    } finally {
      setLoading(false);
    }
  }, [companyId, filters, selectedItem]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0, // Reset pagination on filter change
    }));
  };

  // Handle item selection
  const handleItemSelect = (itemId) => {
    setSelectedItem(null); // Clear to refetch
    handleFilterChange('item_id', itemId || '');
  };

  // Format helpers
  const formatCurrency = (value) => {
    if (!value && value !== 0) return 'R0.00';
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(value);
  };

  const formatNumber = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('en-ZA').format(value);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get TX type badge class
  const getTxTypeClass = (type) => {
    switch ((type || '').toLowerCase()) {
      case 'receipt': return 'tx-receipt';
      case 'issue': return 'tx-issue';
      case 'adjustment': return 'tx-adjustment';
      case 'transfer': return 'tx-transfer';
      default: return 'tx-other';
    }
  };

  // Pagination
  const handlePrevPage = () => {
    setFilters(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit),
    }));
  };

  const handleNextPage = () => {
    if (!movementsData?.pagination) return;
    const { limit, total } = movementsData.pagination;
    const maxOffset = Math.floor((total - 1) / limit) * limit;
    
    setFilters(prev => ({
      ...prev,
      offset: Math.min(prev.offset + limit, maxOffset),
    }));
  };

  if (loading && !movementsData) {
    return (
      <div className="stock-movements">
        <div className="page-loading">
          <div className="loading-spinner"></div>
          <p>Loading stock movements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stock-movements">
      {/* Header */}
      <div className="page-header">
        <div className="header-left">
          <h1>Stock Movements</h1>
          <span className="subtitle">Transaction history and running balances</span>
        </div>
        <div className="header-right">
          <button onClick={fetchMovements} className="btn-refresh">
            <i className="icon-refresh-cw"></i> Refresh
          </button>
          <button onClick={() => window.print()} className="btn-print">
            <i className="icon-printer"></i> Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="item-select">Item</label>
          <select
            id="item-select"
            value={filters.item_id}
            onChange={(e) => handleItemSelect(e.target.value)}
            className="filter-select"
          >
            <option value="">All Items</option>
            {items.map((item) => (
              <option key={item.item_id} value={item.item_id}>
                {item.sku} - {item.item_name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="type-filter">Type</label>
          <select
            id="type-filter"
            value={filters.tx_type}
            onChange={(e) => handleFilterChange('tx_type', e.target.value)}
            className="filter-select"
          >
            <option value="">All Types</option>
            <option value="receipt">Receipt</option>
            <option value="issue">Issue</option>
            <option value="adjustment">Adjustment</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="from-date">From</label>
          <input
            id="from-date"
            type="date"
            value={filters.from_date}
            onChange={(e) => handleFilterChange('from_date', e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="to-date">To</label>
          <input
            id="to-date"
            type="date"
            value={filters.to_date}
            onChange={(e) => handleFilterChange('to_date', e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-actions">
          <button 
            onClick={() => setFilters({
              item_id: '', tx_type: '', from_date: '', to_date: '',
              limit: 50, offset: 0,
            })}
            className="btn-clear"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Selected Item Info */}
      {selectedItem && (
        <div className="selected-item-card">
          <div className="item-main-info">
            <h3>{selectedItem.name}</h3>
            <span className="item-sku">{selectedItem.sku}</span>
            {selectedItem.barcode && (
              <span className="item-barcode">Barcode: {selectedItem.barcode}</span>
            )}
          </div>
          
          {selectedItem.on_hand && (
            <div className="item-onhand-stats">
              <div className="stat">
                <span className="stat-label">On Hand</span>
                <span className="stat-value">{formatNumber(selectedItem.on_hand.on_hand_qty)}</span>
                <span className="stat-unit">{selectedItem.unit}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Avg Cost</span>
                <span className="stat-value">{formatCurrency(selectedItem.on_hand.avg_unit_cost)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Total Value</span>
                <span className="stat-value">{formatCurrency(selectedItem.on_hand.fifo_value)}</span>
              </div>
            </div>
          )}
          
          {selectedItem.default_location_id && (
            <div className="item-location">
              <i className="icon-map-pin"></i>
              <span>{selectedItem.location_code} - {selectedItem.location_name}</span>
            </div>
          )}
        </div>
      )}

      {/* Opening Balance (for single item view) */}
      {movementsData?.opening_balance && (
        <div className="opening-balance">
          <span className="balance-label">Opening Balance:</span>
          <span className="balance-qty">{formatNumber(movementsData.opening_balance.qty)} units</span>
          <span className="balance-value">{formatCurrency(movementsData.opening_balance.value)}</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="error-banner">
          <i className="icon-alert-circle"></i>
          <span>{error}</span>
          <button onClick={fetchMovements} className="btn-small btn-primary">Retry</button>
        </div>
      )}

      {/* Movements Table */}
      <div className="movements-table-container">
        <table className="data-table movements-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Type</th>
              {!filters.item_id && <th>Item</th>}
              <th className="qty-col">Qty</th>
              <th className="cost-col">Unit Cost</th>
              <th className="total-col">Total</th>
              {(filters.item_id || movementsData?.movements?.[0]?.running_balance_qty !== undefined) && (
                <th className="balance-col">Balance</th>
              )}
              <th>Source</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {movementsData?.transactions && movementsData.transactions.map((tx, idx) => (
              <tr key={idx} className={getTxTypeClass(tx.tx_type)}>
                <td className="date-cell">{formatDate(tx.tx_date)}</td>
                <td className="ref-cell">{tx.ref}</td>
                <td>
                  <span className={`tx-badge ${getTxTypeClass(tx.tx_type)}`}>
                    {(tx.tx_type || '').toUpperCase()}
                  </span>
                </td>
                {!filters.item_id && (
                  <td>
                    <span className="item-link" onClick={() => handleItemSelect(tx.item_id)}>
                      {tx.sku || `#${tx.item_id}`}
                    </span>
                  </td>
                )}
                <td className={`qty-cell ${tx.qty > 0 ? 'qty-in' : 'qty-out'}`}>
                  {tx.qty > 0 ? '+' : ''}{formatNumber(tx.qty)}
                </td>
                <td className="cost-cell">{formatCurrency(tx.unit_cost)}</td>
                <td className="total-cell">
                  {formatCurrency((tx.qty || 0) * (tx.unit_cost || 0))}
                </td>
                {(filters.item_id || tx.running_balance_qty !== undefined) && (
                  <td className="balance-cell">
                    <span className={`balance-value ${tx.running_balance_qty < 0 ? 'negative' : ''}`}>
                      {formatNumber(tx.running_balance_qty)}
                    </span>
                  </td>
                )}
                <td className="source-cell">
                  {tx.vendor_name || tx.source || '-'}
                </td>
                <td className="notes-cell">
                  <span className="notes-text">{tx.notes || tx.tx_notes || '-'}</span>
                </td>
              </tr>
            ))}
            
            {(!movementsData?.transactions?.length && !loading) && (
              <tr>
                <td colSpan={10} className="empty-row">
                  <div className="empty-state">
                    <i className="icon-inbox"></i>
                    <p>No transactions found matching your criteria</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {movementsData?.pagination && (
        <div className="pagination-bar">
          <div className="pagination-info">
            Showing {filters.offset + 1} - {Math.min(filters.offset + filters.limit, movementsData.pagination.total)} of {movementsData.pagination.total} records
          </div>
          <div className="pagination-controls">
            <button 
              onClick={handlePrevPage} 
              disabled={filters.offset === 0}
              className="btn-page"
            >
              ← Previous
            </button>
            <button 
              onClick={handleNextPage} 
              disabled={filters.offset + filters.limit >= movementsData.pagination.total}
              className="btn-page"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Summary Footer */}
      {movementsData?.movements && (
        <div className="summary-footer">
          <div className="summary-row">
            <span>Total Records:</span>
            <strong>{movementsData.total_records || movementsData.movements.length}</strong>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockMovementsPage;
