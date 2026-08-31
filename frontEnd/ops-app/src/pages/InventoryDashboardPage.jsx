
import React, { useState, useEffect, useCallback } from 'react';
import { opsApi } from '../../api/api';
import './InventoryDashboardPage.css';

const InventoryDashboardPage = ({ companyId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [warehouses, setWarehouses] = useState([]);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await opsApi.inventoryDashboard(
        companyId,
        selectedWarehouse || null
      );

      if (data) {
        setDashboardData(data);

        // Extract warehouses from breakdown for filter dropdown
        if (data.warehouse_breakdown) {
          setWarehouses(data.warehouse_breakdown);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load inventory dashboard');
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedWarehouse]);

  useEffect(() => {
    if (companyId) {
      fetchDashboard();
    }
  }, [companyId, fetchDashboard]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Format currency
  const formatCurrency = (value) => {
    if (!value && value !== 0) return 'R0.00';
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(value);
  };

  // Format number with commas
  const formatNumber = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('en-ZA').format(value);
  };

  // Get alert severity class
  const getAlertClass = (status) => {
    switch (status) {
      case 'out_of_stock': return 'alert-critical';
      case 'reorder_now': return 'alert-warning';
      case 'low_stock': return 'alert-info';
      default: return 'alert-ok';
    }
  };

  if (loading) {
    return (
      <div className="inventory-dashboard">
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading inventory data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inventory-dashboard">
        <div className="dashboard-error">
          <i className="icon-alert-circle"></i>
          <p>{error}</p>
          <button onClick={fetchDashboard} className="btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  const { summary, valuation, alerts, recent_receipts, recent_adjustments, 
          active_stocktakes, top_movers, warehouse_breakdown } = dashboardData || {};

  return (
    <div className="inventory-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Inventory Management</h1>
        <div className="header-actions">
          <select 
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="warehouse-filter"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((wh) => (
              <option key={wh.warehouse_id} value={wh.warehouse_id}>
                {wh.warehouse_name} ({wh.warehouse_code})
              </option>
            ))}
          </select>
          <a href={`/companies/${companyId}/ops/reports/inventory`} className="btn-secondary">
            View Reports
          </a>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon card-icon-items">
            <i className="icon-package"></i>
          </div>
          <div className="card-content">
            <span className="card-label">Total Items</span>
            <span className="card-value">{formatNumber(summary?.total_items)}</span>
            <span className="card-sublabel">{formatNumber(summary?.tracked_items)} tracked</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon card-icon-stock">
            <i className="icon-bar-chart-2"></i>
          </div>
          <div className="card-content">
            <span className="card-label">Items in Stock</span>
            <span className="card-value">{formatNumber(summary?.items_with_stock)}</span>
            <span className="card-sublabel">with quantity {'>'} 0</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon card-icon-value">
            <i className="icon-dollar-sign"></i>
          </div>
          <div className="card-content">
            <span className="card-label">Total Value (AVG)</span>
            <span className="card-value">{formatCurrency(valuation?.total_value_avg)}</span>
            <span className="card-sublabel">{formatNumber(valuation?.total_on_hand_qty)} units</span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon card-icon-warehouse">
            <i className="icon-home"></i>
          </div>
          <div className="card-content">
            <span className="card-label">Active Warehouses</span>
            <span className="card-value">{formatNumber(summary?.active_warehouses)}</span>
            <span className="card-sublabel">{formatNumber(summary?.active_locations)} locations</span>
          </div>
        </div>
      </div>

      {/* Reorder Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="section alerts-section">
          <div className="section-header">
            <h2><i className="icon-alert-triangle"></i> Reorder Alerts</h2>
            <span className={`badge badge-alerts ${alerts.length > 5 ? 'badge-many' : ''}`}>
              {alerts.length} items need attention
            </span>
          </div>
          
          <div className="alerts-table-container">
            <table className="data-table alerts-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Item Name</th>
                  <th>Location</th>
                  <th>On Hand</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 10).map((alert, idx) => (
                  <tr key={idx} className={getAlertClass(alert.alert_status)}>
                    <td className="sku-cell">{alert.sku}</td>
                    <td>{alert.item_name}</td>
                    <td>{alert.location_code || alert.warehouse_name || '-'}</td>
                    <td className="qty-cell">{formatNumber(alert.on_hand_qty)}</td>
                    <td>{formatNumber(alert.reorder_level)}</td>
                    <td>
                      <span className={`status-badge status-${alert.alert_status}`}>
                        {alert.alert_status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {alerts.length > 10 && (
            <div className="section-footer">
              <a href={`/companies/${companyId}/ops/inventory/alerts`} className="link-view-all">
                View all {alerts.length} alerts →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Two Column Layout: Valuation + Recent Activity */}
      <div className="two-column-layout">
        {/* Warehouse Breakdown / Valuation by Category */}
        <div className="section valuation-section">
          <div className="section-header">
            <h2><i className="icon-pie-chart"></i> Inventory by Location</h2>
          </div>
          
          <div className="valuation-list">
            {warehouse_breakdown && warehouse_breakdown.map((wh, idx) => (
              <div key={idx} className="valuation-item">
                <div className="valuation-info">
                  <span className="location-name">{wh.warehouse_name}</span>
                  <span className="location-code">{wh.warehouse_code}</span>
                </div>
                <div className="valuation-stats">
                  <span className="stat-items">{formatNumber(wh.item_count)} items</span>
                  <span className="stat-qty">{formatNumber(wh.total_qty)} qty</span>
                  <span className="stat-value">{formatCurrency(wh.total_value)}</span>
                </div>
                {wh.total_qty > 0 && (
                  <div className="valuation-bar">
                    <div 
                      className="bar-fill"
                      style={{ width: `${Math.min((wh.total_qty / Math.max(...warehouse_breakdown.map(w => w.total_qty))) * 100, 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>
            ))}
            
            {(!warehouse_breakdown || warehouse_breakdown.length === 0) && (
              <div className="empty-state">
                <p>No warehouse data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Receipts */}
        <div className="section recent-section">
          <div className="section-header">
            <h2><i className="icon-clock"></i> Recent Receipts</h2>
            <a href={`/companies/${companyId}/ops/inventory/transactions?tx_type=receipt`} className="link-view-all">
              View All →
            </a>
          </div>
          
          <div className="recent-list">
            {recent_receipts && recent_receipts.slice(0, 8).map((receipt, idx) => (
              <div key={idx} className="recent-item">
                <div className="recent-info">
                  <span className="ref-number">{receipt.ref}</span>
                  <span className="date">{receipt.tx_date}</span>
                </div>
                <div className="recent-stats">
                  <span className="line-count">{receipt.line_count} lines</span>
                  <span className="total-value">{formatCurrency(receipt.total_value)}</span>
                </div>
                {receipt.vendor_name && (
                  <span className="vendor-name">{receipt.vendor_name}</span>
                )}
              </div>
            ))}
            
            {(!recent_receipts || recent_receipts.length === 0) && (
              <div className="empty-state">
                <p>No recent receipts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Stocktakes + Top Movers */}
      <div className="two-column-layout">
        {/* Active Stocktakes */}
        <div className="section stocktake-section">
          <div className="section-header">
            <h2><i className="icon-clipboard-check"></i> Active Stocktakes</h2>
            <a href={`/companies/${companyId}/ops/stocktakes`} className="btn-small btn-secondary">
              Manage Stocktakes
            </a>
          </div>
          
          <div className="stocktake-list">
            {active_stocktakes && active_stocktakes.slice(0, 5).map((st, idx) => (
              <div key={idx} className="stocktake-item">
                <div className="stocktake-info">
                  <span className="session-name">{st.session_name}</span>
                  <span className={`type-badge type-${st.stocktake_type}`}>{st.stocktake_type}</span>
                </div>
                <div className="stocktake-progress">
                  <div className="progress-text">
                    {st.items_counted || 0} / {st.total_items || 0} counted
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${st.total_items ? ((st.items_counted || 0) / st.total_items) * 100 : 0}%` }}
                    ></div>
                  </div>
                  {st.items_with_variance > 0 && (
                    <span className="variance-count">
                      {st.items_with_variance} variance(s)
                    </span>
                  )}
                </div>
              </div>
            ))}
            
            {(!active_stocktakes || active_stocktakes.length === 0) && (
              <div className="empty-state">
                <p>No active stocktakes</p>
                <a href={`/companies/${companyId}/ops/stocktakes/new`} className="btn-small btn-primary">
                  Start New Stocktake
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Top Movers */}
        <div className="section movers-section">
          <div className="section-header">
            <h2><i className="icon-trending-up"></i> Top Movers (30 Days)</h2>
          </div>
          
          <div className="movers-list">
            {top_movers && top_movers.slice(0, 8).map((item, idx) => (
              <div key={idx} className="mover-item">
                <span className="rank">#{idx + 1}</span>
                <div className="mover-info">
                  <span className="item-sku">{item.sku}</span>
                  <span className="item-name">{item.item_name}</span>
                </div>
                <div className="mover-stats">
                  <span className="movement-qty">{formatNumber(item.total_movement)} {item.unit}</span>
                  <span className="tx-count">{item.tx_count} TXs</span>
                </div>
              </div>
            ))}
            
            {(!top_movers || top_movers.length === 0) && (
              <div className="empty-state">
                <p>No movement data in last 30 days</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <a href={`/companies/${companyId}/ops/receipts/new`} className="action-btn btn-receipt">
            <i className="icon-plus-circle"></i>
            New Receipt
          </a>
          <a href={`/companies/${companyId}/ops/stocktakes/new`} className="action-btn btn-stocktake">
            <i className="icon-clipboard"></i>
            Start Stocktake
          </a>
          <a href={`/company/${companyId}/ops/items/new`} className="action-btn btn-item">
            <i className="icon-plus"></i>
            Add Item
          </a>
          <a href={`/companies/${companyId}/ops/inventory/adjustment`} className="action-btn btn-adjustment">
            <i className="icon-edit"></i>
            Adjustment
          </a>
          <button 
            onClick={() => handleBulkHandoff()} 
            className="action-btn btn-handoff"
            disabled={!recent_receipts?.length}
          >
            <i className="icon-upload"></i>
            Handoff Pending
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryDashboardPage;
