import { useState, useEffect, useCallback } from 'react';
import { getCompanyId } from '../api/api';
import { opsApi } from '../api/api';
import './WarehousePage.css';

export default function WarehousePage() {
  const companyId = getCompanyId();
  
  // State
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [zones, setZones] = useState([]);
  const [locations, setLocations] = useState([]);
  const [showWhModal, setShowWhModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [showLocModal, setShowLocModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('locations'); // locations, zones

  // Fetch warehouses
  const fetchWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await opsApi.warehouses(companyId);
      setWarehouses(response.data || []);
      
      // Auto-select first warehouse if none selected
      if (!selectedWarehouse && response.data?.length > 0) {
        selectWarehouse(response.data[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  // Select warehouse and fetch its data
  const selectWarehouse = async (warehouse) => {
    setSelectedWarehouse(warehouse);
    
    try {
      const [zonesRes, locsRes] = await Promise.all([
        opsApi.zones(companyId, warehouse.id),
        opsApi.locations(companyId, { warehouse_id: warehouse.id })
      ]);
      
      setZones(zonesRes.data || []);
      setLocations(locsRes.data || []);
    } catch (err) {
      console.error('Failed to load warehouse details:', err);
    }
  };

  // Create warehouse
  const createWarehouse = async (data) => {
    try {
      const response = await opsApi.createWarehouse(companyId, data);
      setWarehouses([...warehouses, response.data]);
      setShowWhModal(false);
      return response.data;
    } catch (err) {
      throw err;
    }
  };

  // Create zone
  const createZone = async (data) => {
    try {
      data.warehouse_id = selectedWarehouse.id;
      const response = await opsApi.createZone(companyId, selectedWarehouse.id, data);
      setZones([...zones, response.data]);
      setShowZoneModal(false);
    } catch (err) {
      alert(err.message || 'Failed to create zone');
    }
  };

  // Create location
  const createLocation = async (data) => {
    try {
      data.warehouse_id = selectedWarehouse.id;
      const response = await opsApi.createLocation(companyId, data);
      setLocations([...locations, response.data]);
      setShowLocModal(false);
    } catch (err) {
      alert(err.message || 'Failed to create location');
    }
  };

  // Bulk create locations
  const bulkCreateLocations = async (template, pattern) => {
    try {
      const response = await opsApi.bulkCreateLocations(companyId, { template, pattern });
      if (response.data.created?.length > 0) {
        setLocations([...locations, ...response.data.created]);
        setShowBulkModal(false);
        alert(`Created ${response.data.total_created} locations successfully`);
      }
    } catch (err) {
      alert(err.message || 'Failed to create locations');
    }
  };

  // Format helpers
  const formatNumber = (value, decimals = 0) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('en-ZA', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  };

  const getTypeLabel = (type) => {
    const labels = {
      main: 'Main Warehouse',
      remote: 'Remote/Field',
      transit: 'Transit Hub',
      consignment: 'Consignment',
      virtual: 'Virtual'
    };
    return labels[type] || type;
  };

  const getZoneTypeLabel = (type) => {
    const labels = {
      receiving: 'Receiving',
      storage: 'Storage',
      bulk: 'Bulk Storage',
      picking: 'Picking',
      packing: 'Packing',
      shipping: 'Shipping',
      quality_hold: 'Quality Hold',
      returns: 'Returns',
      damaged: 'Damaged'
    };
    return labels[type] || type;
  };

  return (
    <div className="warehouse-page">
      {/* Header */}
      <div className="wh-header">
        <div className="wh-header-left">
          <h1>Warehouse Management</h1>
          <p className="wh-subtitle">Configure warehouses, zones, and storage locations</p>
        </div>
        <div className="wh-header-actions">
          <button 
            className="wh-btn wh-btn-primary"
            onClick={() => setShowWhModal(true)}
          >
            + New Warehouse
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="wh-alert wh-alert-error">
          <span>{error}</span>
          <button onClick={fetchWarehouses}>Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="wh-loading">
          <div className="wh-spinner"></div>
          <p>Loading warehouses...</p>
        </div>
      ) : (
        <>
          {/* Warehouse Selector & Info */}
          <div className="wh-main-layout">
            {/* Sidebar - Warehouse List */}
            <div className="wh-sidebar">
              <h3>Warehouses ({warehouses.length})</h3>
              <div className="wh-list">
                {warehouses.map(wh => (
                  <div 
                    key={wh.id}
                    className={`wh-list-item ${selectedWarehouse?.id === wh.id ? 'active' : ''}`}
                    onClick={() => selectWarehouse(wh)}
                  >
                    <div className="wh-item-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                        <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                      </svg>
                    </div>
                    <div className="wh-item-info">
                      <strong>{wh.name}</strong>
                      <code>{wh.code}</code>
                    </div>
                    {wh.is_default && <span className="wh-badge wh-badge-default">Default</span>}
                  </div>
                ))}
                
                {warehouses.length === 0 && (
                  <div className="wh-empty-sidebar">
                    <p>No warehouses configured</p>
                    <button 
                      className="wh-btn wh-btn-secondary wh-btn-sm"
                      onClick={() => setShowWhModal(true)}
                    >
                      Add your first warehouse
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content */}
            <div className="wh-content">
              {selectedWarehouse ? (
                <>
                  {/* Warehouse Header */}
                  <div className="wh-selected-header">
                    <div>
                      <h2>{selectedWarehouse.name}</h2>
                      <div className="wh-meta">
                        <span><code>{selectedWarehouse.code}</code></span>
                        <span>{getTypeLabel(selectedWarehouse.type)}</span>
                        {selectedWarehouse.address_city && <span>📍 {selectedWarehouse.address_city}</span>}
                      </div>
                    </div>
                    <div className="wh-stats-row">
                      <div className="wh-stat">
                        <strong>{zones.length}</strong>
                        <span>Zones</span>
                      </div>
                      <div className="wh-stat">
                        <strong>{locations.length}</strong>
                        <span>Locations</span>
                      </div>
                      <div className="wh-actions-dropdown">
                        <button className="wh-btn wh-btn-secondary wh-btn-sm">Edit</button>
                        <button 
                          className="wh-btn wh-btn-outline wh-btn-sm"
                          onClick={() => setShowZoneModal(true)}
                        >
                          + Zone
                        </button>
                        <button 
                          className="wh-btn wh-btn-primary wh-btn-sm"
                          onClick={() => setShowLocModal(true)}
                        >
                          + Location
                        </button>
                        <button 
                          className="wh-btn wh-btn-secondary wh-btn-sm"
                          onClick={() => setShowBulkModal(true)}
                        >
                          Bulk Create
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="wh-tabs">
                    <button 
                      className={`wh-tab ${activeTab === 'locations' ? 'active' : ''}`}
                      onClick={() => setActiveTab('locations')}
                    >
                      Locations ({locations.length})
                    </button>
                    <button 
                      className={`wh-tab ${activeTab === 'zones' ? 'active' : ''}`}
                      onClick={() => setActiveTab('zones')}
                    >
                      Zones ({zones.length})
                    </button>
                  </div>

                  {/* Tab Content */}
                  {activeTab === 'locations' && (
                    <div className="wh-tab-content">
                      {/* Search/Filter */}
                      <div className="wh-toolbar">
                        <input 
                          type="text" 
                          className="wh-input wh-search"
                          placeholder="Search by code, name, or barcode..."
                        />
                        <select className="wh-select wh-select-sm">
                          <option value="">All Types</option>
                          <option value="storage">Storage</option>
                          <option value="racking">Racking</option>
                          <option value="bin">Bin</option>
                          <option value="floor">Floor</option>
                          <option value="dock">Dock</option>
                        </select>
                        <select className="wh-select wh-select-sm">
                          <option value="">All Statuses</option>
                          <option value="active">Active</option>
                          <option value="locked">Locked</option>
                          <option value="reserved">Reserved</option>
                        </select>
                      </div>

                      {/* Locations Table */}
                      <div className="wh-table-container">
                        <table className="wh-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Name</th>
                              <th>Zone</th>
                              <th>Type</th>
                              <th>Aisle</th>
                              <th>Level</th>
                              <th>Status</th>
                              <th>Items Stored</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {locations.length > 0 ? (
                              locations.map(loc => (
                                <tr key={loc.id}>
                                  <td><code>{loc.code}</code></td>
                                  <td>{loc.name || '-'}</td>
                                  <td>{loc.zone_name || '-'}</td>
                                  <td>
                                    <span className={`wh-badge badge-${loc.type}`}>
                                      {loc.type}
                                    </span>
                                  </td>
                                  <td>{loc.aisle || '-'}</td>
                                  <td>{loc.shelf_level || '-'}</td>
                                  <td>
                                    <span className={`wh-badge badge-status-${loc.status}`}>
                                      {loc.status}
                                    </span>
                                  </td>
                                  <td>{loc.items_stored || 0}</td>
                                  <td>
                                    <button className="wh-btn-text">Edit</button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="9" className="wh-empty">
                                  <div className="wh-empty-table">
                                    <p>No locations in this warehouse</p>
                                    <button 
                                      className="wh-btn wh-btn-primary wh-btn-sm"
                                      onClick={() => setShowBulkModal(true)}
                                    >
                                      Generate Rack Layout
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary */}
                      {locations.length > 0 && (
                        <div className="wh-summary-bar">
                          <span>Total: {locations.length} locations</span>
                          <span>Active: {locations.filter(l => l.status === 'active').length}</span>
                          <span>In Use: {locations.filter(l => (l.items_stored || 0) > 0).length}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'zones' && (
                    <div className="wh-tab-content">
                      <div className="wh-zones-grid">
                        {zones.length > 0 ? (
                          zones.map(zone => (
                            <div key={zone.id} className="wh-zone-card">
                              <div className="wh-zone-header">
                                <strong>{zone.name}</strong>
                                <code>{zone.code}</code>
                              </div>
                              <div className="wh-zone-type">
                                {getZoneTypeLabel(zone.type)}
                              </div>
                              <div className="wh-zone-stats">
                                <span>{zone.location_count || 0} locations</span>
                              </div>
                              {zone.description && (
                                <p className="wh-zone-desc">{zone.description}</p>
                              )}
                              <div className="wh-zone-actions">
                                <button className="wh-btn-text">Edit</button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="wh-empty-zones">
                            <p>No zones configured for this warehouse</p>
                            <button 
                              className="wh-btn wh-btn-primary"
                              onClick={() => setShowZoneModal(true)}
                            >
                              Create First Zone
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="wh-empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  <h3>Select a Warehouse</h3>
                  <p>Choose a warehouse from the sidebar or create a new one</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showWhModal && (
        <WarehouseModal 
          companyId={companyId}
          onClose={() => setShowWhModal(false)}
          onSave={createWarehouse}
        />
      )}

      {showZoneModal && selectedWarehouse && (
        <ZoneModal 
          companyId={companyId}
          warehouseId={selectedWarehouse.id}
          onClose={() => setShowZoneModal(false)}
          onSave={createZone}
        />
      )}

      {showLocModal && selectedWarehouse && (
        <LocationModal 
          companyId={companyId}
          warehouseId={selectedWarehouse.id}
          zones={zones}
          onClose={() => setShowLocModal(false)}
          onSave={createLocation}
        />
      )}

      {showBulkModal && selectedWarehouse && (
        <BulkCreateModal 
          companyId={companyId}
          warehouseId={selectedWarehouse.id}
          zones={zones}
          onClose={() => setShowBulkModal(false)}
          onSave={bulkCreateLocations}
        />
      )}
    </div>
  );
}

// Warehouse Modal
function WarehouseModal({ companyId, onClose, onSave }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'main',
    address_line1: '',
    city: '',
    contact_name: '',
    contact_email: '',
    is_default: false
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      alert('Code and Name are required');
      return;
    }

    setLoading(true);
    try {
      await onSave(form);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wh-modal-overlay" onClick={onClose}>
      <div className="wh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wh-modal-header">
          <h2>New Warehouse</h2>
          <button className="wh-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wh-modal-body">
          <div className="wh-form-group">
            <label>Code *</label>
            <input 
              type="text" 
              className="wh-input"
              value={form.code}
              onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})}
              placeholder="e.g., WH01, MAIN, JHB"
            />
          </div>
          
          <div className="wh-form-group">
            <label>Name *</label>
            <input 
              type="text" 
              className="wh-input"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="e.g., Johannesburg Main Warehouse"
            />
          </div>

          <div className="wh-form-group">
            <label>Type</label>
            <select 
              className="wh-select"
              value={form.type}
              onChange={(e) => setForm({...form, type: e.target.value})}
            >
              <option value="main">Main Warehouse</option>
              <option value="remote">Remote/Field</option>
              <option value="transit">Transit Hub</option>
              <option value="consignment">Consignment</option>
              <option value="virtual">Virtual</option>
            </select>
          </div>

          <div className="wh-form-row">
            <div className="wh-form-group">
              <label>Address Line 1</label>
              <input 
                type="text" 
                className="wh-input"
                value={form.address_line1}
                onChange={(e) => setForm({...form, address_line1: e.target.value})}
              />
            </div>
            
            <div className="wh-form-group">
              <label>City</label>
              <input 
                type="text" 
                className="wh-input"
                value={form.city}
                onChange={(e) => setForm({...form, city: e.target.value})}
              />
            </div>
          </div>

          <div className="wh-form-row">
            <div className="wh-form-group">
              <label>Contact Name</label>
              <input 
                type="text" 
                className="wh-input"
                value={form.contact_name}
                onChange={(e) => setForm({...form, contact_name: e.target.value})}
              />
            </div>
            
            <div className="wh-form-group">
              <label>Contact Email</label>
              <input 
                type="email" 
                className="wh-input"
                value={form.contact_email}
                onChange={(e) => setForm({...form, contact_email: e.target.value})}
              />
            </div>
          </div>

          <div className="wh-form-group">
            <label className="wh-checkbox-label">
              <input 
                type="checkbox" 
                checked={form.is_default}
                onChange={(e) => setForm({...form, is_default: e.target.checked})}
              />
              Set as default warehouse
            </label>
          </div>
        </div>
        
        <div className="wh-modal-footer">
          <button className="wh-btn wh-btn-secondary" onClick={onClose}>Cancel</button>
          <button 
            className="wh-btn wh-btn-primary" 
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Warehouse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Zone Modal
function ZoneModal({ companyId, warehouseId, onClose, onSave }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'storage',
    description: ''
  });

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      alert('Code and Name are required');
      return;
    }
    await onSave(form);
  };

  return (
    <div className="wh-modal-overlay" onClick={onClose}>
      <div className="wh-modal wh-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="wh-modal-header">
          <h2>New Zone</h2>
          <button className="wh-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wh-modal-body">
          <div className="wh-form-group">
            <label>Code *</label>
            <input 
              type="text" 
              className="wh-input"
              value={form.code}
              onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})}
              placeholder="e.g., REC, STOR, PICK"
            />
          </div>
          
          <div className="wh-form-group">
            <label>Name *</label>
            <input 
              type="text" 
              className="wh-input"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="e.g., Receiving Area, Bulk Storage"
            />
          </div>

          <div className="wh-form-group">
            <label>Type *</label>
            <select 
              className="wh-select"
              value={form.type}
              onChange={(e) => setForm({...form, type: e.target.value})}
            >
              <option value="receiving">Receiving</option>
              <option value="storage">Storage</option>
              <option value="bulk">Bulk Storage</option>
              <option value="picking">Picking</option>
              <option value="packing">Packing</option>
              <option value="shipping">Shipping</option>
              <option value="quality_hold">Quality Hold</option>
              <option value="returns">Returns</option>
              <option value="damaged">Damaged Goods</option>
            </select>
          </div>

          <div className="wh-form-group">
            <label>Description</label>
            <textarea 
              className="wh-textarea"
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              rows={3}
            />
          </div>
        </div>
        
        <div className="wh-modal-footer">
          <button className="wh-btn wh-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="wh-btn wh-btn-primary" onClick={handleSubmit}>Create Zone</button>
        </div>
      </div>
    </div>
  );
}

// Location Modal
function LocationModal({ companyId, warehouseId, zones, onClose, onSave }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    barcode: '',
    type: 'storage',
    zone_id: '',
    aisle: '',
    shelf_level: 1,
    position: 1,
    allow_mixing_sku: false
  });

  const handleSubmit = async () => {
    if (!form.code) {
      alert('Location Code is required');
      return;
    }
    await onSave(form);
  };

  return (
    <div className="wh-modal-overlay" onClick={onClose}>
      <div className="wh-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wh-modal-header">
          <h2>New Location</h2>
          <button className="wh-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wh-modal-body">
          <div className="wh-form-row">
            <div className="wh-form-group">
              <label>Code *</label>
              <input 
                type="text" 
                className="wh-input"
                value={form.code}
                onChange={(e) => setForm({...form, code: e.target.value.toUpperCase()})}
                placeholder="e.g., A-01-01"
              />
            </div>
            
            <div className="wh-form-group">
              <label>Name</label>
              <input 
                type="text" 
                className="wh-input"
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="Optional display name"
              />
            </div>
          </div>

          <div className="wh-form-row">
            <div className="wh-form-group">
              <label>Type</label>
              <select 
                className="wh-select"
                value={form.type}
                onChange={(e) => setForm({...form, type: e.target.value})}
              >
                <option value="storage">Storage</option>
                <option value="racking">Racking</option>
                <option value="bin">Bin</option>
                <option value="floor">Floor</option>
                <option value="dock">Dock</option>
                <option value="staging">Staging</option>
              </select>
            </div>
            
            <div className="wh-form-group">
              <label>Zone</label>
              <select 
                className="wh-select"
                value={form.zone_id}
                onChange={(e) => setForm({...form, zone_id: parseInt(e.target.value)})}
              >
                <option value="">No Zone</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="wh-form-row">
            <div className="wh-form-group">
              <label>Barcode</label>
              <input 
                type="text" 
                className="wh-input"
                value={form.barcode}
                onChange={(e) => setForm({...form, barcode: e.target.value})}
                placeholder="Scannable barcode (optional)"
              />
            </div>
          </div>

          <fieldset className="wh-fieldset">
            <legend>Position Details</legend>
            <div className="wh-form-row">
              <div className="wh-form-group">
                <label>Aisle</label>
                <input 
                  type="text" 
                  className="wh-input"
                  value={form.aisle}
                  onChange={(e) => setForm({...form, aisle: e.target.value.toUpperCase()})}
                  placeholder="e.g., A, B, C"
                />
              </div>
              
              <div className="wh-form-group">
                <label>Shelf Level</label>
                <input 
                  type="number" 
                  className="wh-input"
                  value={form.shelf_level}
                  onChange={(e) => setForm({...form, shelf_level: parseInt(e.target.value) || 1})}
                  min="1"
                />
              </div>
              
              <div className="wh-form-group">
                <label>Position</label>
                <input 
                  type="number" 
                  className="wh-input"
                  value={form.position}
                  onChange={(e) => setForm({...form, position: parseInt(e.target.value) || 1})}
                  min="1"
                />
              </div>
            </div>
          </fieldset>

          <div className="wh-form-group">
            <label className="wh-checkbox-label">
              <input 
                type="checkbox" 
                checked={form.allow_mixing_sku}
                onChange={(e) => setForm({...form, allow_mixing_sku: e.target.checked})}
              />
              Allow mixing multiple SKUs in this location
            </label>
          </div>
        </div>
        
        <div className="wh-modal-footer">
          <button className="wh-btn wh-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="wh-btn wh-btn-primary" onClick={handleSubmit}>Create Location</button>
        </div>
      </div>
    </div>
  );
}

// Bulk Create Modal
function BulkCreateModal({ companyId, warehouseId, zones, onClose, onSave }) {
  const [pattern, setPattern] = useState({
    aisles: ['A'],
    levels: [1, 2, 3],
    positions: Array.from({length: 10}, (_, i) => i + 1)
  });
  const [template, setTemplate] = useState({
    type: 'racking',
    zone_id: '',
    allow_mixing_sku: false
  });
  const [previewCount, setPreviewCount] = useState(0);

  useEffect(() => {
    const count = pattern.aisles.length * pattern.levels.length * pattern.positions.length;
    setPreviewCount(count);
  }, [pattern]);

  const handleSubmit = async () => {
    if (previewCount === 0) {
      alert('No locations would be generated with current settings');
      return;
    }
    
    if (!confirm(`This will create ${previewCount} locations. Continue?`)) return;
    
    await onSave(template, pattern);
  };

  return (
    <div className="wh-modal-overlay" onClick={onClose}>
      <div className="wh-modal wh-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="wh-modal-header">
          <h2>Bulk Create Locations</h2>
          <button className="wh-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wh-modal-body">
          <div className="wh-bulk-preview">
            <span className="wh-preview-count">{previewCount}</span>
            <span>locations will be created</span>
          </div>

          <fieldset className="wh-fieldset">
            <legend>Rack Pattern</legend>
            
            <div className="wh-form-group">
              <label>Aisles (comma-separated letters)</label>
              <input 
                type="text" 
                className="wh-input"
                value={pattern.aisles.join(', ')}
                onChange={(e) => setPattern({
                  ...pattern, 
                  aisles: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
                })}
                placeholder="A, B, C, D"
              />
            </div>

            <div className="wh-form-group">
              <label>Levels (comma-separated numbers)</label>
              <input 
                type="text" 
                className="wh-input"
                value={pattern.levels.join(', ')}
                onChange={(e) => setPattern({
                  ...pattern, 
                  levels: e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => n > 0)
                })}
                placeholder="1, 2, 3, 4"
              />
            </div>

            <div className="wh-form-group">
              <label>Positions per Level (range or comma-separated)</label>
              <input 
                type="text" 
                className="wh-input"
                value={pattern.positions.join(', ')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes('-')) {
                    const [start, end] = val.split('-').map(s => parseInt(s.trim()));
                    setPattern({
                      ...pattern, 
                      positions: Array.from({length: end - start + 1}, (_, i) => start + i)
                    });
                  } else {
                    setPattern({
                      ...pattern, 
                      positions: val.split(',').map(s => parseInt(s.trim())).filter(n => n > 0)
                    });
                  }
                }}
                placeholder="1-10 or 1, 2, 3, 4, 5"
              />
            </div>
          </fieldset>

          <fieldset className="wh-fieldset">
            <legend>Location Template</legend>
            
            <div className="wh-form-row">
              <div className="wh-form-group">
                <label>Type</label>
                <select 
                  className="wh-select"
                  value={template.type}
                  onChange={(e) => setTemplate({...template, type: e.target.value})}
                >
                  <option value="racking">Racking</option>
                  <option value="bin">Bin</option>
                  <option value="storage">Storage</option>
                  <option value="floor">Floor</option>
                </select>
              </div>
              
              <div className="wh-form-group">
                <label>Zone</label>
                <select 
                  className="wh-select"
                  value={template.zone_id}
                  onChange={(e) => setTemplate({...template, zone_id: parseInt(e.target.value)})}
                >
                  <option value="">No Zone</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="wh-form-group">
              <label className="wh-checkbox-label">
                <input 
                  type="checkbox" 
                  checked={template.allow_mixing_sku}
                  onChange={(e) => setTemplate({...template, allow_mixing_sku: e.target.checked})}
                />
                Allow mixing multiple SKUs
              </label>
            </div>
          </fieldset>

          <div className="wh-preview-example">
            <h4>Example Generated Codes:</h4>
            <div className="wh-example-codes">
              {pattern.aisles.slice(0, 2).map(aisle => 
                pattern.levels.slice(0, 2).map(level => 
                  pattern.positions.slice(0, 3).map(pos => (
                    <code key={`${aisle}-${level}-${pos}`}>
                      {aisle}-{level}-{String(pos).padStart(2, '0')}
                    </code>
                  ))
                )
              )}
            </div>
          </div>
        </div>
        
        <div className="wh-modal-footer">
          <button className="wh-btn wh-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="wh-btn wh-btn-primary" onClick={handleSubmit}>
            Create {previewCount} Locations
          </button>
        </div>
      </div>
    </div>
  );
}
