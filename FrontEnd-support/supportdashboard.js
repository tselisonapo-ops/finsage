const ENDPOINTS = {
  // Submit new ticket manually (optional)
  submit: (companyId) => 
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/support/tickets`,

  // List all tickets for a company
  list: (companyId) => 
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/support/tickets`,

  // Get a single ticket by ID
  profile: (companyId, ticketId) => 
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/support/tickets/${encodeURIComponent(ticketId)}`,

  // Update ticket (status, priority, assignment, notes)
  update: (companyId, ticketId) => 
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/support/tickets/${encodeURIComponent(ticketId)}`,

  // Void (soft delete) a ticket
  remove: (companyId, ticketId) => 
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/support/tickets/${encodeURIComponent(ticketId)}`
};
