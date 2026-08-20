// ============================================================
// FinSage Nexus - Phase 6: Stocktake Management Page
// ============================================================
// Full stocktake workflow: create sessions, count items,
// review variances, complete and post adjustments

import React, { useState, useEffect, useCallback } from 'react';
import request from '../../utils/request';
import './StocktakePage.css';

const StocktakePage = ({ companyId }) => {
  // Views: list | active | create
  const [currentView, setCurrentView] = useState('list');
  
  // Data states
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionLines, setSessionLines] = useState([]);
  const [variances, setVariances] = useState([]);
  
  // Loading/Error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Form state for new stocktake
  const [formData, setFormData] = useState({
    session_name: '',
    stocktake_type: 'full',
    count_method: 'system-directed',
    warehouse_id: '',
    scheduled_date: '',
    variance_threshold_pct: 5,
    notes: '',
  });
  
  // Counting state
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [countInput, setCountInput] = useState('');

  // Fetch all stocktake sessions
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await request(`/api/companies/${companyId}/ops/stocktakes`, {
        method: 'GET',
      });
      
      if (response.data) {
        setSessions(response.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load stocktake sessions');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Fetch single session detail
  const fetchSessionDetail = useCallback(async (sessionId) => {
    setLoading(true);
    
    try {
      const response = await request(
        `/api/companies/${companyId}/ops/stocktakes/${sessionId}`,
        { method: 'GET' }
      );
      
      if (response.data) {
        setActiveSession(response.data);
        
        // Also fetch variances
        const varResponse = await request(
          `/api/companies/${companyId}/ops/stocktakes/${sessionId}/variances`,
          { method: 'GET' }
        );
        setVariances(varResponse.data || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Create new stocktake session
  const handleCreateStocktake = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const response = await request(`/api/companies/${companyId}/ops/stocktakes`, {
        method: 'POST',
        data: formData,
      });
      
      if (response.data) {
        setSuccessMessage(`Stocktake "${response.data.session_name}" created successfully!`);
        setCurrentView('active');
        fetchSessionDetail(response.data.id);
        fetchSessions();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create stocktake');
    } finally {
      setLoading(false);
    }
  };

  // Update line count
  const handleUpdateCount = async (lineId, countedQty) => {
    setError(null);
    
    try {
      await request(
        `/api/companies/${companyId}/ops/stocktakes/${activeSession.id}/lines/${lineId}`,
        {
          method: 'PUT',
          data: {
            counted_qty: parseFloat(countedQty),
            notes: countInput,
          },
        }
      );
      
      // Refresh session data
      await fetchSessionDetail(activeSession.id);
      
      // Move to next line or stay
      setCurrentLineIndex(prev => Math.min(prev + 1, sessionLines.length - 1));
      setCountInput('');
      
      setSuccessMessage('Count saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update count');
    }
  };

  // Complete stocktake session
  const handleCompleteStocktake = async () => {
    if (!confirm('Complete this stocktake? This will post any variances to inventory.')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await request(
        `/api/companies/${companyId}/ops/stocktakes/${activeSession.id}/complete`,
        {
          method: 'POST',
          data: {
            post_adjustments: true,
            adjustment_notes: `Auto-adjustment from stocktake: ${activeSession.session_name}`,
          },
        }
      );
      
      if (response.data) {
        setSuccessMessage('Stocktake completed! Adjustments posted.');
        fetchSessionDetail(activeSession.id);
        fetchSessions();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to complete stocktake');
    } finally {
      setLoading(false);
    }
  };

  // Format helpers
  const formatCurrency = (value) => {
    if (!value && value !== 0) return 'R0.00';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
  };

  const formatNumber = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('en-ZA').format(value);
  };

  // Calculate progress percentage
  const getProgressPercent = () => {
    if (!activeSession?.total_items || !activeSession?.items_counted) return 0;
    return Math.round((activeSession.items_counted / activeSession.total_items) * 100);
  };

  // Render List View
  const renderListView = () => (
    <div className="stocktake-list-view">
      <div className="view-header">
        <h2>Stocktake Sessions</h2>
        <button 
          onClick={() => setCurrentView('create')}
          className="btn-primary"
        >
          <i className="icon-plus"></i> New Stocktake
        </button>
      </div>

      {sessions.length === 0 && !loading ? (
        <div className="empty-state">
          <i className="icon-clipboard"></i>
          <p>No stocktake sessions found</p>
          <button 
            onClick={() => setCurrentView('create')}
            className="btn-secondary"
          >
            Start your first stocktake
          </button>
        </div>
      ) : (
        <div className="sessions-table-container">
          <table className="data-table sessions-table">
            <thead>
              <tr>
                <th>Session Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Items</th>
                <th>Variances</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td className="session-name-cell">{session.session_name}</td>
                  <td>
                    <span className={`type-badge type-${session.stocktake_type}`}>
                      {session.stocktake_type?.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${session.status}`}>
                      {session.status?.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {session.status === 'completed' ? (
                      <span className="complete-badge">100%</span>
                    ) : (
                      <div className="mini-progress">
                        <div className="mini-bar">
                          <div 
                            className="mini-fill"
                            style={{ width: `${session.total_items ? ((session.items_counted || 0) / session.total_items * 100) : 0}%` }}
                          ></div>
                        </div>
                        <span>{Math.round((session.items_counted || 0) / (session.total_items || 1) * 100)}%</span>
                      </div>
                    )}
                  </td>
                  <td>{formatNumber(session.items_counted || 0)} / {formatNumber(session.total_items || 0)}</td>
                  <td className={session.items_with_variance > 0 ? 'has-variance' : ''}>
                    {formatNumber(session.items_with_variance || 0)}
                  </td>
                  <td>{new Date(session.created_at).toLocaleDateString()}</td>
                  <td>
                    <button 
                      onClick={() => {
                        setCurrentView('active');
                        fetchSessionDetail(session.id);
                      }}
                      className="btn-small btn-secondary"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // Render Active Session View
  const renderActiveView = () => (
    <div className="stocktake-active-view">
      <div className="view-header">
        <div className="header-left">
          <button 
            onClick={() => { setCurrentView('list'); setActiveSession(null); }}
            className="btn-back"
          >
            ← Back
          </button>
          <div>
            <h2>{activeSession?.session_name}</h2>
            <span className={`status-badge status-${activeSession?.status}`}>
              {activeSession?.status?.toUpperCase()}
            </span>
          </div>
        </div>
        
        {activeSession?.status !== 'completed' && (
          <button 
            onClick={handleCompleteStocktake}
            disabled={loading || !activeSession?.items_counted}
            className="btn-complete"
          >
            <i className="icon-check-circle"></i> Complete & Post
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="progress-section">
        <div className="progress-info">
          <span><strong>{activeSession?.items_counted || 0}</strong> of <strong>{activeSession?.total_items || 0}</strong> items counted</span>
          <span className="progress-percent">{getProgressPercent()}%</span>
        </div>
        <div className="progress-bar-large">
          <div 
            className="progress-fill-large"
            style={{ width: `${getProgressPercent()}%` }}
          ></div>
        </div>
        {activeSession?.items_with_variance > 0 && (
          <div className="variance-warning">
            <i className="icon-alert-triangle"></i>
            {activeSession.items_with_variance} item(s) have variances
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button 
          className={currentView === 'active' ? 'tab-active' : ''}
          onClick={() => setCurrentView('active')}
        >
          Count Items
        </button>
        <button 
          className={currentView === 'variances' ? 'tab-active' : ''}
          onClick={() => setCurrentView('variances')}
        >
          Variances ({variances.length})
        </button>
        <button 
          className={currentView === 'summary' ? 'tab-active' : ''}
          onClick={() => setCurrentView('summary')}
        >
          Summary
        </button>
      </div>

      {/* Tab Content */}
      {currentView === 'active' && renderCountingInterface()}
      {currentView === 'variances' && renderVarianceList()}
      {currentView === 'summary' && renderSummary()}
    </div>
  );

  // Render Counting Interface
  const renderCountingInterface = () => (
    <div className="counting-interface">
      {/* Current Item Card */}
      {sessionLines[currentLineIndex] && (
        <div className="count-card">
          <div className="count-item-info">
            <div className="item-identity">
              <span className="item-sku">{sessionLines[currentLineIndex].sku}</span>
              <span className="item-name">{sessionLines[currentLineIndex].item_name}</span>
            </div>
            
            <div className="location-info">
              <i className="icon-map-pin"></i>
              <span>{sessionLines[currentLineIndex].location_code || 'No location'}</span>
            </div>
          </div>

          <div className="count-input-area">
            <label htmlFor="count-input">Enter Quantity</label>
            <div className="input-group">
              <input
                id="count-input"
                type="number"
                step="0.01"
                min="0"
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && countInput) {
                    handleUpdateCount(sessionLines[currentLineIndex].id, countInput);
                  }
                }}
                placeholder="0.00"
                className="count-input"
                autoFocus
              />
              <span className="unit-label">{sessionLines[currentLineIndex].unit || 'pcs'}</span>
            </div>
          </div>

          <div className="system-qty-display">
            <span className="label">System Quantity:</span>
            <span className="value">{formatNumber(sessionLines[currentLineIndex]?.system_qty)}</span>
          </div>

          <div className="count-actions">
            <button 
              onClick={() => handleUpdateCount(sessionLines[currentLineIndex].id, countInput)}
              disabled={!countInput || loading}
              className="btn-save-count"
            >
              Save Count
            </button>
            <button 
              onClick={() => {
                setCountInput(String(sessionLines[currentLineIndex]?.system_qty || 0));
              }}
              className="btn-use-system"
            >
              Use System Qty
            </button>
            <button 
              onClick={() => {
                if (currentLineIndex < sessionLines.length - 1) {
                  setCurrentLineIndex(currentLineIndex + 1);
                  setCountInput('');
                }
              }}
              disabled={currentLineIndex >= sessionLines.length - 1}
              className="btn-skip"
            >
              Skip →
            </button>
          </div>

          <div className="navigation-hint">
            Line {currentLineIndex + 1} of {sessionLines.length}
          </div>
        </div>
      )}

      {/* Quick Navigation */}
      <div className="quick-nav">
        <button 
          onClick={() => setCurrentLineIndex(Math.max(0, currentLineIndex - 1))}
          disabled={currentLineIndex === 0}
          className="nav-btn"
        >
          ← Previous
        </button>
        <span className="nav-position">{currentLineIndex + 1} / {sessionLines.length}</span>
        <button 
          onClick={() => setCurrentLineIndex(Math.min(sessionLines.length - 1, currentLineIndex + 1))}
          disabled={currentLineIndex >= sessionLines.length - 1}
          className="nav-btn"
        >
          Next →
        </button>
      </div>
    </div>
  );

  // Render Variance List
  const renderVarianceList = () => (
    <div className="variance-list">
      {variances.length === 0 ? (
        <div className="empty-state">
          <i className="icon-check-circle"></i>
          <p>No variances found - all counts match system quantities!</p>
        </div>
      ) : (
        <>
          <div className="variance-summary">
            <div className="summary-stat total-variance">
              <span className="stat-label">Total Variance Value</span>
              <span className="stat-value negative">
                {formatCurrency(variances.reduce((sum, v) => sum + Math.abs(v.variance_value), 0))}
              </span>
            </div>
            <div className="summary-stat count-over">
              <span className="stat-label">Over-counted</span>
              <span className="stat-value positive">
                {variances.filter(v => v.variance_qty > 0).length} items
              </span>
            </div>
            <div className="summary-stat count-under">
              <span className="stat-label">Under-counted</span>
              <span className="stat-value negative">
                {variances.filter(v => v.variance_qty < 0).length} items
              </span>
            </div>
          </div>

          <table className="data-table variance-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item</th>
                <th>Location</th>
                <th>System Qty</th>
                <th>Counted Qty</th>
                <th>Variance</th>
                <th>Variance Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {variances.map((v, idx) => (
                <tr key={idx} className={v.variance_qty > 0 ? 'over' : 'under'}>
                  <td className="sku-cell">{v.sku}</td>
                  <td>{v.item_name}</td>
                  <td>{v.location_code || '-'}</td>
                  <td className="qty-cell">{formatNumber(v.system_qty)}</td>
                  <td className="qty-cell counted">{formatNumber(v.counted_qty)}</td>
                  <td className={`qty-cell ${v.variance_qty > 0 ? 'positive' : 'negative'}`}>
                    {v.variance_qty > 0 ? '+' : ''}{formatNumber(v.variance_qty)}
                  </td>
                  <td className={`value-cell ${Math.abs(v.variance_value) > 100 ? 'high-value' : ''}`}>
                    {formatCurrency(v.variance_value)}
                  </td>
                  <td>
                    <span className={`status-badge status-${v.status}`}>
                      {v.status?.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );

  // Render Summary
  const renderSummary = () => (
    <div className="session-summary">
      <div className="summary-grid">
        <div className="summary-card">
          <h4>Session Details</h4>
          <dl>
            <dt>Name:</dt>
            <dd>{activeSession?.session_name}</dd>
            <dt>Type:</dt>
            <dd>{activeSession?.stocktake_type}</dd>
            <dt>Status:</dt>
            <dd className={`status-text status-${activeSession?.status}`}>{activeSession?.status}</dd>
            <dt>Created:</dt>
            <dd>{activeSession?.created_at ? new Date(activeSession.created_at).toLocaleString() : '-'}</dd>
            <dt>Started:</dt>
            <dd>{activeSession?.started_at ? new Date(activeSession.started_at).toLocaleString() : '-'}</dd>
            <dt>Completed:</dt>
            <dd>{activeSession?.completed_at ? new Date(activeSession.completed_at).toLocaleString() : '-'}</dd>
          </dl>
        </div>

        <div className="summary-card">
          <h4>Counts Summary</h4>
          <dl>
            <dt>Total Items:</dt>
            <dd>{formatNumber(activeSession?.total_items || 0)}</dd>
            <dt>Counted:</dt>
            <dd>{formatNumber(activeSession?.items_counted || 0)}</dd>
            <dt>Pending:</dt>
            <dd>{formatNumber((activeSession?.total_items || 0) - (activeSession?.items_counted || 0))}</dd>
            <dt>With Variance:</dt>
            <dd className="variance-text">{formatNumber(activeSession?.items_with_variance || 0)}</dd>
          </dl>
        </div>

        <div className="summary-card">
          <h4>Quantity Summary</h4>
          <dl>
            <dt>Total System Qty:</dt>
            <dd>{formatNumber(activeSession?.total_system_qty || 0)}</dd>
            <dt>Total Counted Qty:</dt>
            <dd>{formatNumber(activeSession?.total_counted_qty || 0)}</dd>
            <dt>Total Variance Qty:</dt>
            <dd className={activeSession?.total_variance_qty !== 0 ? 'variance-text' : ''}>
              {formatNumber(activeSession?.total_variance_qty || 0)}
            </dd>
          </dl>
        </div>

        {activeSession?.status === 'completed' && (
          <div className="summary-card completed-card">
            <h4>Completion Details</h4>
            <dl>
              <dt>Adjustment Posted:</dt>
              <dd>Yes</dd>
              <dt>Adjustment Value:</dt>
              <dd className="variance-text">
                {formatCurrency(activeSession?.total_adjustment_value || 0)}
              </dd>
              <dt>Completed By:</dt>
              <dd>{activeSession?.completed_by_user_id || 'System'}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );

  // Render Create Form
  const renderCreateForm = () => (
    <div className="stocktake-create-view">
      <div className="view-header">
        <button 
          onClick={() => setCurrentView('list')}
          className="btn-back"
        >
          ← Back
        </button>
        <h2>Create New Stocktake</h2>
      </div>

      <form onSubmit={handleCreateStocktake} className="stocktake-form">
        <div className="form-grid">
          <div className="form-group full-width">
            <label htmlFor="session_name">Session Name *</label>
            <input
              id="session_name"
              type="text"
              value={formData.session_name}
              onChange={(e) => setFormData({ ...formData, session_name: e.target.value })}
              placeholder="e.g., Monthly Cycle Count - Warehouse A"
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="stocktake_type">Stocktake Type</label>
            <select
              id="stocktake_type"
              value={formData.stocktake_type}
              onChange={(e) => setFormData({ ...formData, stocktake_type: e.target.value })}
              className="form-select"
            >
              <option value="full">Full Inventory</option>
              <option value="cycle_count">Cycle Count</option>
              <option value="spot_check">Spot Check</option>
              <option value="blind">Blind Count</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="count_method">Count Method</label>
            <select
              id="count_method"
              value={formData.count_method}
              onChange={(e) => setFormData({ ...formData, count_method: e.target.value })}
              className="form-select"
            >
              <option value="system-directed">System Directed</option>
              <option value="user-selected">User Selected</option>
              <option value="blank_sheet">Blank Sheet</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="warehouse_id">Warehouse (Optional)</label>
            <select
              id="warehouse_id"
              value={formData.warehouse_id}
              onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
              className="form-select"
            >
              <option value="">All Warehouses</option>
              {/* Would populate from API */}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="scheduled_date">Scheduled Date</label>
            <input
              id="scheduled_date"
              type="date"
              value={formData.scheduled_date}
              onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="threshold">Variance Threshold (%)</label>
            <input
              id="threshold"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={formData.variance_threshold_pct}
              onChange={(e) => setFormData({ ...formData, variance_threshold_pct: parseFloat(e.target.value) })}
              className="form-input"
            />
          </div>

          <div className="form-group full-width">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes about this stocktake..."
              rows="3"
              className="form-textarea"
            ></textarea>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading || !formData.session_name} className="btn-primary btn-submit">
            {loading ? 'Creating...' : 'Create Stocktake'}
          </button>
          <button type="button" onClick={() => setCurrentView('list')} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  // Main Render
  return (
    <div className="stocktake-page">
      {/* Success Message */}
      {successMessage && (
        <div className="success-banner">
          <i className="icon-check-circle"></i>
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="banner-close">×</button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-banner">
          <i className="icon-alert-circle"></i>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="banner-close">×</button>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Processing...</span>
        </div>
      )}

      {/* View Router */}
      {currentView === 'list' && renderListView()}
      {(currentView === 'active' || currentView === 'variances' || currentView === 'summary') && renderActiveView()}
      {currentView === 'create' && renderCreateForm()}
    </div>
  );
};

export default StocktakePage;
