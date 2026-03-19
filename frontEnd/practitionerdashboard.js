(function () {
  "use strict";

  console.log("practitionerdashboard.js loaded");

  /* ======================================================
   * Config
   * ==================================================== */
const API_BASE =
  window.APP_CONFIG?.API_BASE ||
  (window.location.hostname === "127.0.0.1" ||
   window.location.hostname === "localhost"
    ? "http://127.0.0.1:5000"
    : "");

const ENDPOINTS = {
  auth: {
    me: `${API_BASE}/api/auth/me`,
    switchCompany: `${API_BASE}/api/auth/switch-company`
  },

  companies: {
    list: `${API_BASE}/api/companies`
  },

  users: {
    list: (companyId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/users`
  },

  engagements: {
    list: (companyId, { status = "", engagement_type = "", customer_id = "", q = "", limit = 100, offset = 0 } = {}) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (q) params.set("q", q);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements${qs ? `?${qs}` : ""}`;
    },

    create: (companyId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements`,

    get: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}`,

    update: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}`,

    setStatus: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/status`,

    teamList: (companyId, engagementId, { active_only = true } = {}) => {
      const params = new URLSearchParams();
      params.set("active_only", active_only ? "true" : "false");
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/team?${params.toString()}`;
    },

    teamAdd: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/team`,

    teamDeactivate: (companyId, engagementTeamId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/team/${encodeURIComponent(engagementTeamId)}/deactivate`
  },

  engagementOps: {
    reportingItemsList: (
      companyId,
      engagementId,
      {
        item_type = "",
        status = "",
        owner_user_id = "",
        reviewer_user_id = "",
        q = "",
        active_only = true,
        limit = 200,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (item_type) params.set("item_type", item_type);
      if (status) params.set("status", status);
      if (owner_user_id) params.set("owner_user_id", String(owner_user_id));
      if (reviewer_user_id) params.set("reviewer_user_id", String(reviewer_user_id));
      if (q) params.set("q", q);
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/reporting-items${qs ? `?${qs}` : ""}`;
    },

    reportingItemsCreate: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/reporting-items`,

    reportingItemsGet: (companyId, itemId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-reporting-items/${encodeURIComponent(itemId)}`,

    reportingItemsUpdate: (companyId, itemId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-reporting-items/${encodeURIComponent(itemId)}`,

    reportingItemsSetStatus: (companyId, itemId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-reporting-items/${encodeURIComponent(itemId)}/status`,

    reportingItemsDeactivate: (companyId, itemId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-reporting-items/${encodeURIComponent(itemId)}/deactivate`,

    deliverablesList: (
      companyId,
      engagementId,
      {
        status = "",
        priority = "",
        assigned_user_id = "",
        reviewer_user_id = "",
        deliverable_type = "",
        q = "",
        active_only = true,
        limit = 200,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (assigned_user_id) params.set("assigned_user_id", String(assigned_user_id));
      if (reviewer_user_id) params.set("reviewer_user_id", String(reviewer_user_id));
      if (deliverable_type) params.set("deliverable_type", deliverable_type);
      if (q) params.set("q", q);
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/deliverables${qs ? `?${qs}` : ""}`;
    },

    deliverablesCreate: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/deliverables`,

    deliverablesGet: (companyId, deliverableId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-deliverables/${encodeURIComponent(deliverableId)}`,

    deliverablesUpdate: (companyId, deliverableId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-deliverables/${encodeURIComponent(deliverableId)}`,

    deliverablesSetStatus: (companyId, deliverableId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-deliverables/${encodeURIComponent(deliverableId)}/status`,

    deliverablesDeactivate: (companyId, deliverableId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-deliverables/${encodeURIComponent(deliverableId)}/deactivate`,

    postingActivityList: (
      companyId,
      engagementId,
      {
        module_name = "",
        event_type = "",
        status = "",
        prepared_by_user_id = "",
        reviewer_user_id = "",
        date_from = "",
        date_to = "",
        q = "",
        active_only = true,
        limit = 200,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (module_name) params.set("module_name", module_name);
      if (event_type) params.set("event_type", event_type);
      if (status) params.set("status", status);
      if (prepared_by_user_id) params.set("prepared_by_user_id", String(prepared_by_user_id));
      if (reviewer_user_id) params.set("reviewer_user_id", String(reviewer_user_id));
      if (date_from) params.set("date_from", date_from);
      if (date_to) params.set("date_to", date_to);
      if (q) params.set("q", q);
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/posting-activity${qs ? `?${qs}` : ""}`;
    },

    postingActivityCreate: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/posting-activity`,

    postingActivityGet: (companyId, postingActivityId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-posting-activity/${encodeURIComponent(postingActivityId)}`,

    postingActivityUpdate: (companyId, postingActivityId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-posting-activity/${encodeURIComponent(postingActivityId)}`,

    postingActivitySetStatus: (companyId, postingActivityId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-posting-activity/${encodeURIComponent(postingActivityId)}/status`,

    postingActivityDeactivate: (companyId, postingActivityId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-posting-activity/${encodeURIComponent(postingActivityId)}/deactivate`,

    monthlyCloseTasksList: (
      companyId,
      engagementId,
      {
        close_period = "",
        status = "",
        priority = "",
        owner_user_id = "",
        reviewer_user_id = "",
        q = "",
        active_only = true,
        limit = 200,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (close_period) params.set("close_period", close_period);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (owner_user_id) params.set("owner_user_id", String(owner_user_id));
      if (reviewer_user_id) params.set("reviewer_user_id", String(reviewer_user_id));
      if (q) params.set("q", q);
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/monthly-close-tasks${qs ? `?${qs}` : ""}`;
    },

    monthlyCloseTasksCreate: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/monthly-close-tasks`,

    monthlyCloseTasksGet: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-monthly-close-tasks/${encodeURIComponent(taskId)}`,

    monthlyCloseTasksUpdate: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-monthly-close-tasks/${encodeURIComponent(taskId)}`,

    monthlyCloseTasksSetStatus: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-monthly-close-tasks/${encodeURIComponent(taskId)}/status`,

    monthlyCloseTasksDeactivate: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-monthly-close-tasks/${encodeURIComponent(taskId)}/deactivate`,

    yearEndTasksList: (
      companyId,
      engagementId,
      {
        reporting_year_end = "",
        status = "",
        priority = "",
        owner_user_id = "",
        reviewer_user_id = "",
        q = "",
        active_only = true,
        limit = 200,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (reporting_year_end) params.set("reporting_year_end", reporting_year_end);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (owner_user_id) params.set("owner_user_id", String(owner_user_id));
      if (reviewer_user_id) params.set("reviewer_user_id", String(reviewer_user_id));
      if (q) params.set("q", q);
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/year-end-tasks${qs ? `?${qs}` : ""}`;
    },

    yearEndTasksCreate: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/year-end-tasks`,

    yearEndTasksGet: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-year-end-tasks/${encodeURIComponent(taskId)}`,

    yearEndTasksUpdate: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-year-end-tasks/${encodeURIComponent(taskId)}`,

    yearEndTasksSetStatus: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-year-end-tasks/${encodeURIComponent(taskId)}/status`,

    yearEndTasksDeactivate: (companyId, taskId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-year-end-tasks/${encodeURIComponent(taskId)}/deactivate`,

    signoffStepsList: (
      companyId,
      engagementId,
      {
        reporting_year_end = "",
        status = "",
        assigned_user_id = "",
        active_only = true,
        limit = 100,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (reporting_year_end) params.set("reporting_year_end", reporting_year_end);
      if (status) params.set("status", status);
      if (assigned_user_id) params.set("assigned_user_id", String(assigned_user_id));
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/signoff-steps${qs ? `?${qs}` : ""}`;
    },

    signoffStepsCreate: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/signoff-steps`,

    signoffStepsGet: (companyId, stepId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-signoff-steps/${encodeURIComponent(stepId)}`,

    signoffStepsUpdate: (companyId, stepId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-signoff-steps/${encodeURIComponent(stepId)}`,

    signoffStepsSetStatus: (companyId, stepId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-signoff-steps/${encodeURIComponent(stepId)}/status`,

    signoffStepsDeactivate: (companyId, stepId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-signoff-steps/${encodeURIComponent(stepId)}/deactivate`
  },

  actionCenter: {
    summary: (companyId, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/action-center/summary`,
        params
      ),

    queue: (companyId, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/action-center/queue`,
        params
      ),

    itemAction: (companyId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/action-center/items/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}/action`
  },
    
  clientOverview: {
    summary: (companyId, customerId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/client-overview/summary?customer_id=${encodeURIComponent(customerId)}`,

    engagements: (
      companyId,
      customerId,
      {
        status = "",
        type = "",
        q = "",
        limit = 200,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      params.set("customer_id", String(customerId));
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      if (q) params.set("q", q);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/client-overview/engagements?${qs}`;
    },

    reportingDeliverables: (companyId, customerId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/client-overview/reporting-deliverables?customer_id=${encodeURIComponent(customerId)}`,

    operations: (companyId, customerId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/client-overview/operations?customer_id=${encodeURIComponent(customerId)}`,

    closeFinalisation: (companyId, customerId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/client-overview/close-finalisation?customer_id=${encodeURIComponent(customerId)}`,

    riskAlerts: (companyId, customerId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/client-overview/risk-alerts?customer_id=${encodeURIComponent(customerId)}`
  },

  customers: {
    list: (companyId, { q = "", limit = 200, offset = 0 } = {}) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/customers${qs ? `?${qs}` : ""}`;
    }
  },

  analytics: {
    overview: (companyId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/overview`,

    engagementProfitability: (
      companyId,
      {
        date_range = "",
        customer_id = "",
        engagement_type = "",
        manager_user_id = "",
        status = "",
        priority = ""
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (date_range) params.set("date_range", date_range);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (manager_user_id) params.set("manager_user_id", String(manager_user_id));
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/engagement-profitability${qs ? `?${qs}` : ""}`;
    },

    engagementProfitabilityRows: (
      companyId,
      {
        date_range = "",
        customer_id = "",
        engagement_type = "",
        manager_user_id = "",
        status = "",
        priority = ""
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (date_range) params.set("date_range", date_range);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (manager_user_id) params.set("manager_user_id", String(manager_user_id));
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/engagement-profitability/rows${qs ? `?${qs}` : ""}`;
    },

    clientServiceTrends: (
      companyId,
      {
        date_range = "",
        customer_id = "",
        engagement_type = "",
        status = ""
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (date_range) params.set("date_range", date_range);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (status) params.set("status", status);
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/client-service-trends${qs ? `?${qs}` : ""}`;
    },

    clientServiceTrendsRows: (
      companyId,
      {
        date_range = "",
        customer_id = "",
        engagement_type = "",
        status = ""
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (date_range) params.set("date_range", date_range);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (status) params.set("status", status);
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/client-service-trends/rows${qs ? `?${qs}` : ""}`;
    },

    riskAlerts: (
      companyId,
      {
        date_range = "",
        customer_id = "",
        engagement_type = "",
        manager_user_id = "",
        status = "",
        priority = ""
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (date_range) params.set("date_range", date_range);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (manager_user_id) params.set("manager_user_id", String(manager_user_id));
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/risk-alerts${qs ? `?${qs}` : ""}`;
    },

    riskAlertsRows: (
      companyId,
      {
        date_range = "",
        customer_id = "",
        engagement_type = "",
        manager_user_id = "",
        status = "",
        priority = ""
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (date_range) params.set("date_range", date_range);
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_type) params.set("engagement_type", engagement_type);
      if (manager_user_id) params.set("manager_user_id", String(manager_user_id));
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/analytics/risk-alerts/rows${qs ? `?${qs}` : ""}`;
    }
  }
};

  let PR_ASSIGNMENTS_CACHE = [];
  let PR_SELECTED_ENGAGEMENT = null;
  let PR_TEAM_CACHE = [];
  let PR_CUSTOMERS_CACHE = [];
  let PR_ASSIGNMENTS_EVENTS_BOUND = false;
  let PR_TEAM_EVENTS_BOUND = false;
  let PR_ENG_MODAL_EVENTS_BOUND = false;
  let PR_USERS_CACHE = [];
  let PR_NAV_EVENTS_BOUND = false;

  let PR_REPORTING_ITEMS_CACHE = [];
  let PR_DELIVERABLES_CACHE = [];
  let PR_POSTING_ACTIVITY_CACHE = [];
  let PR_MONTHLY_CLOSE_CACHE = [];
  let PR_YEAR_END_CACHE = [];
  let PR_SIGNOFF_CACHE = [];

  let PR_REPORTING_EVENTS_BOUND = false;
  let PR_DELIVERABLES_EVENTS_BOUND = false;
  let PR_POSTING_EVENTS_BOUND = false;
  let PR_MONTHLY_CLOSE_EVENTS_BOUND = false;
  let PR_YEAR_END_EVENTS_BOUND = false;

  let PR_REPORTING_MODAL_BOUND = false;
  let PR_DELIVERABLE_MODAL_BOUND = false;
  let PR_MONTHLY_CLOSE_MODAL_BOUND = false;
  let PR_YEAR_END_MODAL_BOUND = false;
  let PR_SIGNOFF_MODAL_BOUND = false;

  let PR_ANALYTICS_OVERVIEW_CACHE = null;
  let PR_ANALYTICS_DETAIL_CACHE = null;
  let PR_ANALYTICS_DETAIL_ROWS_CACHE = [];
  let PR_ANALYTICS_SELECTED_MODULE = null; // "engagement-profitability" | "client-service-trends" | "risk-alerts"
  let PR_ANALYTICS_EVENTS_BOUND = false;
  let PR_ANALYTICS_DETAIL_EVENTS_BOUND = false;
  let PR_ANALYTICS_FORCE_RELOAD = false;

  let PR_CLIENT_OVERVIEW_CACHE = {
    summary: null,
    engagements: [],
    reportingDeliverables: null,
    operations: null,
    closeFinalisation: null,
    riskAlerts: null
  };

  let PR_CLIENT_OVERVIEW_EVENTS_BOUND = false;
  let PR_CLIENT_OVERVIEW_LOADING = false;

  let PR_CONTEXT_RAIL_BOUND = false;
  let PR_CONTEXT_RAIL_PINNED = false;

  let PR_ACTION_CENTER_CACHE = {
    summary: null,
    rows: [],
    selectedRow: null,
    filtersKey: ""
  };

  let PR_ACTION_CENTER_EVENTS_BOUND = false;
  let PR_ACTION_CENTER_LOADING = false;
  let PR_ACTION_CENTER_MINE_ONLY = false;
  let PR_ACTION_CENTER_ACTIVE_QUICK = "all";

  const PR_NAV = {
    dashboard: "dashboard",
    assignments: "assignments",
    clients: "clients",
    team: "team",
    analytics: "analytics",
    actionCenter: "action-center",
    settings: "settings",

    settingsOverview: "settings-overview",
    users: "users",
    rolesPermissions: "roles-permissions",
    firmPreferences: "firm-preferences",

    reportingOverview: "reporting-overview",
    pendingDeliverables: "pending-deliverables",
    journalEntries: "journal-entries",
    accountsReceivable: "accounts-receivable",
    accountsPayable: "accounts-payable",
    leases: "leases",
    ppe: "ppe",
    dayToDayPostings: "day-to-day-postings",
    monthlyCloseRoutines: "monthly-close-routines",
    yearEndReporting: "year-end-reporting",
    reviewQueue: "review-queue",
    deliverables: "deliverables",
    partnerSignoff: "partner-signoff",
    analyticsDetail: "analytics-detail",
  };

  /* ======================================================
   * Helpers
   * ==================================================== */
  function getAuthToken() {
    return (
      localStorage.getItem("fs_user_token") ||
      sessionStorage.getItem("fs_user_token") ||
      localStorage.getItem("authToken") ||
      sessionStorage.getItem("authToken") ||
      ""
    );
  }
  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem("fs_user") || "null") || {};
    } catch (_) {
      return {};
    }
  }

  async function apiFetch(url, options = {}) {
    const token = getAuthToken();

    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });

    const text = await res.text();
    let json = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }

    if (!res.ok) {
      throw new Error(json?.error || json?.message || text || "Request failed");
    }

    return json;
  }

function buildApiUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl, window.location.origin);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}
/* ======================================================
* Loaders
* ==================================================== */
async function loadMe() {
  const me = await apiFetch(ENDPOINTS.auth.me, { method: "GET" });

  const stored = getStoredUser();
  const merged = {
    ...stored,
    ...me,
    role:
      me.role ||
      me.role_name ||
      me.user_role ||
      me.system_role ||
      stored.role ||
      localStorage.getItem("userRole") ||
      "viewer",
    access_scope: me.access_scope || stored.access_scope || localStorage.getItem("access_scope") || "assignment",
    company_name: me.company_name || stored.company_name || localStorage.getItem("companyName") || "--"
  };

  setStoredUser(merged);
  return merged;
}

async function loadCompanies() {
  const out = await apiFetch(ENDPOINTS.companies.list, { method: "GET" });
  return Array.isArray(out?.companies) ? out.companies : [];
}

async function loadEngagementAssignableUsers(companyId) {
  const out = await apiFetch(
    ENDPOINTS.users.list(companyId),
    { method: "GET" }
  );

  if (Array.isArray(out?.members)) {
    return out.members;
  }

  return [];
}

  /* ======================================================
   * Init
   * ==================================================== */
  async function enforcePractitionerAuth() {
    const token = getAuthToken();
    console.log("enforcePractitionerAuth: token =", token || null);

    if (!token) return null;

    try {
      const me = await loadMe();
      return me;
    } catch (err) {
      console.warn("enforcePractitionerAuth failed:", err);
      return null;
    }
  }

  /* ======================================================
   * Rest of your helpers / renderers / nav logic
   * ==================================================== */
  function setStoredUser(user) {
    localStorage.setItem("fs_user", JSON.stringify(user || {}));
    if (user?.user_type) localStorage.setItem("userType", user.user_type);
    if (user?.access_scope) localStorage.setItem("access_scope", user.access_scope);
    if (user?.company_id != null) localStorage.setItem("company_id", String(user.company_id));
    if (user?.company_name) localStorage.setItem("companyName", user.company_name);
  }

function getUserRawRole(user) {
  return (
    user?.role ||
    user?.role_name ||
    user?.user_role ||
    user?.system_role ||
    ""
  );
}

function getUserNormalizedRole(user) {
  const raw = getUserRawRole(user);
  return window.normalizeRole
    ? window.normalizeRole(raw)
    : String(raw || "").toLowerCase().trim();
}

function getUserRoleLabel(user) {
  const normalized = getUserNormalizedRole(user);
  return window.ROLE_LABELS?.[normalized] || humanizeRole(normalized) || "User";
}

function getUserDisplayName(user) {
  const first = String(user?.first_name || "").trim();
  const last = String(user?.last_name || "").trim();

  const combined = [first, last]
    .filter(Boolean)
    .filter(v => !v.includes("@"))
    .join(" ")
    .trim();

  return combined || first || user?.email || `User #${user?.user_id ?? user?.id ?? "--"}`;
}

function optionTextForUser(user) {
  return `${getUserDisplayName(user)} - ${getUserRoleLabel(user)}`;
}

function isManagerRole(user) {
  const role = getUserNormalizedRole(user);
  return [
    "audit_manager",
    "client_service_manager",
    "manager"
  ].includes(role);
}

function isPartnerRole(user) {
  const role = getUserNormalizedRole(user);
  return [
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "owner"
  ].includes(role);
}

function findUserInCacheById(userId) {
  const idNum = Number(userId || 0);
  if (!idNum) return null;
  return PR_USERS_CACHE.find(u => Number(u.id ?? u.user_id) === idNum) || null;
}

function getUserLabelById(userId) {
  const user = findUserInCacheById(userId);
  if (!user) return userId ? `User #${userId}` : "--";
  return optionTextForUser(user);
}

  function bindText(path, value) {
    document.querySelectorAll(`[data-bind="${path}"]`).forEach((el) => {
      el.textContent = value ?? "--";
    });
  }

  function bindWidth(path, value) {
    const pct = Number(value);
    const safe = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;

    document.querySelectorAll(`[data-bind-width="${path}"]`).forEach((el) => {
      el.style.width = `${safe}%`;
    });
  }

  function bindSelect(path, value) {
    const el = document.querySelector(`[data-bind="${path}"]`);
    if (el) el.value = value ?? "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

function formatDateShort(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function analyticsCurrentFilters() {
  return {
    date_range: document.getElementById("analyticsFilterDateRange")?.value || "",
    customer_id: document.getElementById("analyticsFilterClient")?.value || "",
    engagement_type: document.getElementById("analyticsFilterEngagementType")?.value || "",
    manager_user_id: document.getElementById("analyticsFilterManager")?.value || "",
    status: document.getElementById("analyticsFilterStatus")?.value || "",
    priority: document.getElementById("analyticsFilterPriority")?.value || ""
  };
}

function renderProfile(me) {
  const fullName =
    [me.first_name, me.last_name].filter(Boolean).join(" ").trim() ||
    me.email ||
    "--";

  bindText("profile.full_name", fullName);
  bindText("profile.title", humanizeRole(me.role));
  bindText("profile.role_chip", humanizeRole(me.role));
  bindText("profile.access_scope", humanizeScope(me.access_scope));
}

function renderHeader(me) {
  bindText("header.workspace_label", "Practitioner Workspace");
  bindText("header.dashboard_title", "Assignment Dashboard");
  bindText(
    "header.dashboard_subtitle",
    "Client-service dashboard for bookkeeping, reporting engagements, approvals, and non-posting firm workflows."
  );

  bindSelect("filters.view", "assignment");
  bindSelect("filters.access_scope", me.access_scope || "assignment");
}

function renderCompanyFilter(companies, me) {
  const select = document.querySelector('[data-bind="filters.client_id"]');
  if (!select) return;

  select.innerHTML = "";

  const rows = (Array.isArray(companies) ? companies : []).filter(c => {
    return ["core", "assignment"].includes(String(c.access_scope || "").toLowerCase());
  });

  rows.forEach((company) => {
    const option = document.createElement("option");
    option.value = String(company.id);

    const scope = humanizeScope(company.access_scope || "core");
    const role = humanizeRole(company.role || "viewer");
    option.textContent = `${company.name || `Company ${company.id}`} • ${scope} • ${role}`;

    if (String(company.id) === String(me.company_id)) option.selected = true;
    select.appendChild(option);
  });
}

function bindPractitionerContextRail() {
  if (PR_CONTEXT_RAIL_BOUND) return;
  PR_CONTEXT_RAIL_BOUND = true;

  const rail = document.getElementById("prContextRail");
  const panel = document.getElementById("prContextPanel");
  const toggleBtn = document.getElementById("prContextToggleBtn");
  const pinBtn = document.getElementById("prContextPinBtn");

  if (!rail || !panel || !toggleBtn || !pinBtn) return;

  const applyState = () => {
    rail.classList.toggle("is-expanded", PR_CONTEXT_RAIL_PINNED);
    rail.classList.toggle("is-collapsed", !PR_CONTEXT_RAIL_PINNED);
    toggleBtn.textContent = PR_CONTEXT_RAIL_PINNED ? "Collapse" : "Expand";
    pinBtn.textContent = PR_CONTEXT_RAIL_PINNED ? "Unpin" : "Pin open";
  };

  toggleBtn.addEventListener("click", () => {
    PR_CONTEXT_RAIL_PINNED = !PR_CONTEXT_RAIL_PINNED;
    rail.classList.remove("is-hover-open");
    applyState();
  });

  pinBtn.addEventListener("click", () => {
    PR_CONTEXT_RAIL_PINNED = !PR_CONTEXT_RAIL_PINNED;
    rail.classList.remove("is-hover-open");
    applyState();
  });

  rail.addEventListener("mouseenter", () => {
    if (PR_CONTEXT_RAIL_PINNED) return;
    rail.classList.add("is-hover-open");
  });

  rail.addEventListener("mouseleave", () => {
    if (PR_CONTEXT_RAIL_PINNED) return;
    rail.classList.remove("is-hover-open");
  });

  applyState();
}

function syncPractitionerContextRailForScreen(screen) {
  const rail = document.getElementById("prContextRail");
  const toggleBtn = document.getElementById("prContextToggleBtn");
  const pinBtn = document.getElementById("prContextPinBtn");

  if (!rail || !toggleBtn || !pinBtn) return;

  const shouldOpenByDefault = screen === PR_NAV.dashboard;

  PR_CONTEXT_RAIL_PINNED = shouldOpenByDefault;

  rail.classList.remove("is-hover-open");
  rail.classList.toggle("is-expanded", PR_CONTEXT_RAIL_PINNED);
  rail.classList.toggle("is-collapsed", !PR_CONTEXT_RAIL_PINNED);

  toggleBtn.textContent = PR_CONTEXT_RAIL_PINNED ? "Collapse" : "Expand";
  pinBtn.textContent = PR_CONTEXT_RAIL_PINNED ? "Unpin" : "Pin open";
}

function getSelectedPractitionerCustomerId() {
  const selectedCustomer =
    (typeof PR_SELECTED_CUSTOMER !== "undefined" && PR_SELECTED_CUSTOMER)
      ? PR_SELECTED_CUSTOMER
      : null;

  const raw =
    document.getElementById("clientOverviewCustomerSelect")?.value ||
    selectedCustomer?.id ||
    selectedCustomer?.customer_id ||
    "";

  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(val, fallback = "--") {
  const s = String(val ?? "").trim();
  return s || fallback;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "--");
}

function fullName(firstName, lastName, fallback = "--") {
  const name = `${firstName || ""} ${lastName || ""}`.trim();
  return name || fallback;
}

function practitionerCompanyIdFromMe(me) {
  return (
    me?.company_id ||
    me?.active_company_id ||
    me?.company?.id ||
    0
  );
}

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
}

function getPractitionerRole(me) {
  return getUserNormalizedRole(me);
}

function guardPractitionerScreenAccess(name, me) {
  const resolved = resolvePractitionerScreenName(name);
  const rule = PR_SCREEN_POLICY[resolved];
  if (!rule) return { ok: false, reason: "unknown", resolved };

  if (rule.auth !== "public" && !getAuthToken()) {
    return { ok: false, reason: "auth", resolved };
  }

  const role = getUserNormalizedRole(me);
  const allowedRoles = Array.isArray(rule.roles)
    ? rule.roles.map(r => String(r).toLowerCase().trim())
    : [];

  if (allowedRoles.length && !allowedRoles.includes(role)) {
    return { ok: false, reason: "role", resolved };
  }

  return { ok: true, resolved };
}

function getPractitionerRole(me) {
  return String(me?.role || "").trim().toLowerCase();
}

function canAccessPractitionerScreen(me, screen) {
  const role = getPractitionerRole(me);
  const policy = PR_SCREEN_POLICY?.[screen];
  if (!policy) return true; // or false if you want strict mode

  if (policy.auth === "public") return true;

  const roles = Array.isArray(policy.roles) ? policy.roles.map(r => String(r).toLowerCase()) : [];
  return roles.includes(role);
}

const PR_NAV_MENU = [
  {
    name: "Dashboard",
    screen: PR_NAV.dashboard,
    badge: "Home",
    visible: (me) => canAccessPractitionerScreen(me, PR_NAV.dashboard)
  },

  {
    name: "Engagements",
    isParent: true,
    children: [
      {
        name: "Engagements Overview",
        screen: PR_NAV.assignments,
        desc: "Track all active assignments, due dates, and role ownership",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.assignments)
      },
      {
        name: "Reporting Overview",
        screen: PR_NAV.reportingOverview,
        desc: "Engagement summary, deadlines, reporting cycle",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.reportingOverview)
      },
      {
        name: "Pending Deliverables",
        screen: PR_NAV.pendingDeliverables,
        desc: "Financial statements, trial balance, notes",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.pendingDeliverables)
      },
      {
        name: "Day-to-Day Postings",
        screen: PR_NAV.dayToDayPostings,
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.dayToDayPostings)
      },
      {
        name: "Monthly Close Routines",
        screen: PR_NAV.monthlyCloseRoutines,
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.monthlyCloseRoutines)
      },
      {
        name: "Year-End Reporting",
        screen: PR_NAV.yearEndReporting,
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.yearEndReporting)
      }
    ]
  },

  {
    name: "Clients",
    isParent: true,
    children: [
      {
        name: "Clients Overview",
        screen: PR_NAV.clients,
        desc: "View clients, service health, and engagement context",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.clients)
      }
    ]
  },

  {
    name: "Team",
    isParent: true,
    children: [
      {
        name: "Team Overview",
        screen: PR_NAV.team,
        desc: "Monitor team allocation, utilization, and collaboration",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.team)
      }
    ]
  },

  {
    name: "Analytics",
    isParent: true,
    children: [
      {
        name: "Analytics Overview",
        screen: PR_NAV.analytics,
        desc: "View portfolio trends, delivery health, and risk signals",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.analytics)
      }
    ]
  },

  {
    name: "Action Center",
    isParent: true,
    children: [
      {
        name: "Action Center Overview",
        screen: PR_NAV.actionCenter,
        desc: "Manage approvals, escalations, and workflow actions",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.actionCenter)
      }
    ]
  },

  {
    name: "Posting Modules",
    isParent: true,
    children: [
      {
        name: "Journal Entries",
        screen: PR_NAV.journalEntries,
        desc: "Manual posting workflow and control routing",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.journalEntries)
      },
      {
        name: "Accounts Receivable",
        screen: PR_NAV.accountsReceivable,
        desc: "Receipts, aging, controls, review routing",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.accountsReceivable)
      },
      {
        name: "Accounts Payable",
        screen: PR_NAV.accountsPayable,
        desc: "Bills, vendor workflows, review stages",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.accountsPayable)
      },
      {
        name: "Leases",
        screen: PR_NAV.leases,
        desc: "Lease accounting workflow and review controls",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.leases)
      },
      {
        name: "PPE",
        screen: PR_NAV.ppe,
        desc: "Asset events, depreciation, transfers, disposals",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.ppe)
      }
    ]
  },

  {
    name: "Manager Tools",
    isParent: true,
    children: [
      {
        name: "Review Queue",
        screen: PR_NAV.reviewQueue,
        desc: "Review postings and reporting outputs",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.reviewQueue)
      }
    ]
  },

  {
    name: "Partner Tools",
    isParent: true,
    children: [
      {
        name: "Deliverables",
        screen: PR_NAV.deliverables,
        desc: "Financial statements and opinions",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.deliverables)
      },
      {
        name: "Partner Sign-Off",
        screen: PR_NAV.partnerSignoff,
        desc: "Final deliverables and approvals",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.partnerSignoff)
      }
    ]
  },

  {
    name: "Settings",
    isParent: true,
    children: [
      {
        name: "Settings Overview",
        screen: PR_NAV.settingsOverview,
        desc: "General settings and workspace controls",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.settingsOverview)
      },
      {
        name: "Users",
        screen: PR_NAV.users,
        desc: "Manage users, access, and assignments",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.users)
      },
      {
        name: "Roles & Permissions",
        screen: PR_NAV.rolesPermissions,
        desc: "Control posting, review, and sign-off rights",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.rolesPermissions)
      },
      {
        name: "Firm Preferences",
        screen: PR_NAV.firmPreferences,
        desc: "Practice defaults and workspace preferences",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.firmPreferences)
      }
    ]
  }
];

function prItemVisible(item, me) {
  if (!item) return false;
  if (typeof item.visible === "function") return !!item.visible(me);
  return true;
}

const PR_SCREEN_POLICY = {
  dashboard: { auth: "private", roles: ["owner", "admin", "manager", "senior", "accountant", "viewer", "bookkeeper", "audit_staff", "senior_associate", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "fs_compiler", "reviewer", "client_service_manager"] },
  assignments: { auth: "private", roles: ["owner", "admin", "manager", "senior", "accountant", "viewer", "bookkeeper", "audit_staff", "senior_associate", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "fs_compiler", "reviewer", "client_service_manager"] },
  clients: { auth: "private", roles: ["owner", "admin", "manager", "senior", "accountant", "viewer", "bookkeeper", "audit_manager", "audit_partner", "client_service_manager"] },
  team: { auth: "private", roles: ["owner", "admin", "manager", "audit_manager", "audit_partner", "client_service_manager"] },
  analytics: { auth: "private", roles: ["owner", "admin", "manager", "audit_manager", "audit_partner", "engagement_partner", "client_service_manager"] },

  "analytics-detail": { auth: "private", roles: ["owner", "admin", "manager", "audit_manager", "audit_partner", "engagement_partner", "client_service_manager"] },
  "action-center": { auth: "private", roles: ["owner", "admin", "manager", "senior", "accountant", "bookkeeper", "audit_staff", "senior_associate", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "fs_compiler", "reviewer", "client_service_manager"] },

  settings: { auth: "private", roles: ["owner", "admin"] },
  "settings-overview": { auth: "private", roles: ["owner", "admin"] },
  users: { auth: "private", roles: ["owner", "admin"] },
  "roles-permissions": { auth: "private", roles: ["owner", "admin"] },
  "firm-preferences": { auth: "private", roles: ["owner", "admin"] },

  "reporting-overview": { auth: "private", roles: ["owner", "admin", "audit_staff", "senior_associate", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "fs_compiler", "reviewer", "client_service_manager"] },
  "pending-deliverables": { auth: "private", roles: ["owner", "admin", "audit_staff", "senior_associate", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "fs_compiler", "reviewer", "client_service_manager"] },

  "journal-entries": { auth: "private", roles: ["owner", "admin", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "client_service_manager"] },
  "accounts-receivable": { auth: "private", roles: ["owner", "admin", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "client_service_manager"] },
  "accounts-payable": { auth: "private", roles: ["owner", "admin", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "client_service_manager"] },
  leases: { auth: "private", roles: ["owner", "admin", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "client_service_manager"] },
  ppe: { auth: "private", roles: ["owner", "admin", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "client_service_manager"] },

  "day-to-day-postings": { auth: "private", roles: ["owner", "admin", "audit_staff", "senior_associate", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "client_service_manager"] },
  "monthly-close-routines": { auth: "private", roles: ["owner", "admin", "senior_associate", "bookkeeper", "fs_compiler", "reviewer", "audit_manager", "audit_partner", "client_service_manager"] },
  "year-end-reporting": { auth: "private", roles: ["owner", "admin", "senior_associate", "fs_compiler", "reviewer", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "client_service_manager"] },

  "review-queue": { auth: "private", roles: ["owner", "admin", "audit_manager", "client_service_manager", "reviewer", "fs_compiler", "bookkeeper"] },
  deliverables: { auth: "private", roles: ["owner", "admin", "audit_partner", "engagement_partner", "quality_control_reviewer"] },
  "partner-signoff": { auth: "private", roles: ["owner", "admin", "audit_partner", "engagement_partner", "quality_control_reviewer"] }
};

function resolvePractitionerScreenName(name) {
  const n = String(name || "").trim().toLowerCase();

  const alias = {
    settings: "settings-overview",
    "partner-signoff": "partner-signoff",
    "review-queue": "review-queue"
  };

  return alias[n] || n || PR_NAV.dashboard;
}

function canOpenPractitionerScreen(name) {
  const resolved = resolvePractitionerScreenName(name);
  return !!PR_SCREEN_POLICY[resolved];
}

async function switchPractitionerScreen(name, me, opts = {}) {
  const updateHash = opts.updateHash !== false;

  let screen = resolvePractitionerScreenName(name);

  if (!canOpenPractitionerScreen(screen)) {
    alert("This screen is not enabled yet.");
    return;
  }

  const access = guardPractitionerScreenAccess(screen, me);
  if (!access.ok) {
    if (access.reason === "auth") {
      window.safeRedirect("signin.html", "replace");
      return;
    }
    alert(`No access to ${screen}`);
    return;
  }

  screen = access.resolved;

  // show only the target screen
  document.querySelectorAll(".screen").forEach((el) => {
    el.classList.remove("active");
    el.classList.add("hidden");
  });

  const target = document.getElementById(`screen-${screen}`);
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }

  bindPractitionerContextRail();
  syncPractitionerContextRailForScreen(screen);

  setupPractitionerNav(me);
  renderPractitionerScreenTitle(screen, me);
  runPractitionerScreenBinder(screen, me);

  // update hash only when needed
  if (updateHash) {
    const nextHash = `screen=${encodeURIComponent(screen)}`;
    const currentHash = String(window.location.hash || "").replace(/^#/, "");
    if (currentHash !== nextHash) {
      window.location.hash = nextHash;
    }
  }
}

function renderPractitionerScreenTitle(screen, me) {
  const titles = {
    dashboard: "Assignment Dashboard",
    assignments: "Assignments",
    clients: "Clients",
    team: "Team",
    analytics: "Analytics",
    "action-center": "Action Center",
    "settings-overview": "Settings Overview",
    users: "Users",
    "roles-permissions": "Roles & Permissions",
    "firm-preferences": "Firm Preferences",
    "reporting-overview": "Reporting Overview",
    "pending-deliverables": "Pending Deliverables",
    "journal-entries": "Journal Entries",
    "accounts-receivable": "Accounts Receivable",
    "accounts-payable": "Accounts Payable",
    leases: "Leases",
    ppe: "PPE",
    "day-to-day-postings": "Day-to-Day Postings",
    "monthly-close-routines": "Monthly Close Routines",
    "year-end-reporting": "Year-End Reporting",
    "review-queue": "Review Queue",
    deliverables: "Deliverables",
    "partner-signoff": "Partner Sign-Off"
  };

  bindText("header.workspace_label", "Practitioner Workspace");
  bindText("header.dashboard_title", titles[screen] || "Practitioner Dashboard");

  const subtitles = {
    dashboard: "Client-service dashboard for bookkeeping, reporting engagements, approvals, and non-posting firm workflows.",
    assignments: "Track all active assignments, due dates, and role ownership.",
    clients: "View clients, service health, and engagement context.",
    team: "Monitor team allocation, utilization, and collaboration.",
    analytics: "View portfolio trends, delivery health, and risk signals.",
    "action-center": "Manage approvals, escalations, and workflow actions.",
    "settings-overview": "Configure the practitioner workspace and administration tools.",
    users: "Manage users, access, and client visibility.",
    "roles-permissions": "Control role rights for posting, review, and sign-off.",
    "firm-preferences": "Manage practice-level defaults and workspace settings.",
    "reporting-overview": "Review engagement summary, deadlines, and reporting readiness.",
    "pending-deliverables": "Track outstanding deliverables and reporting outputs.",
    "journal-entries": "Manage journal posting workflow and review routing.",
    "accounts-receivable": "Manage receivables posting and review workflow.",
    "accounts-payable": "Manage payables posting and vendor workflow.",
    leases: "Review lease accounting workflow and engagement controls.",
    ppe: "Review fixed asset workflow and reporting events.",
    "day-to-day-postings": "Monitor recurring posting activity for the engagement.",
    "monthly-close-routines": "Review monthly close routines and completion status.",
    "year-end-reporting": "Manage annual reporting and finalization workflow.",
    "review-queue": "Review work awaiting manager review.",
    deliverables: "Review final deliverables and reporting pack.",
    "partner-signoff": "Manage partner sign-off and final approval workflow."
  };

  bindText("header.dashboard_subtitle", subtitles[screen] || "Practitioner workflow screen.");
}

function renderStaticPlaceholders() {
  bindText("sidebar.assignments_count", "--");
  bindText("sidebar.clients_count", "--");
  bindText("sidebar.team_count", "--");
  bindText("sidebar.analytics_badge", "Live");
  bindText("sidebar.action_center_count", "--");
  bindText("sidebar.settings_badge", "Admin");

  bindText("kpis.active_assignments.value", "--");
  bindText("kpis.active_assignments.subtext", "--");
  bindText("kpis.active_assignments.badge", "--");

  bindText("kpis.upcoming_deadlines.value", "--");
  bindText("kpis.upcoming_deadlines.subtext", "--");
  bindText("kpis.upcoming_deadlines.badge", "--");

  bindText("kpis.trial_balance_snapshot.value", "--");
  bindText("kpis.trial_balance_snapshot.subtext", "--");
  bindText("kpis.trial_balance_snapshot.badge", "--");

  bindText("kpis.approval_queue.value", "--");
  bindText("kpis.approval_queue.subtext", "--");
  bindText("kpis.approval_queue.badge", "--");

  bindText("cycle_timeline.badge", "--");
  bindText("cycle_timeline.day_to_day.description", "--");
  bindText("cycle_timeline.day_to_day.label", "--");
  bindWidth("cycle_timeline.day_to_day.percent", 0);

  bindText("cycle_timeline.monthly_close.description", "--");
  bindText("cycle_timeline.monthly_close.label", "--");
  bindWidth("cycle_timeline.monthly_close.percent", 0);

  bindText("cycle_timeline.year_end.description", "--");
  bindText("cycle_timeline.year_end.label", "--");
  bindWidth("cycle_timeline.year_end.percent", 0);

  bindText("engagement_scope.client_ledger_badge", "Client Ledger Scope");
  bindText("engagement_scope.permissions_badge", permissionBadge(getStoredUser().role));

  bindText("reporting_overview.label", "Reporting Overview");
  bindText("reporting_overview.title", "--");
  bindText("reporting_overview.description", "--");
  bindText("reporting_overview.cycle", "--");
  bindText("reporting_overview.deadline", "--");
  bindText("reporting_overview.readiness_badge", "--");

  bindText("engagement_metrics.deliverables_progress.value", "--");
  bindText("engagement_metrics.deliverables_progress.subtext", "--");
  bindText("engagement_metrics.posting_modules_cleared.value", "--");
  bindText("engagement_metrics.posting_modules_cleared.subtext", "--");
  bindText("engagement_metrics.signoff_readiness.value", "--");
  bindText("engagement_metrics.signoff_readiness.subtext", "--");

  bindText("partner_analytics.engagement_profitability.value", "--");
  bindText("partner_analytics.engagement_profitability.subtext", "--");
  bindWidth("partner_analytics.engagement_profitability.percent", 0);

  bindText("partner_analytics.client_service_trends.value", "--");
  bindText("partner_analytics.client_service_trends.subtext", "--");
  bindWidth("partner_analytics.client_service_trends.percent", 0);

  renderEmptyState('[data-bind="tables.engagement_work_queue"]', 6, "No assignment rows yet");
  renderEmptyState('[data-bind="tables.role_access_matrix"]', 5, "No access matrix rows yet");
  renderListEmpty('[data-bind="lists.posting_status_tracker"]', "No posting tracker data yet");
  renderListEmpty('[data-bind="lists.action_center"]', "No action center items yet");
  renderListEmpty('[data-bind="lists.staff_utilization"]', "No utilization data yet");
  renderListEmpty('[data-bind="lists.risk_alerts"]', "No risk alerts yet");
}

function attachEvents(companies, me) {
  const clientSelect = document.querySelector('[data-bind="filters.client_id"]');
  const accessScopeSelect = document.querySelector('[data-bind="filters.access_scope"]');
  const viewSelect = document.querySelector('[data-bind="filters.view"]');

  if (viewSelect) {
    viewSelect.addEventListener("change", (e) => {
      const val = String(e.target.value || "").toLowerCase();
      if (val === "internal") {
        window.location.href = "dashboard.html";
      }
    });
  }

  if (clientSelect) {
    clientSelect.addEventListener("change", async (e) => {
      const nextCompanyId = Number(e.target.value || 0);
      if (!nextCompanyId || String(nextCompanyId) === String(me.company_id)) return;

      try {
        await switchCompany(nextCompanyId);
      } catch (err) {
        console.error("Failed to switch company:", err);
        alert(err.message || "Failed to switch company");
      }
    });
  }

  if (accessScopeSelect) {
    accessScopeSelect.addEventListener("change", (e) => {
      const nextScope = String(e.target.value || "assignment").toLowerCase();

      if (nextScope === "core") {
        window.location.href = "dashboard.html";
        return;
      }

      const assignmentCompanies = companies.filter(
        (c) => String(c.access_scope || "core").toLowerCase() === "assignment"
      );

      renderCompanyFilter(assignmentCompanies, me);
    });
  }

  document.querySelector('[data-action="open-engagement"]')?.addEventListener("click", () => {
    window.location.hash = "screen=assignments";
  });

  document.querySelector('[data-action="open-action-center"]')?.addEventListener("click", () => {
    window.location.hash = "screen=action-center";
  });

  document.querySelector('[data-action="view-deliverables"]')?.addEventListener("click", () => {
    window.location.hash = "screen=deliverables";
  });

}

async function switchCompany(companyId) {
  const out = await apiFetch(ENDPOINTS.auth.switchCompany, {
    method: "POST",
    body: JSON.stringify({ company_id: companyId }),
  });

  if (out?.token) {
    localStorage.setItem("fs_user_token", out.token);
    sessionStorage.setItem("fs_user_token", out.token);
    localStorage.setItem("authToken", out.token);
    sessionStorage.setItem("authToken", out.token);
  }

  const current = getStoredUser();
  const updated = {
    ...current,
    company_id: companyId,
    company_name: out.company_name || current.company_name,
    role: out.role || current.role,
    access_scope: out.access_scope || current.access_scope,
  };

  setStoredUser(updated);
  localStorage.setItem("company_id", String(companyId));
  if (updated.company_name) localStorage.setItem("companyName", updated.company_name);

  window.location.reload();
}

function resetClientOverviewCache() {
  PR_CLIENT_OVERVIEW_CACHE = {
    summary: null,
    engagements: [],
    reportingDeliverables: null,
    operations: null,
    closeFinalisation: null,
    riskAlerts: null
  };
}

function renderEmptyState(selector, colSpan, message) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="${colSpan}" class="text-center text-slate-500">${message}</td>
    </tr>
  `;
}

function renderListEmpty(selector, message) {
  const el = document.querySelector(selector);
  if (!el) return;

  el.innerHTML = `
    <div class="card-soft p-4 text-sm text-slate-500">${message}</div>
  `;
}

function humanizeScope(scope) {
  const s = String(scope || "").toLowerCase();
  if (s === "assignment") return "Assignment";
  if (s === "core") return "Core / Internal";
  return scope || "--";
}

function humanizeRole(role) {
  const r = String(role || "").toLowerCase();

  const map = {
    owner: "Owner",
    admin: "Admin",
    cfo: "CFO",
    manager: "Manager",
    senior: "Senior Accountant",
    accountant: "Accountant",
    clerk: "Accounts Clerk",
    viewer: "Viewer",
    bookkeeper: "Bookkeeper",
    audit_staff: "Audit Staff",
    senior_associate: "Senior Associate",
    audit_manager: "Audit Manager",
    audit_partner: "Audit Partner",
    engagement_partner: "Engagement Partner",
    quality_control_reviewer: "Quality Control Reviewer",
    fs_compiler: "Financial Statement Compiler",
    reviewer: "Reviewer",
    client_service_manager: "Client Service Manager",
  };

  return map[r] || role || "--";
}

function canUseBothDashboards(role) {
  const r = String(role || "").toLowerCase();
  return [
    "owner",
    "audit_partner",
    "engagement_partner",
    "audit_manager",
    "client_service_manager"
  ].includes(r);
}

function isAuditStaffRole(role) {
  return ["audit_staff", "senior_associate", "viewer"].includes(String(role || "").toLowerCase());
}

function isAuditManagerRole(role) {
  return ["audit_manager", "client_service_manager", "reviewer", "bookkeeper", "fs_compiler"].includes(
    String(role || "").toLowerCase()
  );
}

function isAuditPartnerRole(role) {
  return ["audit_partner", "engagement_partner", "quality_control_reviewer"].includes(
    String(role || "").toLowerCase()
  );
}

function canSeePostingModules(role) {
  return isAuditManagerRole(role) || isAuditPartnerRole(role);
}

function canPostInEngagement(role) {
  return isAuditManagerRole(role);
}

function canApproveOnly(role) {
  return isAuditPartnerRole(role);
}

function permissionBadge(role) {
  const r = String(role || "").toLowerCase();

  if (r === "audit_partner" || r === "engagement_partner" || r === "quality_control_reviewer") {
    return "Approval only";
  }

  if (r === "audit_manager" || r === "client_service_manager" || r === "bookkeeper" || r === "fs_compiler") {
    return "Posting + review";
  }

  return "Read only";
}

function setPageTitle(companyName, dashboardName = "Practitioner Dashboard") {
  document.title = companyName
    ? `${dashboardName} - ${companyName}`
    : `${dashboardName} - FinSage`;
}

function setActiveNav(navKey) {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.classList.remove("active");
    if (el.dataset.nav === navKey) {
      el.classList.add("active");
    }
  });
}

function getActionCenterFilters() {
  return {
    customer_id: (document.getElementById("actionCenterClientFilter")?.value || "").trim(),
    engagement_id: (document.getElementById("actionCenterEngagementFilter")?.value || "").trim(),
    queue_type: (document.getElementById("actionCenterTypeFilter")?.value || "").trim(),
    status: (document.getElementById("actionCenterStatusFilter")?.value || "").trim(),
    priority: (document.getElementById("actionCenterPriorityFilter")?.value || "").trim(),
    q: (document.getElementById("actionCenterSearchInput")?.value || "").trim(),
    mine: PR_ACTION_CENTER_MINE_ONLY ? "true" : ""
  };
}

function resetActionCenterCache() {
  PR_ACTION_CENTER_CACHE = {
    summary: null,
    rows: [],
    selectedRow: null,
    filtersKey: ""
  };
}

function getAvailableDashboardModes(companies = [], role = "") {
  const canSwitch = canUseBothDashboards(role);

  const rows = Array.isArray(companies) ? companies : [];

  const hasCore = rows.some(
    c => String(c?.access_scope || "core").toLowerCase() === "core"
  );

  const hasAssignment = rows.some(
    c => String(c?.access_scope || "core").toLowerCase() === "assignment"
  );

  return {
    canSwitch,
    hasCore,
    hasAssignment
  };
}

function initDashboardModeSwitcher(companies = [], me = {}, currentMode = "internal") {
  const wrap = document.getElementById("dashboardModeSwitcherWrap");
  const select = document.getElementById("dashboardModeSwitcher");
  if (!wrap || !select) return;

  const safeMe = me || {};
  const safeRole = String(safeMe.role || "").toLowerCase();

  const modes = getAvailableDashboardModes(companies, safeRole);

  if (!modes.canSwitch || (!modes.hasCore && !modes.hasAssignment)) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");

  // rebuild options cleanly each time
  select.innerHTML = "";

  if (modes.hasCore) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="internal">Internal Dashboard</option>`
    );
  }

  if (modes.hasAssignment) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="practitioner">Practitioner Dashboard</option>`
    );
  }

  select.value = currentMode;

  select.onchange = () => {
    const next = String(select.value || "").toLowerCase();

    if (next === "internal") {
      window.location.href = "dashboard.html";
      return;
    }

    if (next === "practitioner") {
      window.location.href = "practitionerdashboard.html";
    }
  };
}

function getHashScreen() {
  const raw = String(window.location.hash || "").replace(/^#/, "");
  if (!raw) return "dashboard";

  const params = new URLSearchParams(raw);
  return params.get("screen") || raw || "dashboard";
}

function bindCompanyIdentity(me) {
  const companyName = me.company_name || localStorage.getItem("companyName") || "--";

  bindText("profile.firm_name", companyName);
  bindText("engagement.client_name", companyName);
  bindText("engagement.title", me.engagement_title || "--");

  setPageTitle(companyName, "Practitioner Dashboard");
}

function renderContextBar(me) {
  bindText("context.client_name", me.company_name || "--");
  bindText("context.role_name", humanizeRole(me.role));
  bindText("context.access_scope", humanizeScope(me.access_scope));
}

function humanizeGovernanceMode(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "owner_managed") return "Owner Managed";
  if (m === "assisted") return "Assisted";
  if (m === "controlled") return "Controlled";
  return mode || "--";
}

function shouldShowPractitionerNavItem(item, me) {
  if (!item) return false;

  if (typeof item.visible === "function" && !item.visible(me)) {
    console.log("HIDE nav item by visible():", item.name, me?.role);
    return false;
  }

  if (item.screen) {
    if (!canOpenPractitionerScreen(item.screen)) {
      console.log("HIDE nav item unknown screen:", item.name, item.screen);
      return false;
    }

    const access = guardPractitionerScreenAccess(item.screen, me);
    if (!access?.ok) {
      console.log("HIDE nav item by policy:", item.name, item.screen, me?.role, access);
      return false;
    }
  }

  if (!item.screen && Array.isArray(item.children)) {
    const result = item.children.some((child) => shouldShowPractitionerNavItem(child, me));
    if (!result) {
      console.log("HIDE parent nav item no visible children:", item.name, me?.role);
    }
    return result;
  }

  return true;
}

function renderPractitionerNavMenu(menu, targetEl, me, level = 0) {
  const wrap = document.createElement("div");
  wrap.classList.add("space-y-2");

  const current = resolvePractitionerScreenName(getHashScreen());

  menu.forEach((item) => {
    if (!shouldShowPractitionerNavItem(item, me)) return;

    const visibleChildren = Array.isArray(item.children)
      ? item.children.filter((child) => shouldShowPractitionerNavItem(child, me))
      : [];

    // skip empty parents
    if (!item.screen && Array.isArray(item.children) && !visibleChildren.length) {
      return;
    }

    const itemWrap = document.createElement("div");
    itemWrap.classList.add("pr-nav-item");

    const link = document.createElement("button");
    link.type = "button";

    if (level === 0) {
      link.className = "nav-link flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left";
    } else {
      link.className = "sub-item w-full text-left";
    }

    const isActiveScreen = item.screen && current === item.screen;

    const hasActiveChild =
      Array.isArray(item.children) &&
      item.children.some((child) => {
        if (!shouldShowPractitionerNavItem(child, me)) return false;
        if (child.screen && resolvePractitionerScreenName(child.screen) === current) return true;
        if (Array.isArray(child.children)) {
          return child.children.some(
            (gChild) =>
              shouldShowPractitionerNavItem(gChild, me) &&
              gChild.screen &&
              resolvePractitionerScreenName(gChild.screen) === current
          );
        }
        return false;
      });

    if (isActiveScreen || hasActiveChild) {
      link.classList.add("active");
    }

    if (item.screen) {
      if (level === 0) {
        link.innerHTML = `
          <span class="font-medium">${escapeHtml(item.name)}</span>
          <span class="badge bg-white/10 text-slate-100">${escapeHtml(item.badge || "--")}</span>
        `;
      } else {
        link.innerHTML = `
          <div class="font-semibold">${escapeHtml(item.name)}</div>
        `;
      }

      link.setAttribute("data-pr-nav", item.screen);
      itemWrap.appendChild(link);
    } else if (visibleChildren.length) {
      link.classList.add("pr-parent-toggle");

      if (level === 0) {
        link.innerHTML = `
          <span class="font-medium">${escapeHtml(item.name)}</span>
          <span class="text-xs pr-arrow">${hasActiveChild ? "▾" : "▸"}</span>
        `;
      } else {
        link.innerHTML = `
          <span class="font-semibold">${escapeHtml(item.name)}</span>
          <span class="text-xs pr-arrow ml-auto">${hasActiveChild ? "▾" : "▸"}</span>
        `;
      }

      itemWrap.appendChild(link);

      const childWrap = document.createElement("div");
      childWrap.className = "mt-2 ml-3 space-y-2";
      if (!hasActiveChild) childWrap.classList.add("hidden");

      itemWrap.appendChild(childWrap);
      renderPractitionerNavMenu(visibleChildren, childWrap, me, level + 1);

      link.addEventListener("click", (e) => {
        e.preventDefault();

        const isHidden = childWrap.classList.contains("hidden");
        childWrap.classList.toggle("hidden", !isHidden);

        const arrow = link.querySelector(".pr-arrow");
        if (arrow) arrow.textContent = isHidden ? "▾" : "▸";
      });
    }

    wrap.appendChild(itemWrap);
  });

  targetEl.appendChild(wrap);
  return wrap;
}

const INDUSTRY_CATALOG = {
  "Agriculture": [],

  "Automotive Services": [
    "Auto Repair Workshop",
    "Auto Electrical",
    "Tyre & Fitment",
    "Panel Beating",
    "Spray Painting"
  ],

  "Body Corporate": [],

  "Call Center": [],

  "Car Dealership": [
    "New Vehicles",
    "Used Vehicles",
    "Motorcycle Dealership"
  ],

  "Construction": [
    "Residential Building Contractor",
    "Civil Engineering",
    "Electrical & Mechanical",
    "Plumbing & Drainage",
    "Roadworks"
  ],

  "Engineering & Technical": [
    "Mechanical Engineering",
    "Electrical Engineering",
    "Industrial Engineering",
    "Technical Services"
  ],

  "Hospitality": [
    "Hotel",
    "Events & Catering",
    "Guest House / Lodge"
  ],

  "IT & Technology": [
    "Software Development",
    "Managed IT Services",
    "Networking & Infrastructure",
    "Cybersecurity"
  ],

  "Logistics & Transport": [
    "Freight / Logistics",
    "Courier / Last Mile",
    "Public Transport",
    "Fleet Services"
  ],

  "Management Services": [],

  "Manufacturing": [
    "Light Manufacturing",
    "Fabrication",
    "Food Processing"
  ],

  "Mining": [
    "Open-Pit Mining",
    "Underground Mining",
    "Quarrying & Aggregates",
    "Coal Mining",
    "Gold & PGM Mining"
  ],

  "NPO Education": [
    "Primary Education",
    "Higher Education"
  ],

  "Private School": [],

  "NPO Healthcare": [
    "Clinic",
    "Hospital"
  ],

  "NPO IT": [],

  "NPO Transport": [],

  "Private Healthcare": [
    "GP Clinic",
    "Specialist Practice",
    "Dentistry"
  ],

  "Professional Services": [
    "Auditing & Accounting",
    "Architecture",
    "Legal Services",
    "Engineering Consulting",
    "HR & Recruitment",
    "Business Consulting"
  ],

  "Property Management": [],

  "Restaurant": [
    "Fast Food",
    "Casual Dining",
    "Fine Dining"
  ],

  "Retail & Wholesale": [
    "Wholesale",
    "E-commerce Retail",
    "Brick & Mortar Retail"
  ],

  "Security Services": [
    "Guarding",
    "Alarm Monitoring",
    "Technical Security Systems"
  ],

  "Transport": [
    "Courier / Last Mile",
    "Freight / Logistics",
    "Public Transport"
  ],
  "Clubs & Associations": [
    "Sports Club",
    "Social Club",
    "Professional Association"
  ],
};

const WORKSPACE_REQUIRED_ENGAGEMENT_TYPES = new Set([
  "bookkeeping",
  "monthly_bookkeeping",
  "write_up",
  "management_accounts",
  "vat",
  "payroll",
  "tax",
  "tax_compliance",
  "annual_financial_statements",
  "year_end_financials",
  "compilation",
  "review",
  "audit",
  "audit_support",
  "internal_audit",
  "independent_review",
  "cleanup",
  "migration",
  "outsourced_finance"
]);

function populateIndustryOptions() {
  const industryEl = document.getElementById("engIndustry");
  if (!industryEl) return;

  const current = industryEl.value || "";
  const keys = Object.keys(INDUSTRY_CATALOG).sort();

  industryEl.innerHTML = '<option value="">Select industry</option>' +
    keys.map(name => `<option value="${name}">${name}</option>`).join("");

  industryEl.value = current;
}

function populateSubIndustryOptions(industry, selectedValue = "") {
  const subEl = document.getElementById("engSubIndustry");
  if (!subEl) return;

  const items = Array.isArray(INDUSTRY_CATALOG[industry]) ? INDUSTRY_CATALOG[industry] : [];

  subEl.innerHTML = '<option value="">Select sub-industry</option>' +
    items.map(name => `<option value="${name}">${name}</option>`).join("");

  subEl.disabled = items.length === 0;
  subEl.value = items.includes(selectedValue) ? selectedValue : "";
}

function toggleEngagementWorkspaceSetup() {
  const type = document.getElementById("engType")?.value || "";
  const block = document.getElementById("engWorkspaceSetupBlock");

  if (!block) return;

  const needsWorkspace = WORKSPACE_REQUIRED_ENGAGEMENT_TYPES.has(type);
  block.classList.toggle("hidden", !needsWorkspace);

  if (needsWorkspace) {
    populateIndustryOptions();
  }
}

function bindPractitionerNav(me) {
  const host = document.getElementById("prSidebarNav");
  if (!host || PR_NAV_EVENTS_BOUND) return;
  PR_NAV_EVENTS_BOUND = true;

  host.addEventListener("click", async (e) => {
    const link = e.target.closest("[data-pr-nav]");
    if (!link) return;

    const nav = link.getAttribute("data-pr-nav");
    if (!nav) return;

    e.preventDefault();
    await switchPractitionerScreen(nav, me);
  });

  host.addEventListener("keydown", async (e) => {
    const link = e.target.closest("[data-pr-nav]");
    if (!link) return;

    if (e.key !== "Enter" && e.key !== " ") return;

    const nav = link.getAttribute("data-pr-nav");
    if (!nav) return;

    e.preventDefault();
    await switchPractitionerScreen(nav, me);
  });
}

function setupPractitionerNav(me) {
  const host = document.getElementById("prSidebarNav");
  if (!host) return;

  host.innerHTML = "";
  renderPractitionerNavMenu(PR_NAV_MENU, host, me, 0);
  bindPractitionerNav(me);
}

function runPractitionerScreenBinder(screen, me) {
  switch (screen) {
    case PR_NAV.dashboard:
      renderDashboardHome?.(me);
      break;

    case PR_NAV.assignments:
      renderAssignmentsScreen?.(me);
      break;

    case PR_NAV.clients:
      renderClientsScreen?.(me);
      break;

    case PR_NAV.team:
      renderTeamScreen?.(me);
      break;

    case PR_NAV.analytics:
    case PR_NAV.analyticsDetail:
      renderAnalyticsScreen?.(me, screen);
      break;

    case PR_NAV.actionCenter:
      renderActionCenterScreen?.(me);
      break;

    case PR_NAV.settings:
    case PR_NAV.settingsOverview:
    case PR_NAV.users:
    case PR_NAV.rolesPermissions:
    case PR_NAV.firmPreferences:
      renderSettingsScreen?.(me, screen);
      break;

    case PR_NAV.reportingOverview:
      renderReportingOverviewScreen?.(me);
      break;

    case PR_NAV.pendingDeliverables:
      renderPendingDeliverablesScreen?.(me);
      break;

    case PR_NAV.dayToDayPostings:
      renderDayToDayPostingsScreen?.(me);
      break;

    case PR_NAV.monthlyCloseRoutines:
      renderMonthlyCloseRoutinesScreen?.(me);
      break;

    case PR_NAV.yearEndReporting:
      renderYearEndReportingScreen?.(me);
      break;

    case PR_NAV.journalEntries:
    case PR_NAV.accountsReceivable:
    case PR_NAV.accountsPayable:
    case PR_NAV.leases:
    case PR_NAV.ppe:
    case PR_NAV.reviewQueue:
    case PR_NAV.deliverables:
    case PR_NAV.partnerSignoff:
      renderEngagementScreen?.(me, screen);
      break;

    default:
      renderDashboardHome?.(me);
      break;
  }
}

function renderEngagementScreen(me, screen) {
  const canPost = canPostInEngagement(me.role);
  const canApprove = canApproveOnly(me.role);

  const postBtn = document.querySelector('[data-action="post-entry"]');
  const approveBtn = document.querySelector('[data-action="approve-entry"]');

  if (postBtn) postBtn.classList.toggle("hidden", !canPost);
  if (approveBtn) approveBtn.classList.toggle("hidden", !canApprove);
}

function renderActionCenterScreen(me) {
  const canPost = canPostInEngagement(me.role);
  const canApprove = canApproveOnly(me.role);

  bindText("summary.role_name", humanizeRole(me.role));

  const postControls = document.getElementById("postingControls");
  const approvalControls = document.getElementById("approvalControls");

  if (postControls) postControls.classList.toggle("hidden", !canPost);
  if (approvalControls) approvalControls.classList.toggle("hidden", !canApprove);
}

function getActiveCompanyId() {
  return Number(
    window.currentUser?.company_id ||
    localStorage.getItem("company_id") ||
    0
  );
}

function fmtDate(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function esc(value) {
  return escapeHtml(value);
}

function roleBadgeClass(role) {
  const r = String(role || "").toLowerCase();
  if (["partner", "audit_partner", "engagement_partner"].includes(r)) return "badge-warn";
  if (["manager", "audit_manager", "client_service_manager"].includes(r)) return "badge-brand";
  return "badge-slate";
}

function engagementStatusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (["active"].includes(s)) return "badge-ok";
  if (["draft", "pending"].includes(s)) return "badge-slate";
  if (["on_hold"].includes(s)) return "badge-warn";
  if (["completed"].includes(s)) return "badge-brand";
  if (["cancelled", "archived"].includes(s)) return "badge-danger";
  return "badge-slate";
}

async function loadAssignmentsData({ status = "", engagement_type = "", q = "", limit = 100, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId) throw new Error("No active company selected.");

  const out = await apiFetch(
    ENDPOINTS.engagements.list(companyId, { status, engagement_type, q, limit, offset }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

async function loadEngagementDetail(engagementId) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagements.get(companyId, engagementId),
    { method: "GET" }
  );

  return out?.row || null;
}

async function loadEngagementTeamData(engagementId, activeOnly = true) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagements.teamList(companyId, engagementId, { active_only: activeOnly }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

function renderAssignmentsTable(rows) {
  const tbody = document.getElementById("assignmentsTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center text-slate-500">No assignments found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const statusClass = engagementStatusBadgeClass(row.status);

    const managerLabel = row.manager_name
      ? `${row.manager_name}${row.manager_role ? ` - ${window.ROLE_LABELS?.[window.normalizeRole(row.manager_role)] || humanizeRole(row.manager_role) || row.manager_role}` : ""}`
      : getUserLabelById(row.manager_user_id);

    const partnerLabel = row.partner_name
      ? `${row.partner_name}${row.partner_role ? ` - ${window.ROLE_LABELS?.[window.normalizeRole(row.partner_role)] || humanizeRole(row.partner_role) || row.partner_role}` : ""}`
      : getUserLabelById(row.partner_user_id);

    return `
      <tr>
        <td>
          <div class="font-semibold text-slate-900">${esc(row.engagement_name || "--")}</div>
          <div class="text-xs text-slate-500">${esc(row.engagement_code || "--")}</div>
        </td>
        <td>${esc(row.customer_name || "--")}</td>
        <td class="capitalize">${esc(row.engagement_type || "--")}</td>
        <td><span class="badge ${statusClass}">${esc(row.status || "--")}</span></td>
        <td>${esc(row.reporting_cycle || "--")}</td>
        <td>${fmtDate(row.due_date)}</td>
        <td>${esc(managerLabel)}</td>
        <td>${esc(partnerLabel)}</td>
        <td>
          <button
            class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            data-assignment-open="${esc(row.id)}"
          >
            Open
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAssignmentDetail(row) {
  const card = document.getElementById("assignmentDetailCard");
  const title = document.getElementById("assignmentDetailTitle");
  const subtitle = document.getElementById("assignmentDetailSubtitle");
  const body = document.getElementById("assignmentDetailBody");
  const reportingBtn = document.getElementById("assignmentOpenReportingBtn");
  const deliverablesBtn = document.getElementById("assignmentOpenDeliverablesBtn");

  if (!card || !title || !subtitle || !body) return;

  if (!row) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  title.textContent = row.engagement_name || "Engagement Detail";
  subtitle.textContent = `${row.customer_name || "--"} • ${row.engagement_type || "--"} • ${row.status || "--"}`;

  body.innerHTML = `
    <div class="card-soft p-4">
      <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Engagement</div>
      <div class="mt-2 space-y-2 text-sm">
        <div><span class="font-semibold">Code:</span> ${esc(row.engagement_code || "--")}</div>
        <div><span class="font-semibold">Governance:</span> ${esc(row.governance_mode || "--")}</div>
        <div><span class="font-semibold">Cycle:</span> ${esc(row.reporting_cycle || "--")}</div>
        <div><span class="font-semibold">Priority:</span> ${esc(row.priority || "--")}</div>
        <div><span class="font-semibold">Workflow Stage:</span> ${esc(row.workflow_stage || "--")}</div>
      </div>
    </div>

    <div class="card-soft p-4">
      <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Dates & Ownership</div>
      <div class="mt-2 space-y-2 text-sm">
        <div><span class="font-semibold">Start:</span> ${fmtDate(row.start_date)}</div>
        <div><span class="font-semibold">Due:</span> ${fmtDate(row.due_date)}</div>
        <div><span class="font-semibold">End:</span> ${fmtDate(row.end_date)}</div>
        <div><span class="font-semibold">Manager:</span> ${esc(row.manager_user_id ? `User #${row.manager_user_id}` : "--")}</div>
        <div><span class="font-semibold">Partner:</span> ${esc(row.partner_user_id ? `User #${row.partner_user_id}` : "--")}</div>
      </div>
    </div>

    <div class="card-soft p-4 xl:col-span-2">
      <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Scope Summary</div>
      <div class="mt-2 text-sm text-slate-700">${esc(row.scope_summary || row.description || "--")}</div>
    </div>
  `;

  if (reportingBtn) {
    reportingBtn.onclick = () => {
      window.location.hash = "screen=reporting-overview";
    };
  }

  if (deliverablesBtn) {
    deliverablesBtn.onclick = () => {
      window.location.hash = "screen=pending-deliverables";
    };
  }
}

async function refreshAssignmentsScreen() {
  const msg = document.getElementById("assignmentsMsg");
  const q = document.getElementById("assignmentsSearch")?.value?.trim() || "";
  const status = document.getElementById("assignmentsStatusFilter")?.value || "";
  const engagement_type = document.getElementById("assignmentsTypeFilter")?.value || "";

  try {
    if (msg) msg.textContent = "Loading assignments...";
    const rows = await loadAssignmentsData({ q, status, engagement_type });
    PR_ASSIGNMENTS_CACHE = rows;
    renderAssignmentsTable(rows);
    if (msg) msg.textContent = `${rows.length} assignment(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load assignments.";
    renderAssignmentsTable([]);
  }
}

function bindAssignmentsScreenEvents() {
  document.getElementById("assignmentsRefreshBtn")?.addEventListener("click", refreshAssignmentsScreen);

  document.getElementById("assignmentsSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshAssignmentsScreen();
  });

  document.getElementById("assignmentsStatusFilter")?.addEventListener("change", refreshAssignmentsScreen);
  document.getElementById("assignmentsTypeFilter")?.addEventListener("change", refreshAssignmentsScreen);

  document.getElementById("assignmentsTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-assignment-open]");
    if (!btn) return;

    const engagementId = Number(btn.getAttribute("data-assignment-open") || 0);
    if (!engagementId) return;

    try {
      const row = await loadEngagementDetail(engagementId);
      PR_SELECTED_ENGAGEMENT = row;
      renderAssignmentDetail(row);

      const teamFilter = document.getElementById("teamEngagementFilter");
      if (teamFilter) teamFilter.value = String(engagementId);
    } catch (err) {
      console.error(err);
    }
  });
}

function populateTeamEngagementFilter(rows) {
  const select = document.getElementById("teamEngagementFilter");
  if (!select) return;

  const current = select.value || "";

  select.innerHTML = `<option value="">Select engagement</option>` + rows.map((row) => `
    <option value="${esc(row.id)}">${esc(row.engagement_name || "--")} • ${esc(row.customer_name || "--")}</option>
  `).join("");

  if (current) select.value = current;
}

function renderTeamTable(rows) {
  const tbody = document.getElementById("teamTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-slate-500">No team members found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || `User #${row.user_id}`;
    return `
      <tr>
        <td>${esc(fullName)}</td>
        <td>${esc(row.email || "--")}</td>
        <td><span class="badge ${roleBadgeClass(row.role_on_engagement)}">${esc(row.role_on_engagement || "--")}</span></td>
        <td>${row.allocation_percent != null ? esc(row.allocation_percent) : "--"}</td>
        <td>${fmtDate(row.start_date)}</td>
        <td>${fmtDate(row.end_date)}</td>
        <td><span class="badge ${row.is_active ? "badge-ok" : "badge-slate"}">${row.is_active ? "Active" : "Inactive"}</span></td>
      </tr>
    `;
  }).join("");
}

function renderTeamSummary(rows, engagementRow) {
  const card = document.getElementById("teamSummaryCard");
  const subtitle = document.getElementById("teamSummarySubtitle");
  const body = document.getElementById("teamSummaryBody");
  if (!card || !subtitle || !body) return;

  if (!engagementRow) {
    card.classList.add("hidden");
    return;
  }

  const activeRows = rows.filter(r => !!r.is_active);
  const total = rows.length;
  const active = activeRows.length;
  const alloc = activeRows.reduce((sum, r) => sum + Number(r.allocation_percent || 0), 0);

  card.classList.remove("hidden");
  subtitle.textContent = `${engagementRow.engagement_name || "--"} • ${engagementRow.customer_name || "--"}`;

  body.innerHTML = `
    <div class="card-soft p-4">
      <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Team Members</div>
      <div class="mt-2 metric-number">${total}</div>
      <div class="mt-1 text-sm text-slate-600">All rows on this engagement</div>
    </div>

    <div class="card-soft p-4">
      <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Active Assignments</div>
      <div class="mt-2 metric-number">${active}</div>
      <div class="mt-1 text-sm text-slate-600">Currently active team allocations</div>
    </div>

    <div class="card-soft p-4">
      <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Allocation Total</div>
      <div class="mt-2 metric-number">${alloc.toFixed(0)}%</div>
      <div class="mt-1 text-sm text-slate-600">Sum of active allocation percentages</div>
    </div>
  `;
}

async function refreshTeamScreen() {
  const msg = document.getElementById("teamMsg");
  const engagementId = Number(document.getElementById("teamEngagementFilter")?.value || 0);
  const activeOnly = (document.getElementById("teamActiveFilter")?.value || "true") === "true";

  if (!engagementId) {
    if (msg) msg.textContent = "Select an engagement to load team members.";
    renderTeamTable([]);
    renderTeamSummary([], null);
    return;
  }

  try {
    if (msg) msg.textContent = "Loading team members...";
    const rows = await loadEngagementTeamData(engagementId, activeOnly);
    PR_TEAM_CACHE = rows;

    const engagementRow =
      PR_ASSIGNMENTS_CACHE.find(r => Number(r.id) === engagementId) ||
      PR_SELECTED_ENGAGEMENT ||
      null;

    renderTeamTable(rows);
    renderTeamSummary(rows, engagementRow);
    if (msg) msg.textContent = `${rows.length} team row(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load team.";
    renderTeamTable([]);
    renderTeamSummary([], null);
  }
}

function bindTeamScreenEvents() {
  document.getElementById("teamRefreshBtn")?.addEventListener("click", refreshTeamScreen);
  document.getElementById("teamEngagementFilter")?.addEventListener("change", refreshTeamScreen);
  document.getElementById("teamActiveFilter")?.addEventListener("change", refreshTeamScreen);
}


async function loadCustomersData({ q = "", limit = 200, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId) throw new Error("No active company selected.");

  const out = await apiFetch(
    ENDPOINTS.customers.list(companyId, { q, limit, offset }),
    { method: "GET" }
  );

  if (Array.isArray(out)) return out;
  if (Array.isArray(out?.rows)) return out.rows;
  if (Array.isArray(out?.customers)) return out.customers;
  return [];
}


function engagementModalEl() {
  return document.getElementById("engagementModal");
}

function openEngagementModal() {
  engagementModalEl()?.classList.remove("hidden");
}

function closeEngagementModal() {
  engagementModalEl()?.classList.add("hidden");
}

function setEngagementModalMsg(msg, tone = "info") {
  const el = document.getElementById("engagementModalMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "text-sm";
  if (tone === "error") el.classList.add("text-red-600");
  else if (tone === "success") el.classList.add("text-green-700");
  else el.classList.add("text-slate-500");
}

function populateEngagementCustomerSelect(rows) {
  const select = document.getElementById("engCustomerId");
  if (!select) return;

  select.innerHTML = `<option value="">Select customer</option>` + rows.map((row) => `
    <option value="${esc(row.id)}">${esc(row.name || `Customer #${row.id}`)}</option>
  `).join("");
}

function resetEngagementModalForm() {
  const ids = [
    "engCustomerId",
    "engCode",
    "engName",
    "engType",
    "engStatus",
    "engGovernanceMode",
    "engReportingCycle",
    "engStartDate",
    "engDueDate",
    "engEndDate",
    "engPriority",
    "engWorkflowStage",
    "engManagerUserId",
    "engPartnerUserId",
    "engDescription",
    "engScopeSummary",
    "engFiscalYearEnd",
    "engTargetCompanyId",
    "engIndustry",
    "engSubIndustry",
    "engCountry",
    "engCurrency",
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === "engStatus") el.value = "draft";
    else if (id === "engPriority") el.value = "normal";
    else if (id === "engWorkflowStage") el.value = "planning";
    else el.value = "";
  });

  const sub = document.getElementById("engSubIndustry");
  if (sub) {
    sub.innerHTML = '<option value="">Select sub-industry</option>';
    sub.disabled = true;
  }

  setEngagementModalMsg("");
}

async function createEngagementApi(payload) {
  const companyId = getActiveCompanyId();
  if (!companyId) throw new Error("No active company selected.");

  return apiFetch(
    ENDPOINTS.engagements.create(companyId),
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

function readEngagementModalPayload() {
  const customerId = Number(document.getElementById("engCustomerId")?.value || 0);
  const targetCompanyId =
    _parseModalInt(document.getElementById("engTargetCompanyId")?.value) || null;

  const country = document.getElementById("engCountry")?.value?.trim() || "";
  const currency = document.getElementById("engCurrency")?.value?.trim() || "";
  const industry = document.getElementById("engIndustry")?.value || "";
  const subIndustry = document.getElementById("engSubIndustry")?.value || "";

  return {
    customer_id: customerId,
    target_company_id: targetCompanyId,
    engagement_code: document.getElementById("engCode")?.value?.trim() || "",
    engagement_name: document.getElementById("engName")?.value?.trim() || "",
    engagement_type: document.getElementById("engType")?.value || "",
    status: document.getElementById("engStatus")?.value || "draft",
    governance_mode: document.getElementById("engGovernanceMode")?.value || "",
    reporting_cycle: document.getElementById("engReportingCycle")?.value || "",
    start_date: document.getElementById("engStartDate")?.value || null,
    due_date: document.getElementById("engDueDate")?.value || null,
    end_date: document.getElementById("engEndDate")?.value || null,
    priority: document.getElementById("engPriority")?.value || "normal",
    workflow_stage: document.getElementById("engWorkflowStage")?.value || "planning",
    manager_user_id: _parseModalInt(document.getElementById("engManagerUserId")?.value),
    partner_user_id: _parseModalInt(document.getElementById("engPartnerUserId")?.value),
    description: document.getElementById("engDescription")?.value?.trim() || "",
    scope_summary: document.getElementById("engScopeSummary")?.value?.trim() || "",
    financial_year_start: document.getElementById("engFinancialYearStart")?.value || null,

    target_company: {
      country,
      currency,
      industry,
      subIndustry
    }
  };
}

function populateUserSelect(selectId, users, predicate, placeholder) {
  const el = document.getElementById(selectId);
  if (!el) return;

  const currentValue = el.value || "";

  const filtered = (Array.isArray(users) ? users : [])
    .filter(user => user?.is_active !== false && user?.user_is_active !== false)
    .filter(predicate);

  el.innerHTML = "";

  const firstOpt = document.createElement("option");
  firstOpt.value = "";
  firstOpt.textContent = placeholder;
  el.appendChild(firstOpt);

  filtered.forEach((user) => {
    const opt = document.createElement("option");
    opt.value = String(user.user_id ?? user.id ?? "");
    opt.textContent = optionTextForUser(user);
    el.appendChild(opt);
  });

  if (currentValue && [...el.options].some(o => o.value === currentValue)) {
    el.value = currentValue;
  }
}

async function bindEngagementAssigneeDropdowns() {
  const cid = getActiveCompanyId();
  if (!cid) return;

  try {
    if (!PR_USERS_CACHE.length) {
      PR_USERS_CACHE = await loadEngagementAssignableUsers(cid);
    }

    populateUserSelect(
      "engManagerUserId",
      PR_USERS_CACHE,
      isManagerRole,
      "Select manager"
    );

    populateUserSelect(
      "engPartnerUserId",
      PR_USERS_CACHE,
      isPartnerRole,
      "Select partner"
    );
  } catch (err) {
    console.error("Failed to load engagement assignees:", err);

    populateUserSelect("engManagerUserId", [], () => false, "No managers available");
    populateUserSelect("engPartnerUserId", [], () => false, "No partners available");
  }
}

function _parseModalInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validateEngagementPayload(payload) {
  if (!payload.customer_id) return "Customer is required.";
  if (!payload.engagement_name) return "Engagement name is required.";
  if (!payload.engagement_type) return "Engagement type is required.";

  const type = String(payload.engagement_type || "").toLowerCase();

  const requiresWorkspace = [
    "bookkeeping",
    "monthly_bookkeeping",
    "write_up",
    "management_accounts",
    "vat",
    "payroll",
    "tax",
    "tax_compliance",
    "annual_financial_statements",
    "year_end_financials",
    "compilation",
    "review",
    "audit",
    "audit_support",
    "internal_audit",
    "independent_review",
    "cleanup",
    "migration",
    "outsourced_finance"
  ].includes(type);

  if (requiresWorkspace) {
    const hasExistingTarget = !!payload.target_company_id;
    const country = String(payload?.target_company?.country || "").trim();
    const industry = String(payload?.target_company?.industry || "").trim();

    if (!hasExistingTarget) {
      if (!country) return "Country is required to create a workspace for this engagement.";
      if (!industry) return "Industry is required to create a workspace for this engagement.";
    }
  }

  return "";
}

async function handleCreateEngagementSubmit() {
  const saveBtn = document.getElementById("engagementModalSave");
  try {
    const payload = readEngagementModalPayload();
    const validation = validateEngagementPayload(payload);
    if (validation) {
      setEngagementModalMsg(validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setEngagementModalMsg("Creating engagement...");

    const out = await createEngagementApi(payload);
    const row = out?.row || null;

    setEngagementModalMsg("Engagement created successfully.", "success");

    await refreshAssignmentsScreen();

    if (row?.id) {
      PR_SELECTED_ENGAGEMENT = row;
      renderAssignmentDetail(row);
    }

    if (!PR_ASSIGNMENTS_CACHE.length) {
      PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({});
    }

    populateTeamEngagementFilter(PR_ASSIGNMENTS_CACHE);

    closeEngagementModal();
    resetEngagementModalForm();
  } catch (err) {
    console.error(err);
    setEngagementModalMsg(err.message || "Failed to create engagement.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function bindEngagementModalEvents() {
  document.getElementById("assignmentsCreateBtn")?.addEventListener("click", async () => {
    try {
      resetEngagementModalForm();

      if (!PR_CUSTOMERS_CACHE.length) {
        PR_CUSTOMERS_CACHE = await loadCustomersData({});
      }
      populateEngagementCustomerSelect(PR_CUSTOMERS_CACHE);

      await bindEngagementAssigneeDropdowns();

      openEngagementModal();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to open engagement form.");
    }
  });

  document.getElementById("engType")?.addEventListener("change", () => {
    toggleEngagementWorkspaceSetup();
  });

  document.getElementById("engIndustry")?.addEventListener("change", (e) => {
    populateSubIndustryOptions(e.target.value);
  });
  document.getElementById("engagementModalClose")?.addEventListener("click", closeEngagementModal);
  document.getElementById("engagementModalCancel")?.addEventListener("click", closeEngagementModal);
  document.getElementById("engagementModalBackdrop")?.addEventListener("click", closeEngagementModal);
  document.getElementById("engagementModalSave")?.addEventListener("click", handleCreateEngagementSubmit);
  document.getElementById("engAddCustomerBtn")
  ?.addEventListener("click", () => {
    window.open("dashboard.html#screen=customers", "_blank");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEngagementModal();
  });
}

async function ensureEngagementModalBound() {
  if (PR_ENG_MODAL_EVENTS_BOUND) return;
  PR_ENG_MODAL_EVENTS_BOUND = true;
  await bindEngagementModalEvents();
}

function bindAssignmentsScreenEvents() {
  if (PR_ASSIGNMENTS_EVENTS_BOUND) return;
  PR_ASSIGNMENTS_EVENTS_BOUND = true;

  document.getElementById("assignmentsRefreshBtn")?.addEventListener("click", refreshAssignmentsScreen);

  document.getElementById("assignmentsSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshAssignmentsScreen();
  });

  document.getElementById("assignmentsStatusFilter")?.addEventListener("change", refreshAssignmentsScreen);
  document.getElementById("assignmentsTypeFilter")?.addEventListener("change", refreshAssignmentsScreen);

  document.getElementById("assignmentsTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-assignment-open]");
    if (!btn) return;

    const engagementId = Number(btn.getAttribute("data-assignment-open") || 0);
    if (!engagementId) return;

    try {
      const row = await loadEngagementDetail(engagementId);
      PR_SELECTED_ENGAGEMENT = row;
      renderAssignmentDetail(row);

      const teamFilter = document.getElementById("teamEngagementFilter");
      if (teamFilter) teamFilter.value = String(engagementId);
    } catch (err) {
      console.error(err);
    }
  });
}

function bindTeamScreenEvents() {
  if (PR_TEAM_EVENTS_BOUND) return;
  PR_TEAM_EVENTS_BOUND = true;

  document.getElementById("teamRefreshBtn")?.addEventListener("click", refreshTeamScreen);
  document.getElementById("teamEngagementFilter")?.addEventListener("change", refreshTeamScreen);
  document.getElementById("teamActiveFilter")?.addEventListener("change", refreshTeamScreen);
}

async function addEngagementTeamMemberApi(engagementId, payload) {
  const companyId = getActiveCompanyId();
  if (!companyId) throw new Error("No active company selected.");
  if (!engagementId) throw new Error("No engagement selected.");

  return apiFetch(
    ENDPOINTS.engagements.teamAdd(companyId, engagementId),
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

let PR_TEAM_MODAL_EVENTS_BOUND = false;

function teamMemberModalEl() {
  return document.getElementById("teamMemberModal");
}

function openTeamMemberModal() {
  teamMemberModalEl()?.classList.remove("hidden");
}

function closeTeamMemberModal() {
  teamMemberModalEl()?.classList.add("hidden");
}

function setTeamMemberModalMsg(msg, tone = "info") {
  const el = document.getElementById("teamMemberModalMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.className = "text-sm";
  if (tone === "error") el.classList.add("text-red-600");
  else if (tone === "success") el.classList.add("text-green-700");
  else el.classList.add("text-slate-500");
}

function resetTeamMemberModalForm() {
  const ids = [
    "teamMemberUserId",
    "teamMemberRole",
    "teamMemberAllocation",
    "teamMemberStartDate",
    "teamMemberEndDate",
    "teamMemberNotes"
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = "";
  });

  setTeamMemberModalMsg("");
}

function readTeamMemberModalPayload() {
  const userId = Number(document.getElementById("teamMemberUserId")?.value || 0);
  const allocationRaw = document.getElementById("teamMemberAllocation")?.value;
  const allocation = allocationRaw === "" ? null : Number(allocationRaw);

  return {
    user_id: Number.isFinite(userId) && userId > 0 ? userId : null,
    role_on_engagement: document.getElementById("teamMemberRole")?.value || "",
    allocation_percent: Number.isFinite(allocation) ? allocation : null,
    start_date: document.getElementById("teamMemberStartDate")?.value || null,
    end_date: document.getElementById("teamMemberEndDate")?.value || null,
    notes: document.getElementById("teamMemberNotes")?.value?.trim() || ""
  };
}

function validateTeamMemberPayload(payload) {
  if (!payload.user_id) return "User ID is required.";
  if (!payload.role_on_engagement) return "Role on engagement is required.";
  if (payload.allocation_percent != null && (payload.allocation_percent < 0 || payload.allocation_percent > 100)) {
    return "Allocation percent must be between 0 and 100.";
  }
  return "";
}

function getSelectedTeamEngagementId() {
  const select = document.getElementById("teamEngagementFilter");
  return Number(select?.value || 0);
}

function getSelectedEngagementRowFromCache(engagementId) {
  return PR_ASSIGNMENTS_CACHE.find(r => Number(r.id) === Number(engagementId)) || PR_SELECTED_ENGAGEMENT || null;
}

function prepareAndOpenTeamMemberModal() {
  const engagementId = getSelectedTeamEngagementId();
  if (!engagementId) {
    alert("Select an engagement first.");
    return;
  }

  resetTeamMemberModalForm();

  const row = getSelectedEngagementRowFromCache(engagementId);
  const label = document.getElementById("teamMemberEngagementLabel");
  if (label) {
    label.textContent = row
      ? `${row.engagement_name || "--"} • ${row.customer_name || "--"}`
      : `Engagement #${engagementId}`;
  }

  openTeamMemberModal();
}

async function handleAddTeamMemberSubmit() {
  const saveBtn = document.getElementById("teamMemberModalSave");
  const engagementId = getSelectedTeamEngagementId();

  try {
    if (!engagementId) {
      setTeamMemberModalMsg("Select an engagement first.", "error");
      return;
    }

    const payload = readTeamMemberModalPayload();
    const validation = validateTeamMemberPayload(payload);
    if (validation) {
      setTeamMemberModalMsg(validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setTeamMemberModalMsg("Adding team member...");

    const out = await addEngagementTeamMemberApi(engagementId, payload);
    PR_TEAM_CACHE = Array.isArray(out?.rows) ? out.rows : [];

    renderTeamTable(PR_TEAM_CACHE);

    const engagementRow = getSelectedEngagementRowFromCache(engagementId);
    renderTeamSummary(PR_TEAM_CACHE, engagementRow);

    setTeamMemberModalMsg("Team member added successfully.", "success");

    closeTeamMemberModal();
    resetTeamMemberModalForm();

    const msg = document.getElementById("teamMsg");
    if (msg) msg.textContent = `${PR_TEAM_CACHE.length} team row(s) loaded.`;
  } catch (err) {
    console.error(err);
    setTeamMemberModalMsg(err.message || "Failed to add team member.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindTeamMemberModalEvents() {
  if (PR_TEAM_MODAL_EVENTS_BOUND) return;
  PR_TEAM_MODAL_EVENTS_BOUND = true;

  document.getElementById("teamAddMemberBtn")?.addEventListener("click", prepareAndOpenTeamMemberModal);
  document.getElementById("teamMemberModalClose")?.addEventListener("click", closeTeamMemberModal);
  document.getElementById("teamMemberModalCancel")?.addEventListener("click", closeTeamMemberModal);
  document.getElementById("teamMemberModalBackdrop")?.addEventListener("click", closeTeamMemberModal);
  document.getElementById("teamMemberModalSave")?.addEventListener("click", handleAddTeamMemberSubmit);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTeamMemberModal();
  });
}

async function renderTeamScreen(me) {
  bindTeamScreenEvents();
  bindTeamMemberModalEvents();

  try {
    if (!PR_ASSIGNMENTS_CACHE.length) {
      PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({});
    }

    populateTeamEngagementFilter(PR_ASSIGNMENTS_CACHE);

    if (PR_SELECTED_ENGAGEMENT?.id) {
      const select = document.getElementById("teamEngagementFilter");
      if (select) select.value = String(PR_SELECTED_ENGAGEMENT.id);
    }

    refreshTeamScreen();
  } catch (err) {
    console.error(err);
    const msg = document.getElementById("teamMsg");
    if (msg) msg.textContent = err.message || "Failed to prepare team screen.";
  }
}

async function renderAssignmentsScreen(me) {
  bindAssignmentsScreenEvents();
  await ensureEngagementModalBound();

  const cid = getActiveCompanyId();
  if (cid && !PR_USERS_CACHE.length) {
    try {
      PR_USERS_CACHE = await loadEngagementAssignableUsers(cid);
    } catch (err) {
      console.warn("Failed to preload users cache", err);
    }
  }

  refreshAssignmentsScreen();
}

function getSelectedEngagementId() {
  const selected = Number(PR_SELECTED_ENGAGEMENT?.id || 0);
  if (selected) return selected;

  const first = Number(PR_ASSIGNMENTS_CACHE?.[0]?.id || 0);
  return first || 0;
}

function getSelectedEngagementRow() {
  const engagementId = getSelectedEngagementId();
  if (!engagementId) return null;

  return (
    PR_ASSIGNMENTS_CACHE.find(r => Number(r.id) === engagementId) ||
    PR_SELECTED_ENGAGEMENT ||
    null
  );
}

function badgeClassForWorkflowStatus(status) {
  const s = String(status || "").toLowerCase();

  if (["completed", "approved", "posted", "received", "ready"].includes(s)) return "badge-ok";
  if (["in_progress", "in review", "in_review", "pending_review", "awaiting review"].includes(s)) return "badge-brand";
  if (["pending", "outstanding", "blocked", "urgent"].includes(s)) return "badge-warn";
  if (["returned", "rejected", "cancelled"].includes(s)) return "badge-danger";
  return "badge-slate";
}

function humanizeWorkflowStatus(status) {
  return String(status || "--")
    .replace(/_/g, " ")
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function pct(numerator, denominator) {
  const d = Number(denominator || 0);
  if (!d) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(numerator || 0) / d) * 100)));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "--";
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html || "";
}

function renderSimpleEmptyRow(colspan, message) {
  return `
    <tr>
      <td colspan="${colspan}" class="text-center text-slate-500">${escapeHtml(message || "No rows found.")}</td>
    </tr>
  `;
}

function formatUserNameFromRow(row, prefix) {
  const first = String(row?.[`${prefix}_first_name`] || "").trim();
  const last = String(row?.[`${prefix}_last_name`] || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || row?.[`${prefix}_email`] || "--";
}

async function loadReportingItemsData(engagementId, { item_type = "", status = "", q = "", limit = 200, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagementOps.reportingItemsList(companyId, engagementId, {
      item_type, status, q, limit, offset
    }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

async function loadDeliverablesData(engagementId, { status = "", q = "", limit = 200, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagementOps.deliverablesList(companyId, engagementId, {
      status, q, limit, offset
    }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

async function loadPostingActivityData(engagementId, { module_name = "", status = "", q = "", limit = 200, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagementOps.postingActivityList(companyId, engagementId, {
      module_name, status, q, limit, offset
    }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

async function loadMonthlyCloseTasksData(engagementId, { close_period = "", status = "", q = "", limit = 200, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagementOps.monthlyCloseTasksList(companyId, engagementId, {
      close_period, status, q, limit, offset
    }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

async function loadYearEndTasksData(engagementId, { reporting_year_end = "", status = "", q = "", limit = 200, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagementOps.yearEndTasksList(companyId, engagementId, {
      reporting_year_end, status, q, limit, offset
    }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

async function loadSignoffStepsData(engagementId, { reporting_year_end = "", status = "", limit = 100, offset = 0 } = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId || !engagementId) throw new Error("Missing engagement context.");

  const out = await apiFetch(
    ENDPOINTS.engagementOps.signoffStepsList(companyId, engagementId, {
      reporting_year_end, status, limit, offset
    }),
    { method: "GET" }
  );

  return Array.isArray(out?.rows) ? out.rows : [];
}

function populateAnyUserSelect(selectId, users, placeholder = "Select user") {
  const el = document.getElementById(selectId);
  if (!el) return;

  const currentValue = el.value || "";
  const rows = Array.isArray(users) ? users : [];

  el.innerHTML = "";

  const firstOpt = document.createElement("option");
  firstOpt.value = "";
  firstOpt.textContent = placeholder;
  el.appendChild(firstOpt);

  rows
    .filter(user => user?.is_active !== false && user?.user_is_active !== false)
    .forEach((user) => {
      const opt = document.createElement("option");
      opt.value = String(user.user_id ?? user.id ?? "");
      opt.textContent = optionTextForUser(user);
      el.appendChild(opt);
    });

  if (currentValue && [...el.options].some(o => o.value === currentValue)) {
    el.value = currentValue;
  }
}

async function ensureUsersCacheLoaded() {
  const cid = getActiveCompanyId();
  if (!cid) return;
  if (PR_USERS_CACHE.length) return;

  PR_USERS_CACHE = await loadEngagementAssignableUsers(cid);
}

function populateAnyUserSelect(selectId, users, placeholder = "Select user") {
  const el = document.getElementById(selectId);
  if (!el) return;

  const currentValue = el.value || "";
  const rows = Array.isArray(users) ? users : [];

  el.innerHTML = "";

  const firstOpt = document.createElement("option");
  firstOpt.value = "";
  firstOpt.textContent = placeholder;
  el.appendChild(firstOpt);

  rows
    .filter(user => user?.is_active !== false && user?.user_is_active !== false)
    .forEach((user) => {
      const opt = document.createElement("option");
      opt.value = String(user.user_id ?? user.id ?? "");
      opt.textContent = optionTextForUser(user);
      el.appendChild(opt);
    });

  if (currentValue && [...el.options].some(o => o.value === currentValue)) {
    el.value = currentValue;
  }
}

async function ensureUsersCacheLoaded() {
  const cid = getActiveCompanyId();
  if (!cid) return;
  if (PR_USERS_CACHE.length) return;

  PR_USERS_CACHE = await loadEngagementAssignableUsers(cid);
}

function modalEl(id) {
  return document.getElementById(id);
}

function openModal(id) {
  modalEl(id)?.classList.remove("hidden");
}

function closeModal(id) {
  modalEl(id)?.classList.add("hidden");
}

function setModalMsg(id, msg, tone = "info") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || "";
  el.className = "text-sm";
  if (tone === "error") el.classList.add("text-red-600");
  else if (tone === "success") el.classList.add("text-green-700");
  else el.classList.add("text-slate-500");
}

function resetReportingItemModalForm() {
  [
    "reportingItemId",
    "reportingItemCode",
    "reportingItemName",
    "reportingItemDescription",
    "reportingItemOwnerUserId",
    "reportingItemReviewerUserId",
    "reportingItemDueDate",
    "reportingItemNotes",
    "reportingItemSortOrder"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const typeEl = document.getElementById("reportingItemType");
  const statusEl = document.getElementById("reportingItemStatus");
  const priorityEl = document.getElementById("reportingItemPriority");
  if (typeEl) typeEl.value = "milestone";
  if (statusEl) statusEl.value = "not_started";
  if (priorityEl) priorityEl.value = "normal";

  setText("reportingItemModalTitle", "Add reporting item");
  setModalMsg("reportingItemModalMsg", "");
}

async function openReportingItemModal() {
  const engagementId = getSelectedEngagementId();
  if (!engagementId) {
    alert("Select or open an engagement first.");
    return;
  }

  resetReportingItemModalForm();
  await ensureUsersCacheLoaded();
  populateAnyUserSelect("reportingItemOwnerUserId", PR_USERS_CACHE, "Select owner");
  populateAnyUserSelect("reportingItemReviewerUserId", PR_USERS_CACHE, "Select reviewer");
  openModal("reportingItemModal");
}

function readReportingItemModalPayload() {
  return {
    item_type: document.getElementById("reportingItemType")?.value || "milestone",
    item_code: document.getElementById("reportingItemCode")?.value?.trim() || "",
    item_name: document.getElementById("reportingItemName")?.value?.trim() || "",
    description: document.getElementById("reportingItemDescription")?.value?.trim() || "",
    owner_user_id: _parseModalInt(document.getElementById("reportingItemOwnerUserId")?.value),
    reviewer_user_id: _parseModalInt(document.getElementById("reportingItemReviewerUserId")?.value),
    due_date: document.getElementById("reportingItemDueDate")?.value || null,
    status: document.getElementById("reportingItemStatus")?.value || "not_started",
    priority: document.getElementById("reportingItemPriority")?.value || "normal",
    sort_order: _parseModalInt(document.getElementById("reportingItemSortOrder")?.value) || 0,
    notes: document.getElementById("reportingItemNotes")?.value?.trim() || ""
  };
}

function validateReportingItemPayload(payload) {
  if (!payload.item_type) return "Type is required.";
  if (!payload.item_name) return "Name is required.";
  return "";
}

async function handleReportingItemSave() {
  const companyId = getActiveCompanyId();
  const engagementId = getSelectedEngagementId();
  const saveBtn = document.getElementById("reportingItemModalSave");
  const itemId = _parseModalInt(document.getElementById("reportingItemId")?.value);

  try {
    const payload = readReportingItemModalPayload();
    const validation = validateReportingItemPayload(payload);
    if (validation) {
      setModalMsg("reportingItemModalMsg", validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setModalMsg("reportingItemModalMsg", itemId ? "Updating reporting item..." : "Creating reporting item...");

    if (itemId) {
      await apiFetch(ENDPOINTS.engagementOps.reportingItemsUpdate(companyId, itemId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch(ENDPOINTS.engagementOps.reportingItemsCreate(companyId, engagementId), {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    setModalMsg("reportingItemModalMsg", "Saved successfully.", "success");
    closeModal("reportingItemModal");
    await refreshReportingOverviewScreen();
  } catch (err) {
    console.error(err);
    setModalMsg("reportingItemModalMsg", err.message || "Failed to save reporting item.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindReportingItemModalEvents() {
  if (PR_REPORTING_MODAL_BOUND) return;
  PR_REPORTING_MODAL_BOUND = true;

  document.getElementById("reportingItemModalClose")?.addEventListener("click", () => closeModal("reportingItemModal"));
  document.getElementById("reportingItemModalCancel")?.addEventListener("click", () => closeModal("reportingItemModal"));
  document.getElementById("reportingItemModalBackdrop")?.addEventListener("click", () => closeModal("reportingItemModal"));
  document.getElementById("reportingItemModalSave")?.addEventListener("click", handleReportingItemSave);
}

function resetDeliverableModalForm() {
  [
    "deliverableId",
    "deliverableCode",
    "deliverableName",
    "deliverableRequestedFrom",
    "deliverableAssignedUserId",
    "deliverableReviewerUserId",
    "deliverableDueDate",
    "deliverableReceivedDate",
    "deliverableDocumentCount",
    "deliverableNotes"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const typeEl = document.getElementById("deliverableType");
  const statusEl = document.getElementById("deliverableStatus");
  const priorityEl = document.getElementById("deliverablePriority");
  if (typeEl) typeEl.value = "";
  if (statusEl) statusEl.value = "not_started";
  if (priorityEl) priorityEl.value = "normal";

  setText("deliverableModalTitle", "Add deliverable");
  setModalMsg("deliverableModalMsg", "");
}

async function openDeliverableModal() {
  const engagementId = getSelectedEngagementId();
  if (!engagementId) {
    alert("Select or open an engagement first.");
    return;
  }

  resetDeliverableModalForm();
  await ensureUsersCacheLoaded();
  populateAnyUserSelect("deliverableAssignedUserId", PR_USERS_CACHE, "Select assigned user");
  populateAnyUserSelect("deliverableReviewerUserId", PR_USERS_CACHE, "Select reviewer");
  openModal("deliverableModal");
}

function readDeliverableModalPayload() {
  return {
    deliverable_code: document.getElementById("deliverableCode")?.value?.trim() || "",
    deliverable_name: document.getElementById("deliverableName")?.value?.trim() || "",
    deliverable_type: document.getElementById("deliverableType")?.value || "",
    requested_from: document.getElementById("deliverableRequestedFrom")?.value?.trim() || "",
    assigned_user_id: _parseModalInt(document.getElementById("deliverableAssignedUserId")?.value),
    reviewer_user_id: _parseModalInt(document.getElementById("deliverableReviewerUserId")?.value),
    due_date: document.getElementById("deliverableDueDate")?.value || null,
    received_date: document.getElementById("deliverableReceivedDate")?.value || null,
    status: document.getElementById("deliverableStatus")?.value || "not_started",
    priority: document.getElementById("deliverablePriority")?.value || "normal",
    document_count: _parseModalInt(document.getElementById("deliverableDocumentCount")?.value) || 0,
    notes: document.getElementById("deliverableNotes")?.value?.trim() || ""
  };
}

function validateDeliverablePayload(payload) {
  if (!payload.deliverable_name) return "Deliverable name is required.";
  return "";
}

async function handleDeliverableSave() {
  const companyId = getActiveCompanyId();
  const engagementId = getSelectedEngagementId();
  const saveBtn = document.getElementById("deliverableModalSave");
  const deliverableId = _parseModalInt(document.getElementById("deliverableId")?.value);

  try {
    const payload = readDeliverableModalPayload();
    const validation = validateDeliverablePayload(payload);
    if (validation) {
      setModalMsg("deliverableModalMsg", validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setModalMsg("deliverableModalMsg", deliverableId ? "Updating deliverable..." : "Creating deliverable...");

    if (deliverableId) {
      await apiFetch(ENDPOINTS.engagementOps.deliverablesUpdate(companyId, deliverableId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch(ENDPOINTS.engagementOps.deliverablesCreate(companyId, engagementId), {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    setModalMsg("deliverableModalMsg", "Saved successfully.", "success");
    closeModal("deliverableModal");
    await refreshDeliverablesScreen();
  } catch (err) {
    console.error(err);
    setModalMsg("deliverableModalMsg", err.message || "Failed to save deliverable.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindDeliverableModalEvents() {
  if (PR_DELIVERABLE_MODAL_BOUND) return;
  PR_DELIVERABLE_MODAL_BOUND = true;

  document.getElementById("deliverableModalClose")?.addEventListener("click", () => closeModal("deliverableModal"));
  document.getElementById("deliverableModalCancel")?.addEventListener("click", () => closeModal("deliverableModal"));
  document.getElementById("deliverableModalBackdrop")?.addEventListener("click", () => closeModal("deliverableModal"));
  document.getElementById("deliverableModalSave")?.addEventListener("click", handleDeliverableSave);
}

function resetMonthlyCloseModalForm() {
  [
    "monthlyCloseTaskId",
    "monthlyClosePeriod",
    "monthlyCloseTaskCode",
    "monthlyCloseTaskName",
    "monthlyCloseTaskDescription",
    "monthlyCloseOwnerUserId",
    "monthlyCloseReviewerUserId",
    "monthlyCloseDueDate",
    "monthlyCloseNotes",
    "monthlyCloseSortOrder"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const statusEl = document.getElementById("monthlyCloseStatus");
  const priorityEl = document.getElementById("monthlyClosePriority");
  if (statusEl) statusEl.value = "not_started";
  if (priorityEl) priorityEl.value = "normal";

  setText("monthlyCloseModalTitle", "Add monthly close task");
  setModalMsg("monthlyCloseModalMsg", "");
}

async function openMonthlyCloseModal() {
  const engagementId = getSelectedEngagementId();
  if (!engagementId) {
    alert("Select or open an engagement first.");
    return;
  }

  resetMonthlyCloseModalForm();
  await ensureUsersCacheLoaded();
  populateAnyUserSelect("monthlyCloseOwnerUserId", PR_USERS_CACHE, "Select owner");
  populateAnyUserSelect("monthlyCloseReviewerUserId", PR_USERS_CACHE, "Select reviewer");
  openModal("monthlyCloseModal");
}

function readMonthlyCloseModalPayload() {
  return {
    close_period: document.getElementById("monthlyClosePeriod")?.value || null,
    task_code: document.getElementById("monthlyCloseTaskCode")?.value?.trim() || "",
    task_name: document.getElementById("monthlyCloseTaskName")?.value?.trim() || "",
    description: document.getElementById("monthlyCloseTaskDescription")?.value?.trim() || "",
    owner_user_id: _parseModalInt(document.getElementById("monthlyCloseOwnerUserId")?.value),
    reviewer_user_id: _parseModalInt(document.getElementById("monthlyCloseReviewerUserId")?.value),
    due_date: document.getElementById("monthlyCloseDueDate")?.value || null,
    status: document.getElementById("monthlyCloseStatus")?.value || "not_started",
    priority: document.getElementById("monthlyClosePriority")?.value || "normal",
    sort_order: _parseModalInt(document.getElementById("monthlyCloseSortOrder")?.value) || 0,
    notes: document.getElementById("monthlyCloseNotes")?.value?.trim() || ""
  };
}

function validateMonthlyClosePayload(payload) {
  if (!payload.close_period) return "Close period is required.";
  if (!payload.task_name) return "Task name is required.";
  return "";
}

async function handleMonthlyCloseSave() {
  const companyId = getActiveCompanyId();
  const engagementId = getSelectedEngagementId();
  const saveBtn = document.getElementById("monthlyCloseModalSave");
  const taskId = _parseModalInt(document.getElementById("monthlyCloseTaskId")?.value);

  try {
    const payload = readMonthlyCloseModalPayload();
    const validation = validateMonthlyClosePayload(payload);
    if (validation) {
      setModalMsg("monthlyCloseModalMsg", validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setModalMsg("monthlyCloseModalMsg", taskId ? "Updating monthly close task..." : "Creating monthly close task...");

    if (taskId) {
      await apiFetch(ENDPOINTS.engagementOps.monthlyCloseTasksUpdate(companyId, taskId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch(ENDPOINTS.engagementOps.monthlyCloseTasksCreate(companyId, engagementId), {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    setModalMsg("monthlyCloseModalMsg", "Saved successfully.", "success");
    closeModal("monthlyCloseModal");
    await refreshMonthlyCloseScreen();
  } catch (err) {
    console.error(err);
    setModalMsg("monthlyCloseModalMsg", err.message || "Failed to save monthly close task.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindMonthlyCloseModalEvents() {
  if (PR_MONTHLY_CLOSE_MODAL_BOUND) return;
  PR_MONTHLY_CLOSE_MODAL_BOUND = true;

  document.getElementById("monthlyCloseModalClose")?.addEventListener("click", () => closeModal("monthlyCloseModal"));
  document.getElementById("monthlyCloseModalCancel")?.addEventListener("click", () => closeModal("monthlyCloseModal"));
  document.getElementById("monthlyCloseModalBackdrop")?.addEventListener("click", () => closeModal("monthlyCloseModal"));
  document.getElementById("monthlyCloseModalSave")?.addEventListener("click", handleMonthlyCloseSave);
}

function resetYearEndTaskModalForm() {
  [
    "yearEndTaskId",
    "yearEndReportingYearEnd",
    "yearEndTaskCode",
    "yearEndTaskName",
    "yearEndTaskDescription",
    "yearEndOwnerUserId",
    "yearEndReviewerUserId",
    "yearEndDueDate",
    "yearEndNotes",
    "yearEndSortOrder"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const statusEl = document.getElementById("yearEndStatus");
  const priorityEl = document.getElementById("yearEndPriority");
  if (statusEl) statusEl.value = "not_started";
  if (priorityEl) priorityEl.value = "normal";

  setText("yearEndTaskModalTitle", "Add year-end task");
  setModalMsg("yearEndTaskModalMsg", "");
}

async function openYearEndTaskModal() {
  const engagementId = getSelectedEngagementId();
  if (!engagementId) {
    alert("Select or open an engagement first.");
    return;
  }

  resetYearEndTaskModalForm();
  await ensureUsersCacheLoaded();
  populateAnyUserSelect("yearEndOwnerUserId", PR_USERS_CACHE, "Select owner");
  populateAnyUserSelect("yearEndReviewerUserId", PR_USERS_CACHE, "Select reviewer");
  openModal("yearEndTaskModal");
}

function readYearEndTaskModalPayload() {
  return {
    reporting_year_end: document.getElementById("yearEndReportingYearEnd")?.value || null,
    task_code: document.getElementById("yearEndTaskCode")?.value?.trim() || "",
    task_name: document.getElementById("yearEndTaskName")?.value?.trim() || "",
    description: document.getElementById("yearEndTaskDescription")?.value?.trim() || "",
    owner_user_id: _parseModalInt(document.getElementById("yearEndOwnerUserId")?.value),
    reviewer_user_id: _parseModalInt(document.getElementById("yearEndReviewerUserId")?.value),
    due_date: document.getElementById("yearEndDueDate")?.value || null,
    status: document.getElementById("yearEndStatus")?.value || "not_started",
    priority: document.getElementById("yearEndPriority")?.value || "normal",
    sort_order: _parseModalInt(document.getElementById("yearEndSortOrder")?.value) || 0,
    notes: document.getElementById("yearEndNotes")?.value?.trim() || ""
  };
}

function validateYearEndTaskPayload(payload) {
  if (!payload.reporting_year_end) return "Reporting year end is required.";
  if (!payload.task_name) return "Task name is required.";
  return "";
}

async function handleYearEndTaskSave() {
  const companyId = getActiveCompanyId();
  const engagementId = getSelectedEngagementId();
  const saveBtn = document.getElementById("yearEndTaskModalSave");
  const taskId = _parseModalInt(document.getElementById("yearEndTaskId")?.value);

  try {
    const payload = readYearEndTaskModalPayload();
    const validation = validateYearEndTaskPayload(payload);
    if (validation) {
      setModalMsg("yearEndTaskModalMsg", validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setModalMsg("yearEndTaskModalMsg", taskId ? "Updating year-end task..." : "Creating year-end task...");

    if (taskId) {
      await apiFetch(ENDPOINTS.engagementOps.yearEndTasksUpdate(companyId, taskId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch(ENDPOINTS.engagementOps.yearEndTasksCreate(companyId, engagementId), {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    setModalMsg("yearEndTaskModalMsg", "Saved successfully.", "success");
    closeModal("yearEndTaskModal");
    await refreshYearEndScreen();
  } catch (err) {
    console.error(err);
    setModalMsg("yearEndTaskModalMsg", err.message || "Failed to save year-end task.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindYearEndTaskModalEvents() {
  if (PR_YEAR_END_MODAL_BOUND) return;
  PR_YEAR_END_MODAL_BOUND = true;

  document.getElementById("yearEndTaskModalClose")?.addEventListener("click", () => closeModal("yearEndTaskModal"));
  document.getElementById("yearEndTaskModalCancel")?.addEventListener("click", () => closeModal("yearEndTaskModal"));
  document.getElementById("yearEndTaskModalBackdrop")?.addEventListener("click", () => closeModal("yearEndTaskModal"));
  document.getElementById("yearEndTaskModalSave")?.addEventListener("click", handleYearEndTaskSave);
}

function resetSignoffStepModalForm() {
  [
    "signoffStepId",
    "signoffReportingYearEnd",
    "signoffStepName",
    "signoffAssignedUserId",
    "signoffDueDate",
    "signoffNotes",
    "signoffSortOrder"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const codeEl = document.getElementById("signoffStepCode");
  const statusEl = document.getElementById("signoffStatus");
  const requiredEl = document.getElementById("signoffIsRequired");
  if (codeEl) codeEl.value = "manager_review";
  if (statusEl) statusEl.value = "not_started";
  if (requiredEl) requiredEl.value = "true";

  setText("signoffStepModalTitle", "Add sign-off step");
  setModalMsg("signoffStepModalMsg", "");
}

async function openSignoffStepModal() {
  const engagementId = getSelectedEngagementId();
  if (!engagementId) {
    alert("Select or open an engagement first.");
    return;
  }

  resetSignoffStepModalForm();
  await ensureUsersCacheLoaded();
  populateAnyUserSelect("signoffAssignedUserId", PR_USERS_CACHE, "Select assigned user");
  openModal("signoffStepModal");
}

function readSignoffStepModalPayload() {
  return {
    reporting_year_end: document.getElementById("signoffReportingYearEnd")?.value || null,
    step_code: document.getElementById("signoffStepCode")?.value || "manager_review",
    step_name: document.getElementById("signoffStepName")?.value?.trim() || "",
    assigned_user_id: _parseModalInt(document.getElementById("signoffAssignedUserId")?.value),
    due_date: document.getElementById("signoffDueDate")?.value || null,
    status: document.getElementById("signoffStatus")?.value || "not_started",
    sort_order: _parseModalInt(document.getElementById("signoffSortOrder")?.value) || 0,
    is_required: String(document.getElementById("signoffIsRequired")?.value || "true") === "true",
    notes: document.getElementById("signoffNotes")?.value?.trim() || ""
  };
}

function validateSignoffStepPayload(payload) {
  if (!payload.reporting_year_end) return "Reporting year end is required.";
  if (!payload.step_code) return "Step code is required.";
  if (!payload.step_name) return "Step name is required.";
  return "";
}

async function handleSignoffStepSave() {
  const companyId = getActiveCompanyId();
  const engagementId = getSelectedEngagementId();
  const saveBtn = document.getElementById("signoffStepModalSave");
  const stepId = _parseModalInt(document.getElementById("signoffStepId")?.value);

  try {
    const payload = readSignoffStepModalPayload();
    const validation = validateSignoffStepPayload(payload);
    if (validation) {
      setModalMsg("signoffStepModalMsg", validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setModalMsg("signoffStepModalMsg", stepId ? "Updating sign-off step..." : "Creating sign-off step...");

    if (stepId) {
      await apiFetch(ENDPOINTS.engagementOps.signoffStepsUpdate(companyId, stepId), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await apiFetch(ENDPOINTS.engagementOps.signoffStepsCreate(companyId, engagementId), {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    setModalMsg("signoffStepModalMsg", "Saved successfully.", "success");
    closeModal("signoffStepModal");
    await refreshYearEndScreen();
  } catch (err) {
    console.error(err);
    setModalMsg("signoffStepModalMsg", err.message || "Failed to save sign-off step.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindSignoffStepModalEvents() {
  if (PR_SIGNOFF_MODAL_BOUND) return;
  PR_SIGNOFF_MODAL_BOUND = true;

  document.getElementById("signoffStepModalClose")?.addEventListener("click", () => closeModal("signoffStepModal"));
  document.getElementById("signoffStepModalCancel")?.addEventListener("click", () => closeModal("signoffStepModal"));
  document.getElementById("signoffStepModalBackdrop")?.addEventListener("click", () => closeModal("signoffStepModal"));
  document.getElementById("signoffStepModalSave")?.addEventListener("click", handleSignoffStepSave);
}


function renderReportingOverviewHeader(engagementRow, items = []) {
  setText("reportingOverviewCycleBadge", humanizeWorkflowStatus(engagementRow?.reporting_cycle || "--"));
  setText("reportingOverviewStatusBadge", humanizeWorkflowStatus(engagementRow?.status || "--"));

  setText("reportingOverviewEngagementName", engagementRow?.engagement_name || "--");
  setText("reportingOverviewClientName", engagementRow?.customer_name || engagementRow?.company_name || "--");
  setText("reportingOverviewCycleText", humanizeWorkflowStatus(engagementRow?.reporting_cycle || "--"));
  setText("reportingOverviewYearEndText", engagementRow?.fiscal_year_end ? `Financial year ending ${fmtDate(engagementRow.fiscal_year_end)}` : "--");
  setText("reportingOverviewDueDate", fmtDate(engagementRow?.due_date));

  const total = items.length;
  const done = items.filter(x => ["completed", "approved", "ready"].includes(String(x.status || "").toLowerCase())).length;
  const readiness = pct(done, total);

  setText("reportingOverviewReadinessValue", `${readiness}%`);
  const bar = document.getElementById("reportingOverviewReadinessBar");
  if (bar) bar.style.width = `${readiness}%`;
  setText("reportingOverviewReadinessText", total ? `${done} of ${total} reporting items ready/completed` : "No reporting items yet");
}

function renderReportingMilestonesTable(rows) {
  const tbody = document.getElementById("reportingOverviewMilestonesBody");
  if (!tbody) return;

  const milestones = rows.filter(r => String(r.item_type || "").toLowerCase() === "milestone");
  if (!milestones.length) {
    tbody.innerHTML = renderSimpleEmptyRow(5, "No reporting milestones found.");
    return;
  }

  tbody.innerHTML = milestones.map(row => `
    <tr>
      <td>${escapeHtml(row.item_name || "--")}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "owner"))}</td>
      <td>${escapeHtml(fmtDate(row.due_date))}</td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span></td>
      <td>
        <button
          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          data-reporting-item-edit="${escapeHtml(row.id)}"
        >
          Edit
        </button>
      </td>
    </tr>
  `).join("");
}

function renderReportingComponentsTable(rows) {
  const tbody = document.getElementById("reportingOverviewComponentsBody");
  if (!tbody) return;

  const components = rows.filter(r => String(r.item_type || "").toLowerCase() === "component");
  if (!components.length) {
    tbody.innerHTML = renderSimpleEmptyRow(5, "No reporting components found.");
    return;
  }

  tbody.innerHTML = components.map(row => `
    <tr>
      <td>${escapeHtml(row.item_name || "--")}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "owner"))}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "reviewer"))}</td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span></td>
      <td>
        <button
          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          data-reporting-item-edit="${escapeHtml(row.id)}"
        >
          Edit
        </button>
      </td>
    </tr>
  `).join("");
}

function renderDeliverablesSummary(rows) {
  const today = new Date();
  const overdue = rows.filter(r => r.due_date && new Date(r.due_date) < today && !["completed", "received", "waived"].includes(String(r.status || "").toLowerCase())).length;
  const outstanding = rows.filter(r => ["not_started", "requested", "outstanding"].includes(String(r.status || "").toLowerCase())).length;
  const inReview = rows.filter(r => String(r.status || "").toLowerCase() === "in_review").length;
  const awaitingClient = rows.filter(r => {
    const requestedFrom = String(r.requested_from || "").toLowerCase();
    return requestedFrom.includes("client");
  }).length;

  setText("deliverablesOutstandingCount", String(outstanding));
  setText("deliverablesOverdueCount", String(overdue));
  setText("deliverablesAwaitingClientCount", String(awaitingClient));
  setText("deliverablesInReviewCount", String(inReview));
}

function renderDeliverablesTable(rows) {
  const tbody = document.getElementById("deliverablesTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = renderSimpleEmptyRow(7, "No deliverables found.");
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.deliverable_name || "--")}</td>
      <td>${escapeHtml(row.requested_from || "--")}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "assigned"))}</td>
      <td>${escapeHtml(fmtDate(row.due_date))}</td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span></td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.priority)}">${escapeHtml(humanizeWorkflowStatus(row.priority))}</span></td>
      <td>
        <button
          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          data-deliverable-edit="${escapeHtml(row.id)}"
        >
          Edit
        </button>
      </td>
    </tr>
  `).join("");
}

function renderPostingActivitySummary(rows) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const unposted = rows.filter(r => ["draft", "approved"].includes(String(r.status || "").toLowerCase())).length;
  const underReview = rows.filter(r => ["pending_review", "in_review"].includes(String(r.status || "").toLowerCase())).length;
  const returned = rows.filter(r => ["returned", "rejected"].includes(String(r.status || "").toLowerCase())).length;
  const postedToday = rows.filter(r => String(r.status || "").toLowerCase() === "posted" && String(r.posting_date || "").slice(0, 10) === todayStr).length;

  setText("postingUnpostedCount", String(unposted));
  setText("postingUnderReviewCount", String(underReview));
  setText("postingReturnedCount", String(returned));
  setText("postingPostedTodayCount", String(postedToday));
}

function renderPostingActivityTable(rows) {
  const tbody = document.getElementById("postingActivityTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = renderSimpleEmptyRow(7, "No posting activity found.");
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(fmtDate(row.posting_date))}</td>
      <td>${escapeHtml(humanizeWorkflowStatus(row.module_name))}</td>
      <td>${escapeHtml(row.reference_no || "--")}</td>
      <td>${escapeHtml(row.description || "--")}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "prepared"))}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "reviewer"))}</td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span></td>
    </tr>
  `).join("");
}

function renderMonthlyCloseSummary(rows) {
  const total = rows.length;
  const done = rows.filter(r => String(r.status || "").toLowerCase() === "completed").length;
  const review = rows.filter(r => String(r.status || "").toLowerCase() === "in_review").length;
  const open = rows.filter(r => !["completed", "skipped"].includes(String(r.status || "").toLowerCase())).length;

  const today = new Date();
  const overdue = rows.filter(r => r.due_date && new Date(r.due_date) < today && String(r.status || "").toLowerCase() !== "completed").length;
  const progress = pct(done, total);

  setText("monthlyCloseProgressValue", `${progress}%`);
  const bar = document.getElementById("monthlyCloseProgressBar");
  if (bar) bar.style.width = `${progress}%`;

  setText("monthlyCloseOpenCount", String(open));
  setText("monthlyCloseReviewCount", String(review));
  setText("monthlyCloseOverdueCount", String(overdue));

  const firstPeriod = rows[0]?.close_period;
  setText("monthlyClosePeriodBadge", firstPeriod ? `${fmtDate(firstPeriod)} Close` : "Current Close");
}

function renderMonthlyCloseTable(rows) {
  const tbody = document.getElementById("monthlyCloseTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = renderSimpleEmptyRow(7, "No monthly close tasks found.");
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.task_name || "--")}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "owner"))}</td>
      <td>${escapeHtml(fmtDate(row.due_date))}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "reviewer"))}</td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span></td>
      <td>${escapeHtml(row.notes || "--")}</td>
      <td>
        <button
          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          data-monthly-close-edit="${escapeHtml(row.id)}"
        >
          Edit
        </button>
      </td>
    </tr>
  `).join("");
}

function renderYearEndSummary(taskRows, signoffRows, engagementRow) {
  const total = taskRows.length;
  const done = taskRows.filter(r => String(r.status || "").toLowerCase() === "completed").length;
  const progress = pct(done, total);
  const openReviewPoints = taskRows.filter(r => ["in_review", "blocked"].includes(String(r.status || "").toLowerCase())).length;

  setText("yearEndProgressValue", `${progress}%`);
  const bar = document.getElementById("yearEndProgressBar");
  if (bar) bar.style.width = `${progress}%`;

  setText("yearEndOpenReviewPoints", String(openReviewPoints));

  const firstIncompleteSignoff = signoffRows.find(r => String(r.status || "").toLowerCase() !== "completed");
  setText("yearEndApprovalStage", firstIncompleteSignoff ? firstIncompleteSignoff.step_name || "--" : "Completed");
  setText("yearEndExpectedSignoff", fmtDate(engagementRow?.due_date));

  const stageBadge = document.getElementById("yearEndStageBadge");
  if (stageBadge) stageBadge.textContent = firstIncompleteSignoff ? humanizeWorkflowStatus(firstIncompleteSignoff.status) : "Completed";
}

function renderYearEndTable(rows) {
  const tbody = document.getElementById("yearEndTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = renderSimpleEmptyRow(6, "No year-end tasks found.");
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.task_name || "--")}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "owner"))}</td>
      <td>${escapeHtml(fmtDate(row.due_date))}</td>
      <td>${escapeHtml(formatUserNameFromRow(row, "reviewer"))}</td>
      <td><span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span></td>
      <td>
        <button
          class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          data-year-end-edit="${escapeHtml(row.id)}"
        >
          Edit
        </button>
      </td>
    </tr>
  `).join("");
}

async function editReportingItem(itemId) {
  const companyId = getActiveCompanyId();
  if (!companyId || !itemId) return;

  try {
    await ensureUsersCacheLoaded();
    populateAnyUserSelect("reportingItemOwnerUserId", PR_USERS_CACHE, "Select owner");
    populateAnyUserSelect("reportingItemReviewerUserId", PR_USERS_CACHE, "Select reviewer");

    const out = await apiFetch(
      ENDPOINTS.engagementOps.reportingItemsGet(companyId, itemId),
      { method: "GET" }
    );

    const row = out?.row;
    if (!row) throw new Error("Reporting item not found.");

    document.getElementById("reportingItemId").value = row.id || "";
    document.getElementById("reportingItemType").value = row.item_type || "milestone";
    document.getElementById("reportingItemCode").value = row.item_code || "";
    document.getElementById("reportingItemName").value = row.item_name || "";
    document.getElementById("reportingItemDescription").value = row.description || "";
    document.getElementById("reportingItemOwnerUserId").value = row.owner_user_id || "";
    document.getElementById("reportingItemReviewerUserId").value = row.reviewer_user_id || "";
    document.getElementById("reportingItemDueDate").value = row.due_date || "";
    document.getElementById("reportingItemStatus").value = row.status || "not_started";
    document.getElementById("reportingItemPriority").value = row.priority || "normal";
    document.getElementById("reportingItemSortOrder").value = row.sort_order ?? 0;
    document.getElementById("reportingItemNotes").value = row.notes || "";

    setText("reportingItemModalTitle", "Edit reporting item");
    setModalMsg("reportingItemModalMsg", "");
    openModal("reportingItemModal");
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to load reporting item.");
  }
}

async function editDeliverable(deliverableId) {
  const companyId = getActiveCompanyId();
  if (!companyId || !deliverableId) return;

  try {
    await ensureUsersCacheLoaded();
    populateAnyUserSelect("deliverableAssignedUserId", PR_USERS_CACHE, "Select assigned user");
    populateAnyUserSelect("deliverableReviewerUserId", PR_USERS_CACHE, "Select reviewer");

    const out = await apiFetch(
      ENDPOINTS.engagementOps.deliverablesGet(companyId, deliverableId),
      { method: "GET" }
    );

    const row = out?.row;
    if (!row) throw new Error("Deliverable not found.");

    document.getElementById("deliverableId").value = row.id || "";
    document.getElementById("deliverableCode").value = row.deliverable_code || "";
    document.getElementById("deliverableType").value = row.deliverable_type || "";
    document.getElementById("deliverableName").value = row.deliverable_name || "";
    document.getElementById("deliverableRequestedFrom").value = row.requested_from || "";
    document.getElementById("deliverableAssignedUserId").value = row.assigned_user_id || "";
    document.getElementById("deliverableReviewerUserId").value = row.reviewer_user_id || "";
    document.getElementById("deliverableDueDate").value = row.due_date || "";
    document.getElementById("deliverableReceivedDate").value = row.received_date || "";
    document.getElementById("deliverableStatus").value = row.status || "not_started";
    document.getElementById("deliverablePriority").value = row.priority || "normal";
    document.getElementById("deliverableDocumentCount").value = row.document_count ?? 0;
    document.getElementById("deliverableNotes").value = row.notes || "";

    setText("deliverableModalTitle", "Edit deliverable");
    setModalMsg("deliverableModalMsg", "");
    openModal("deliverableModal");
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to load deliverable.");
  }
}

async function editMonthlyCloseTask(taskId) {
  const companyId = getActiveCompanyId();
  if (!companyId || !taskId) return;

  try {
    await ensureUsersCacheLoaded();
    populateAnyUserSelect("monthlyCloseOwnerUserId", PR_USERS_CACHE, "Select owner");
    populateAnyUserSelect("monthlyCloseReviewerUserId", PR_USERS_CACHE, "Select reviewer");

    const out = await apiFetch(
      ENDPOINTS.engagementOps.monthlyCloseTasksGet(companyId, taskId),
      { method: "GET" }
    );

    const row = out?.row;
    if (!row) throw new Error("Monthly close task not found.");

    document.getElementById("monthlyCloseTaskId").value = row.id || "";
    document.getElementById("monthlyClosePeriod").value = row.close_period || "";
    document.getElementById("monthlyCloseTaskCode").value = row.task_code || "";
    document.getElementById("monthlyCloseTaskName").value = row.task_name || "";
    document.getElementById("monthlyCloseTaskDescription").value = row.description || "";
    document.getElementById("monthlyCloseOwnerUserId").value = row.owner_user_id || "";
    document.getElementById("monthlyCloseReviewerUserId").value = row.reviewer_user_id || "";
    document.getElementById("monthlyCloseDueDate").value = row.due_date || "";
    document.getElementById("monthlyCloseStatus").value = row.status || "not_started";
    document.getElementById("monthlyClosePriority").value = row.priority || "normal";
    document.getElementById("monthlyCloseSortOrder").value = row.sort_order ?? 0;
    document.getElementById("monthlyCloseNotes").value = row.notes || "";

    setText("monthlyCloseModalTitle", "Edit monthly close task");
    setModalMsg("monthlyCloseModalMsg", "");
    openModal("monthlyCloseModal");
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to load monthly close task.");
  }
}

async function editYearEndTask(taskId) {
  const companyId = getActiveCompanyId();
  if (!companyId || !taskId) return;

  try {
    await ensureUsersCacheLoaded();
    populateAnyUserSelect("yearEndOwnerUserId", PR_USERS_CACHE, "Select owner");
    populateAnyUserSelect("yearEndReviewerUserId", PR_USERS_CACHE, "Select reviewer");

    const out = await apiFetch(
      ENDPOINTS.engagementOps.yearEndTasksGet(companyId, taskId),
      { method: "GET" }
    );

    const row = out?.row;
    if (!row) throw new Error("Year-end task not found.");

    document.getElementById("yearEndTaskId").value = row.id || "";
    document.getElementById("yearEndReportingYearEnd").value = row.reporting_year_end || "";
    document.getElementById("yearEndTaskCode").value = row.task_code || "";
    document.getElementById("yearEndTaskName").value = row.task_name || "";
    document.getElementById("yearEndTaskDescription").value = row.description || "";
    document.getElementById("yearEndOwnerUserId").value = row.owner_user_id || "";
    document.getElementById("yearEndReviewerUserId").value = row.reviewer_user_id || "";
    document.getElementById("yearEndDueDate").value = row.due_date || "";
    document.getElementById("yearEndStatus").value = row.status || "not_started";
    document.getElementById("yearEndPriority").value = row.priority || "normal";
    document.getElementById("yearEndSortOrder").value = row.sort_order ?? 0;
    document.getElementById("yearEndNotes").value = row.notes || "";

    setText("yearEndTaskModalTitle", "Edit year-end task");
    setModalMsg("yearEndTaskModalMsg", "");
    openModal("yearEndTaskModal");
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to load year-end task.");
  }
}

async function editSignoffStep(stepId) {
  const companyId = getActiveCompanyId();
  if (!companyId || !stepId) return;

  try {
    await ensureUsersCacheLoaded();
    populateAnyUserSelect("signoffAssignedUserId", PR_USERS_CACHE, "Select assigned user");

    const out = await apiFetch(
      ENDPOINTS.engagementOps.signoffStepsGet(companyId, stepId),
      { method: "GET" }
    );

    const row = out?.row;
    if (!row) throw new Error("Sign-off step not found.");

    document.getElementById("signoffStepId").value = row.id || "";
    document.getElementById("signoffReportingYearEnd").value = row.reporting_year_end || "";
    document.getElementById("signoffStepCode").value = row.step_code || "manager_review";
    document.getElementById("signoffStepName").value = row.step_name || "";
    document.getElementById("signoffAssignedUserId").value = row.assigned_user_id || "";
    document.getElementById("signoffDueDate").value = row.due_date || "";
    document.getElementById("signoffStatus").value = row.status || "not_started";
    document.getElementById("signoffSortOrder").value = row.sort_order ?? 0;
    document.getElementById("signoffIsRequired").value = row.is_required ? "true" : "false";
    document.getElementById("signoffNotes").value = row.notes || "";

    setText("signoffStepModalTitle", "Edit sign-off step");
    setModalMsg("signoffStepModalMsg", "");
    openModal("signoffStepModal");
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to load sign-off step.");
  }
}

function renderSignoffSteps(rows) {
  const wrap = document.getElementById("yearEndSignoffWrap");
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `<div class="card-soft p-4 text-sm text-slate-500">No sign-off steps found.</div>`;
    return;
  }

  wrap.innerHTML = rows.map(row => `
    <div class="card-soft p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-semibold text-slate-900">${escapeHtml(row.step_name || "--")}</div>
          <div class="text-sm text-slate-600">${escapeHtml(formatUserNameFromRow(row, "assigned"))}</div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge ${badgeClassForWorkflowStatus(row.status)}">${escapeHtml(humanizeWorkflowStatus(row.status))}</span>
          <button
            class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            data-signoff-step-edit="${escapeHtml(row.id)}"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

async function refreshReportingOverviewScreen() {
  const msg = document.getElementById("reportingOverviewMsg");
  const engagementRow = getSelectedEngagementRow();
  const engagementId = getSelectedEngagementId();

  if (!engagementId || !engagementRow) {
    if (msg) msg.textContent = "Select or open an engagement first.";
    renderReportingOverviewHeader(null, []);
    renderReportingMilestonesTable([]);
    renderReportingComponentsTable([]);
    return;
  }

  try {
    if (msg) msg.textContent = "Loading reporting overview...";
    const rows = await loadReportingItemsData(engagementId);
    PR_REPORTING_ITEMS_CACHE = rows;

    renderReportingOverviewHeader(engagementRow, rows);
    renderReportingMilestonesTable(rows);
    renderReportingComponentsTable(rows);

    if (msg) msg.textContent = `${rows.length} reporting item(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load reporting overview.";
    renderReportingMilestonesTable([]);
    renderReportingComponentsTable([]);
  }
}

async function refreshDeliverablesScreen() {
  const msg = document.getElementById("deliverablesMsg");
  const engagementId = getSelectedEngagementId();
  const q = document.getElementById("deliverablesSearch")?.value?.trim() || "";

  if (!engagementId) {
    if (msg) msg.textContent = "Select or open an engagement first.";
    renderDeliverablesSummary([]);
    renderDeliverablesTable([]);
    return;
  }

  try {
    if (msg) msg.textContent = "Loading deliverables...";
    const rows = await loadDeliverablesData(engagementId, { q });
    PR_DELIVERABLES_CACHE = rows;
    renderDeliverablesSummary(rows);
    renderDeliverablesTable(rows);
    if (msg) msg.textContent = `${rows.length} deliverable(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load deliverables.";
    renderDeliverablesSummary([]);
    renderDeliverablesTable([]);
  }
}

async function refreshPostingActivityScreen() {
  const msg = document.getElementById("postingActivityMsg");
  const engagementId = getSelectedEngagementId();
  const q = document.getElementById("postingActivitySearch")?.value?.trim() || "";

  if (!engagementId) {
    if (msg) msg.textContent = "Select or open an engagement first.";
    renderPostingActivitySummary([]);
    renderPostingActivityTable([]);
    return;
  }

  try {
    if (msg) msg.textContent = "Loading posting activity...";
    const rows = await loadPostingActivityData(engagementId, { q });
    PR_POSTING_ACTIVITY_CACHE = rows;
    renderPostingActivitySummary(rows);
    renderPostingActivityTable(rows);
    if (msg) msg.textContent = `${rows.length} posting activity row(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load posting activity.";
    renderPostingActivitySummary([]);
    renderPostingActivityTable([]);
  }
}

async function refreshMonthlyCloseScreen() {
  const msg = document.getElementById("monthlyCloseMsg");
  const engagementId = getSelectedEngagementId();

  if (!engagementId) {
    if (msg) msg.textContent = "Select or open an engagement first.";
    renderMonthlyCloseSummary([]);
    renderMonthlyCloseTable([]);
    return;
  }

  try {
    if (msg) msg.textContent = "Loading monthly close tasks...";
    const rows = await loadMonthlyCloseTasksData(engagementId);
    PR_MONTHLY_CLOSE_CACHE = rows;
    renderMonthlyCloseSummary(rows);
    renderMonthlyCloseTable(rows);
    if (msg) msg.textContent = `${rows.length} monthly close task(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load monthly close tasks.";
    renderMonthlyCloseSummary([]);
    renderMonthlyCloseTable([]);
  }
}

async function refreshYearEndScreen() {
  const msg = document.getElementById("yearEndMsg");
  const engagementId = getSelectedEngagementId();
  const engagementRow = getSelectedEngagementRow();

  if (!engagementId || !engagementRow) {
    if (msg) msg.textContent = "Select or open an engagement first.";
    renderYearEndSummary([], [], null);
    renderYearEndTable([]);
    renderSignoffSteps([]);
    return;
  }

  try {
    if (msg) msg.textContent = "Loading year-end reporting...";
    const [taskRows, signoffRows] = await Promise.all([
      loadYearEndTasksData(engagementId),
      loadSignoffStepsData(engagementId)
    ]);

    PR_YEAR_END_CACHE = taskRows;
    PR_SIGNOFF_CACHE = signoffRows;

    renderYearEndSummary(taskRows, signoffRows, engagementRow);
    renderYearEndTable(taskRows);
    renderSignoffSteps(signoffRows);

    if (msg) msg.textContent = `${taskRows.length} year-end task(s) loaded.`;
  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = err.message || "Failed to load year-end reporting.";
    renderYearEndSummary([], [], engagementRow);
    renderYearEndTable([]);
    renderSignoffSteps([]);
  }
}

function bindReportingOverviewEvents() {
  if (PR_REPORTING_EVENTS_BOUND) return;
  PR_REPORTING_EVENTS_BOUND = true;

  document.getElementById("reportingOverviewRefreshBtn")?.addEventListener("click", refreshReportingOverviewScreen);
  document.getElementById("reportingComponentsRefreshBtn")?.addEventListener("click", refreshReportingOverviewScreen);

  document.getElementById("reportingOverviewMilestonesBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-reporting-item-edit]");
    if (!btn) return;
    const itemId = Number(btn.getAttribute("data-reporting-item-edit") || 0);
    if (!itemId) return;
    await editReportingItem(itemId);
  });

  document.getElementById("reportingOverviewComponentsBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-reporting-item-edit]");
    if (!btn) return;
    const itemId = Number(btn.getAttribute("data-reporting-item-edit") || 0);
    if (!itemId) return;
    await editReportingItem(itemId);
  });
}

function bindDeliverablesEvents() {
  if (PR_DELIVERABLES_EVENTS_BOUND) return;
  PR_DELIVERABLES_EVENTS_BOUND = true;

  document.getElementById("deliverablesRefreshBtn")?.addEventListener("click", refreshDeliverablesScreen);
  document.getElementById("deliverablesAddBtn")?.addEventListener("click", openDeliverableModal);

  document.getElementById("deliverablesSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshDeliverablesScreen();
  });

  document.getElementById("deliverablesTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-deliverable-edit]");
    if (!btn) return;
    const deliverableId = Number(btn.getAttribute("data-deliverable-edit") || 0);
    if (!deliverableId) return;
    await editDeliverable(deliverableId);
  });
}

function bindPostingActivityEvents() {
  if (PR_POSTING_EVENTS_BOUND) return;
  PR_POSTING_EVENTS_BOUND = true;

  document.getElementById("postingActivityRefreshBtn")?.addEventListener("click", refreshPostingActivityScreen);
  document.getElementById("postingActivitySearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshPostingActivityScreen();
  });
}

function bindMonthlyCloseEvents() {
  if (PR_MONTHLY_CLOSE_EVENTS_BOUND) return;
  PR_MONTHLY_CLOSE_EVENTS_BOUND = true;

  document.getElementById("monthlyCloseRefreshBtn")?.addEventListener("click", refreshMonthlyCloseScreen);
  document.getElementById("monthlyCloseAddBtn")?.addEventListener("click", openMonthlyCloseModal);

  document.getElementById("monthlyCloseTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-monthly-close-edit]");
    if (!btn) return;
    const taskId = Number(btn.getAttribute("data-monthly-close-edit") || 0);
    if (!taskId) return;
    await editMonthlyCloseTask(taskId);
  });
}

function bindYearEndEvents() {
  if (PR_YEAR_END_EVENTS_BOUND) return;
  PR_YEAR_END_EVENTS_BOUND = true;

  document.getElementById("yearEndRefreshBtn")?.addEventListener("click", refreshYearEndScreen);
  document.getElementById("yearEndAddTaskBtn")?.addEventListener("click", openYearEndTaskModal);
  document.getElementById("signoffAddBtn")?.addEventListener("click", openSignoffStepModal);
  document.getElementById("yearEndTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-year-end-edit]");
    if (!btn) return;
    const taskId = Number(btn.getAttribute("data-year-end-edit") || 0);
    if (!taskId) return;
    await editYearEndTask(taskId);
  });

  document.getElementById("yearEndSignoffWrap")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-signoff-step-edit]");
    if (!btn) return;
    const stepId = Number(btn.getAttribute("data-signoff-step-edit") || 0);
    if (!stepId) return;
    await editSignoffStep(stepId);
  });
}

async function renderReportingOverviewScreen(me) {
  bindReportingOverviewEvents();
  bindReportingItemModalEvents();

  if (!PR_ASSIGNMENTS_CACHE.length) {
    try {
      PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({});
    } catch (_) {}
  }

  const ctx = PR_SCREEN_CONTEXT || {};
  if (ctx.customerId) {
    const customerSelect = document.getElementById("reportingCustomerSelect");
    if (customerSelect) {
      customerSelect.value = String(ctx.customerId);
    }
  }

  if (ctx.filters?.status) {
    const statusSelect = document.getElementById("reportingStatusFilter");
    if (statusSelect) {
      statusSelect.value = String(ctx.filters.status);
    }
  }

  await refreshReportingOverviewScreen();
}


async function renderPendingDeliverablesScreen(me) {
  bindDeliverablesEvents();
  bindDeliverableModalEvents();

  if (!PR_ASSIGNMENTS_CACHE.length) {
    try { PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({}); } catch (_) {}
  }

  await refreshDeliverablesScreen();
}

async function renderDayToDayPostingsScreen(me) {
  bindPostingActivityEvents();

  if (!PR_ASSIGNMENTS_CACHE.length) {
    try { PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({}); } catch (_) {}
  }

  await refreshPostingActivityScreen();
}

async function renderMonthlyCloseRoutinesScreen(me) {
  bindMonthlyCloseEvents();
  bindMonthlyCloseModalEvents();

  if (!PR_ASSIGNMENTS_CACHE.length) {
    try { PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({}); } catch (_) {}
  }

  await refreshMonthlyCloseScreen();
}

async function renderYearEndReportingScreen(me) {
  bindYearEndEvents();
  bindYearEndTaskModalEvents();
  bindSignoffStepModalEvents();

  if (!PR_ASSIGNMENTS_CACHE.length) {
    try { PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({}); } catch (_) {}
  }

  await refreshYearEndScreen();
}

async function loadPractitionerAnalyticsOverview(me, { force = false } = {}) {
  const companyId = getActiveCompanyId(me);
  if (!companyId) throw new Error("No active company selected.");

  if (!force && PR_ANALYTICS_OVERVIEW_CACHE) {
    renderPractitionerAnalyticsOverview(PR_ANALYTICS_OVERVIEW_CACHE);
    return PR_ANALYTICS_OVERVIEW_CACHE;
  }

  const [overviewRes, profitabilityRes, trendsRes, riskRes] = await Promise.all([
    apiFetch(ENDPOINTS.analytics.overview(companyId)),
    apiFetch(ENDPOINTS.analytics.engagementProfitability(companyId)),
    apiFetch(ENDPOINTS.analytics.clientServiceTrends(companyId)),
    apiFetch(ENDPOINTS.analytics.riskAlerts(companyId))
  ]);

  PR_ANALYTICS_OVERVIEW_CACHE = {
    overview: overviewRes?.row || {},
    profitability: profitabilityRes?.row || {},
    trends: trendsRes?.row || {},
    risk: riskRes?.row || {}
  };

  renderPractitionerAnalyticsOverview(PR_ANALYTICS_OVERVIEW_CACHE);
  return PR_ANALYTICS_OVERVIEW_CACHE;
}

function renderPractitionerAnalyticsOverview(data) {
  const overview = data?.overview || {};
  const profitability = data?.profitability || {};
  const trends = data?.trends || {};
  const risk = data?.risk || {};

  setText("analyticsOverviewActiveEngagements", overview.active_engagements);
  setText("analyticsOverviewDueThisMonth", overview.due_this_month);
  setText("analyticsOverviewAtRiskItems", overview.at_risk_items);
  setText("analyticsOverviewCompletionRate", overview.completion_rate != null ? `${overview.completion_rate}%` : "--%");

  setText("analyticsProfitHealthy", profitability.healthy_count);
  setText("analyticsProfitAttention", (Number(profitability.watchlist_count || 0) + Number(profitability.critical_count || 0)));
  setText("analyticsProfitCycleLoad", profitability.portfolio_total);
  setText("analyticsProfitPriorityMix", profitability.watchlist_count != null && profitability.critical_count != null
    ? `${profitability.watchlist_count}/${profitability.critical_count}`
    : "--");

  setText("analyticsClientsServed", trends.clients_served);
  setText("analyticsServiceLines", trends.active_service_lines);
  setText("analyticsRecurringEngagements", trends.recurring_engagements);
  setText("analyticsUpcomingDueDates", trends.upcoming_due_dates);

  setText("analyticsRiskOverdue", risk.overdue_engagements);
  setText("analyticsRiskBlocked", risk.blocked_items);
  setText("analyticsRiskOutstanding", risk.outstanding_deliverables);
  setText("analyticsRiskPendingSignoffs", risk.pending_signoffs);
}

function bindPractitionerAnalyticsOverviewEvents(me) {
  if (PR_ANALYTICS_EVENTS_BOUND) return;
  PR_ANALYTICS_EVENTS_BOUND = true;

  document.getElementById("analyticsOpenEngagementProfitability")?.addEventListener("click", async () => {
    await openPractitionerAnalyticsDetail("engagement-profitability", me);
  });

  document.getElementById("analyticsOpenClientServiceTrends")?.addEventListener("click", async () => {
    await openPractitionerAnalyticsDetail("client-service-trends", me);
  });

  document.getElementById("analyticsOpenRiskAlerts")?.addEventListener("click", async () => {
    await openPractitionerAnalyticsDetail("risk-alerts", me);
  });
}

async function openPractitionerAnalyticsDetail(moduleName, me, { force = false } = {}) {
  PR_ANALYTICS_SELECTED_MODULE = moduleName;
  PR_ANALYTICS_FORCE_RELOAD = force === true;

  await switchPractitionerScreen(PR_NAV.analyticsDetail, me);
}

async function showPractitionerAnalyticsOverviewScreen(me) {
  await switchPractitionerScreen(PR_NAV.analytics, me);
}

function showPractitionerAnalyticsOverviewScreen() {
  document.getElementById("screen-analytics-detail")?.classList.add("hidden");
  document.getElementById("screen-analytics-detail")?.classList.remove("active");

  document.getElementById("screen-analytics")?.classList.remove("hidden");
  document.getElementById("screen-analytics")?.classList.add("active");
}

async function loadPractitionerAnalyticsDetail(me, { moduleName, force = false } = {}) {
  const companyId = getActiveCompanyId(me);
  if (!companyId) throw new Error("No active company selected.");

  const filters = analyticsCurrentFilters();

  let summaryUrl = "";
  let rowsUrl = "";

  if (moduleName === "engagement-profitability") {
    summaryUrl = ENDPOINTS.analytics.engagementProfitability(companyId, filters);
    rowsUrl = ENDPOINTS.analytics.engagementProfitabilityRows(companyId, filters);
  } else if (moduleName === "client-service-trends") {
    summaryUrl = ENDPOINTS.analytics.clientServiceTrends(companyId, filters);
    rowsUrl = ENDPOINTS.analytics.clientServiceTrendsRows(companyId, filters);
  } else if (moduleName === "risk-alerts") {
    summaryUrl = ENDPOINTS.analytics.riskAlerts(companyId, filters);
    rowsUrl = ENDPOINTS.analytics.riskAlertsRows(companyId, filters);
  } else {
    throw new Error(`Unsupported analytics module: ${moduleName}`);
  }

  const [summaryRes, rowsRes] = await Promise.all([
    apiFetch(summaryUrl),
    apiFetch(rowsUrl)
  ]);

  PR_ANALYTICS_DETAIL_CACHE = summaryRes?.row || {};
  PR_ANALYTICS_DETAIL_ROWS_CACHE = rowsRes?.rows || [];

  renderPractitionerAnalyticsDetail(moduleName, PR_ANALYTICS_DETAIL_CACHE, PR_ANALYTICS_DETAIL_ROWS_CACHE);
}

function renderPractitionerAnalyticsDetail(moduleName, summary, rows) {
  if (moduleName === "engagement-profitability") {
    setText("analyticsDetailTitle", "Engagement Profitability");
    setText("analyticsDetailSubtitle", "Detailed view of engagement health, workflow pressure, deadlines, and performance indicators.");

    setText("analyticsDetailKpi1", summary.portfolio_total);
    setText("analyticsDetailKpi2", summary.healthy_count);
    setText("analyticsDetailKpi3", summary.watchlist_count);
    setText("analyticsDetailKpi4", summary.critical_count);

    setText("analyticsException1Title", "Overdue due dates");
    setText("analyticsException1Text", "Engagements that have missed deadlines or are approaching risk thresholds.");
    setText("analyticsException2Title", "Watchlist pressure");
    setText("analyticsException2Text", "High-priority and near-due engagements needing attention.");
    setText("analyticsException3Title", "Critical engagements");
    setText("analyticsException3Text", "Urgent, overdue, or paused work requiring escalation.");
  }

  if (moduleName === "client-service-trends") {
    setText("analyticsDetailTitle", "Client Service Trends");
    setText("analyticsDetailSubtitle", "Detailed view of client concentration, service line spread, and upcoming delivery obligations.");

    setText("analyticsDetailKpi1", summary.clients_served);
    setText("analyticsDetailKpi2", summary.active_service_lines);
    setText("analyticsDetailKpi3", summary.recurring_engagements);
    setText("analyticsDetailKpi4", summary.upcoming_due_dates);

    setText("analyticsException1Title", "Service concentration");
    setText("analyticsException1Text", "Clients with a high dependency on multiple open engagements.");
    setText("analyticsException2Title", "Upcoming delivery clusters");
    setText("analyticsException2Text", "Due dates concentrated around the same period.");
    setText("analyticsException3Title", "Coverage gaps");
    setText("analyticsException3Text", "Clients with limited service spread or recurring engagement imbalance.");
  }

  if (moduleName === "risk-alerts") {
    setText("analyticsDetailTitle", "Risk Alerts");
    setText("analyticsDetailSubtitle", "Detailed view of overdue engagements, blocked workflow, missing deliverables, and incomplete approvals.");

    setText("analyticsDetailKpi1", summary.overdue_engagements);
    setText("analyticsDetailKpi2", summary.blocked_items);
    setText("analyticsDetailKpi3", summary.outstanding_deliverables);
    setText("analyticsDetailKpi4", summary.pending_signoffs);

    setText("analyticsException1Title", "Overdue engagements");
    setText("analyticsException1Text", "Open engagements whose due dates have passed.");
    setText("analyticsException2Title", "Blocked workflow");
    setText("analyticsException2Text", "Reporting items or work steps currently blocked.");
    setText("analyticsException3Title", "Pending sign-offs");
    setText("analyticsException3Text", "Required approval steps not yet completed.");
  }

  renderPractitionerAnalyticsDetailRows(moduleName, rows);
}

function renderPractitionerAnalyticsDetailRows(moduleName, rows) {
  const tbody = document.getElementById("analyticsDetailTableBody");
  if (!tbody) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = `
      <tr class="border-b border-slate-100">
        <td colspan="7" class="px-3 py-6 text-center text-slate-500">No records found.</td>
      </tr>
    `;
    return;
  }

  if (moduleName === "engagement-profitability") {
    tbody.innerHTML = rows.map((row) => `
      <tr class="border-b border-slate-100">
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.engagement_name || row.engagement_code || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.customer_name || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.engagement_type || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.status || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(formatDateShort(row.due_date))}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.priority || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.signal || "--")}</td>
      </tr>
    `).join("");
    return;
  }

  if (moduleName === "client-service-trends") {
    tbody.innerHTML = rows.map((row) => `
      <tr class="border-b border-slate-100">
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.customer_name || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.customer_name || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(String(row.service_line_count ?? "--"))}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(String(row.open_engagements ?? "--"))}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(formatDateShort(row.next_due_date))}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(String(row.engagement_count ?? "--"))}</td>
        <td class="px-3 py-3 text-slate-700">trend</td>
      </tr>
    `).join("");
    return;
  }

  if (moduleName === "risk-alerts") {
    tbody.innerHTML = rows.map((row) => `
      <tr class="border-b border-slate-100">
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.engagement_name || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.customer_name || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.engagement_status || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(row.priority || "--")}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(formatDateShort(row.due_date))}</td>
        <td class="px-3 py-3 text-slate-700">${escapeHtml(String(row.outstanding_deliverables ?? 0))}</td>
        <td class="px-3 py-3 text-slate-700">
          blocked:${escapeHtml(String(row.blocked_reporting_items ?? 0))},
          signoff:${escapeHtml(String(row.pending_signoffs ?? 0))}
        </td>
      </tr>
    `).join("");
  }
}

function bindPractitionerAnalyticsDetailEvents(me) {
  if (PR_ANALYTICS_DETAIL_EVENTS_BOUND) return;
  PR_ANALYTICS_DETAIL_EVENTS_BOUND = true;

  document.getElementById("analyticsBackToOverview")?.addEventListener("click", async () => {
    await showPractitionerAnalyticsOverviewScreen(me);
  });

  document.getElementById("analyticsRefreshDetail")?.addEventListener("click", async () => {
    if (!PR_ANALYTICS_SELECTED_MODULE) return;

    await loadPractitionerAnalyticsDetail(me, {
      moduleName: PR_ANALYTICS_SELECTED_MODULE,
      force: true
    });
  });

  [
    "analyticsFilterDateRange",
    "analyticsFilterClient",
    "analyticsFilterEngagementType",
    "analyticsFilterManager",
    "analyticsFilterStatus",
    "analyticsFilterPriority"
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", async () => {
      if (!PR_ANALYTICS_SELECTED_MODULE) return;

      await loadPractitionerAnalyticsDetail(me, {
        moduleName: PR_ANALYTICS_SELECTED_MODULE,
        force: true
      });
    });
  });
}

async function loadAnalyticsFilterOptions(me) {
  const companyId = getActiveCompanyId(me);
  if (!companyId) return;

  const [customersRes, usersRes] = await Promise.all([
    apiFetch(ENDPOINTS.customers.list(companyId, { limit: 500, offset: 0 })),
    apiFetch(ENDPOINTS.users.list(companyId))
  ]);

  const customers = customersRes?.rows || customersRes?.data || [];
  const users = usersRes?.rows || usersRes?.data || [];

  const clientSelect = document.getElementById("analyticsFilterClient");
  const managerSelect = document.getElementById("analyticsFilterManager");

  if (clientSelect) {
    clientSelect.innerHTML = `
      <option value="">All clients</option>
      ${customers.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.customer_name || c.name || `Customer ${c.id}`)}</option>`).join("")}
    `;
  }

  if (managerSelect) {
    managerSelect.innerHTML = `
      <option value="">All managers</option>
      ${users.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml((u.full_name || `${u.first_name || ""} ${u.last_name || ""}`).trim() || u.email || `User ${u.id}`)}</option>`).join("")}
    `;
  }
}

async function renderAnalyticsScreen(me, screen = PR_NAV.analytics) {
  if (screen === PR_NAV.analytics) {
    bindPractitionerAnalyticsOverviewEvents(me);
    await loadPractitionerAnalyticsOverview(me, { force: false });
    return;
  }

  if (screen === PR_NAV.analyticsDetail) {
    bindPractitionerAnalyticsDetailEvents(me);
    await loadAnalyticsFilterOptions(me);

    if (!PR_ANALYTICS_SELECTED_MODULE) {
      PR_ANALYTICS_SELECTED_MODULE = "engagement-profitability";
    }

    await loadPractitionerAnalyticsDetail(me, {
      moduleName: PR_ANALYTICS_SELECTED_MODULE,
      force: PR_ANALYTICS_FORCE_RELOAD
    });

    PR_ANALYTICS_FORCE_RELOAD = false;
  }
}

async function fetchClientOverviewSummary(me, customerId) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(ENDPOINTS.clientOverview.summary(companyId, customerId));
  return res?.row || null;
}

async function fetchClientOverviewEngagements(
  me,
  customerId,
  {
    status = "",
    type = "",
    q = "",
    limit = 200,
    offset = 0
  } = {}
) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(
    ENDPOINTS.clientOverview.engagements(companyId, customerId, {
      status,
      type,
      q,
      limit,
      offset
    })
  );
  return Array.isArray(res?.rows) ? res.rows : [];
}

const PR_SCREEN_CONTEXT = {
  customerId: null,
  customerName: "",
  engagementId: null,
  sourceScreen: "",
  focus: "",
  filters: {}
};

function setPractitionerScreenContext({
  customerId = null,
  customerName = "",
  engagementId = null,
  sourceScreen = "",
  focus = "",
  filters = {}
} = {}) {
  PR_SCREEN_CONTEXT.customerId = customerId;
  PR_SCREEN_CONTEXT.customerName = customerName;
  PR_SCREEN_CONTEXT.engagementId = engagementId;
  PR_SCREEN_CONTEXT.sourceScreen = sourceScreen;
  PR_SCREEN_CONTEXT.focus = focus;
  PR_SCREEN_CONTEXT.filters = filters || {};
}

function getSelectedClientOverviewContext() {
  const select = document.getElementById("clientOverviewCustomerSelect");
  const customerId = select?.value ? Number(select.value) : null;
  const customerName = select?.selectedOptions?.[0]?.textContent?.trim() || "";
  return { customerId, customerName };
}

async function fetchClientOverviewReportingDeliverables(me, customerId) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(ENDPOINTS.clientOverview.reportingDeliverables(companyId, customerId));
  return res?.row || null;
}

async function fetchClientOverviewOperations(me, customerId) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(ENDPOINTS.clientOverview.operations(companyId, customerId));
  return res?.row || null;
}

async function fetchClientOverviewCloseFinalisation(me, customerId) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(ENDPOINTS.clientOverview.closeFinalisation(companyId, customerId));
  return res?.row || null;
}

async function fetchClientOverviewRiskAlerts(me, customerId) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(ENDPOINTS.clientOverview.riskAlerts(companyId, customerId));
  return res?.row || null;
}

function renderClientOverviewSummary(summary) {
  setText("clientOverviewActiveEngagements", safeNum(summary?.active_engagements, 0));
  setText("clientOverviewOpenItems", safeNum(summary?.open_items, 0));
  setText("clientOverviewOverdueItems", safeNum(summary?.overdue_items, 0));
  setText("clientOverviewAssignedTeam", safeNum(summary?.assigned_team_members, 0));

  setText("clientOverviewCompletedEngagements", safeNum(summary?.completed_engagements, 0));
  setText("clientOverviewPriorityEngagements", safeNum(summary?.priority_engagements, 0));
}

function renderClientOverviewReportingDeliverables(row) {
  setText("clientOverviewOpenReportingItems", safeNum(row?.open_reporting_items, 0));
  setText("clientOverviewOutstandingDeliverables", safeNum(row?.outstanding_deliverables, 0));
  setText("clientOverviewOverdueReportingItems", safeNum(row?.overdue_reporting_items, 0));
  setText("clientOverviewInReviewDeliverables", safeNum(row?.in_review_deliverables, 0));
}

function renderClientOverviewOperations(row) {
  setText("clientOverviewUnpostedItems", safeNum(row?.unposted_items, 0));
  setText("clientOverviewUnderReview", safeNum(row?.under_review, 0));
  setText("clientOverviewRejectedReturned", safeNum(row?.rejected_or_returned, 0));
  setText("clientOverviewPostedToday", safeNum(row?.posted_today, 0));
}

function renderClientOverviewCloseFinalisation(row) {
  setText("clientOverviewOpenMonthlyCloseTasks", safeNum(row?.open_monthly_close_tasks, 0));
  setText("clientOverviewOpenYearEndTasks", safeNum(row?.open_year_end_tasks, 0));
  setText("clientOverviewPendingSignoffs", safeNum(row?.pending_signoffs, 0));
  setText("clientOverviewAwaitingReview", safeNum(row?.awaiting_review, 0));
}

function renderClientOverviewRiskAlerts(row) {
  setText("clientOverviewOverdueEngagements", safeNum(row?.overdue_engagements, 0));
  setText("clientOverviewBlockedItems", safeNum(row?.blocked_items, 0));
  setText("clientOverviewRiskOutstandingDeliverables", safeNum(row?.outstanding_deliverables, 0));
  setText("clientOverviewRiskPendingSignoffs", safeNum(row?.pending_signoffs, 0));
}

function renderClientOverviewEngagementRows(rows) {
  const tbody = document.getElementById("clientOverviewEngagementRows");
  if (!tbody) return;

  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-sm text-slate-500">No engagements found for this client.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const engagementName = safeText(row.engagement_name);
    const engagementCode = safeText(row.engagement_code, "");
    const type = safeText(row.engagement_type);
    const status = safeText(row.status);
    const dueDate = safeText(row.due_date);
    const manager = fullName(row.manager_first_name, row.manager_last_name);
    const partner = fullName(row.partner_first_name, row.partner_last_name);
    const openReporting = safeNum(row.open_reporting_items, 0);
    const openDeliverables = safeNum(row.open_deliverables, 0);
    const openClose = safeNum(row.open_close_items, 0);

    return `
      <tr data-engagement-id="${row.id}">
        <td>
          <div class="font-medium">${engagementName}</div>
          <div class="text-xs text-slate-500">${engagementCode || "—"}</div>
        </td>
        <td>${type}</td>
        <td>${status}</td>
        <td>${dueDate}</td>
        <td>${manager}</td>
        <td>${partner}</td>
        <td>${openReporting}</td>
        <td>${openDeliverables}</td>
        <td>${openClose}</td>
      </tr>
    `;
  }).join("");
}

async function loadClientOverviewScreen(me, { force = false } = {}) {
  if (PR_CLIENT_OVERVIEW_LOADING) return;

  const customerId = getSelectedPractitionerCustomerId();

  const status = (document.getElementById("clientOverviewStatusFilter")?.value || "").trim();
  const type = (document.getElementById("clientOverviewTypeFilter")?.value || "").trim();
  const q = (document.getElementById("clientOverviewSearchInput")?.value || "").trim();

  if (!customerId) {
    PR_CLIENT_OVERVIEW_CACHE = {
      key: "",
      summary: null,
      engagements: [],
      reportingDeliverables: null,
      operations: null,
      closeFinalisation: null,
      riskAlerts: null
    };

    renderClientOverviewSummary(null);
    renderClientOverviewReportingDeliverables(null);
    renderClientOverviewOperations(null);
    renderClientOverviewCloseFinalisation(null);
    renderClientOverviewRiskAlerts(null);
    renderClientOverviewEngagementRows([]);
    return;
  }

  const cacheKey = JSON.stringify({
    customerId,
    status,
    type,
    q
  });

  if (
    !force &&
    PR_CLIENT_OVERVIEW_CACHE?.key === cacheKey &&
    PR_CLIENT_OVERVIEW_CACHE?.summary
  ) {
    renderClientOverviewSummary(PR_CLIENT_OVERVIEW_CACHE.summary);
    renderClientOverviewReportingDeliverables(PR_CLIENT_OVERVIEW_CACHE.reportingDeliverables);
    renderClientOverviewOperations(PR_CLIENT_OVERVIEW_CACHE.operations);
    renderClientOverviewCloseFinalisation(PR_CLIENT_OVERVIEW_CACHE.closeFinalisation);
    renderClientOverviewRiskAlerts(PR_CLIENT_OVERVIEW_CACHE.riskAlerts);
    renderClientOverviewEngagementRows(PR_CLIENT_OVERVIEW_CACHE.engagements);
    return;
  }

  PR_CLIENT_OVERVIEW_LOADING = true;

  try {
    const [
      summary,
      engagements,
      reportingDeliverables,
      operations,
      closeFinalisation,
      riskAlerts
    ] = await Promise.all([
      fetchClientOverviewSummary(me, customerId),
      fetchClientOverviewEngagements(me, customerId, { status, type, q }),
      fetchClientOverviewReportingDeliverables(me, customerId),
      fetchClientOverviewOperations(me, customerId),
      fetchClientOverviewCloseFinalisation(me, customerId),
      fetchClientOverviewRiskAlerts(me, customerId)
    ]);

    PR_CLIENT_OVERVIEW_CACHE = {
      key: cacheKey,
      summary,
      engagements,
      reportingDeliverables,
      operations,
      closeFinalisation,
      riskAlerts
    };

    renderClientOverviewSummary(summary);
    renderClientOverviewReportingDeliverables(reportingDeliverables);
    renderClientOverviewOperations(operations);
    renderClientOverviewCloseFinalisation(closeFinalisation);
    renderClientOverviewRiskAlerts(riskAlerts);
    renderClientOverviewEngagementRows(engagements);
  } catch (err) {
    console.error("loadClientOverviewScreen failed:", err);
    alert(err?.message || "Failed to load client overview.");
  } finally {
    PR_CLIENT_OVERVIEW_LOADING = false;
  }
}

function populateClientOverviewCustomerSelect() {
  const select = document.getElementById("clientOverviewCustomerSelect");
  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = `<option value="">Select client...</option>`;

  const rows = Array.isArray(PR_CUSTOMERS_CACHE) ? PR_CUSTOMERS_CACHE : [];

  rows.forEach((c) => {
    const id = c.id || c.customer_id;
    const name = c.customer_name || c.name || `Client ${id}`;

    const opt = document.createElement("option");
    opt.value = String(id);
    opt.textContent = name;

    select.appendChild(opt);
  });

  // restore previous selection if possible
  if (currentValue && rows.some(c => String(c.id || c.customer_id) === currentValue)) {
    select.value = currentValue;
  } else if (!select.value && rows.length > 0) {
    // auto-select first client
    const first = rows[0];
    select.value = String(first.id || first.customer_id);
  }
}

function bindClientOverviewEvents(me) {
  if (PR_CLIENT_OVERVIEW_EVENTS_BOUND) return;
  PR_CLIENT_OVERVIEW_EVENTS_BOUND = true;

  // 🔥 CLIENT CHANGE
  document.getElementById("clientOverviewCustomerSelect")?.addEventListener("change", async () => {
    resetClientOverviewCache();
    await loadClientOverviewScreen(me, { force: true });
  });

  document.getElementById("clientOverviewRefreshBtn")?.addEventListener("click", async () => {
    PR_CLIENT_OVERVIEW_CACHE = {
      summary: null,
      engagements: [],
      reportingDeliverables: null,
      operations: null,
      closeFinalisation: null,
      riskAlerts: null
    };
    await loadClientOverviewScreen(me, { force: true });
  });

  document.getElementById("clientOverviewStatusFilter")?.addEventListener("change", async () => {
    await loadClientOverviewScreen(me, { force: true });
  });

  document.getElementById("clientOverviewTypeFilter")?.addEventListener("change", async () => {
    await loadClientOverviewScreen(me, { force: true });
  });

  document.getElementById("clientOverviewViewEngagementsBtn")?.addEventListener("click", async () => {
    const { customerId, customerName } = getSelectedClientOverviewContext();
    if (!customerId) return alert("Select a client first.");

    setPractitionerScreenContext({
      customerId,
      customerName,
      sourceScreen: PR_NAV.clients,
      focus: "engagements",
      filters: {}
    });

    await switchPractitionerScreen(PR_NAV.assignments, me);
  });

  document.getElementById("clientOverviewViewReportingBtn")?.addEventListener("click", async () => {
    const { customerId, customerName } = getSelectedClientOverviewContext();
    if (!customerId) return alert("Select a client first.");

    setPractitionerScreenContext({
      customerId,
      customerName,
      sourceScreen: PR_NAV.clients,
      focus: "reporting",
      filters: { status: "open" }
    });

    await switchPractitionerScreen(PR_NAV.reportingOverview, me);
  });

  document.getElementById("clientOverviewViewOperationsBtn")?.addEventListener("click", async () => {
    const { customerId, customerName } = getSelectedClientOverviewContext();
    if (!customerId) return alert("Select a client first.");

    setPractitionerScreenContext({
      customerId,
      customerName,
      sourceScreen: PR_NAV.clients,
      focus: "operations",
      filters: {}
    });

    await switchPractitionerScreen(PR_NAV.dayToDayPostings, me);
  });

  document.getElementById("clientOverviewViewCloseBtn")?.addEventListener("click", async () => {
    const { customerId, customerName } = getSelectedClientOverviewContext();
    if (!customerId) return alert("Select a client first.");

    setPractitionerScreenContext({
      customerId,
      customerName,
      sourceScreen: PR_NAV.clients,
      focus: "close",
      filters: {}
    });

    await switchPractitionerScreen(PR_NAV.monthlyCloseRoutines, me);
  });

  document.getElementById("clientOverviewViewRiskBtn")?.addEventListener("click", async () => {
    const { customerId, customerName } = getSelectedClientOverviewContext();
    if (!customerId) return alert("Select a client first.");

    setPractitionerScreenContext({
      customerId,
      customerName,
      sourceScreen: PR_NAV.clients,
      focus: "risk",
      filters: { onlyExceptions: true }
    });

    await switchPractitionerScreen(PR_NAV.actionCenter, me);
  });
}

async function fetchActionCenterSummary(me, params = {}) {
  const companyId = practitionerCompanyIdFromMe(me);

  if (!ENDPOINTS?.actionCenter?.summary) {
    throw new Error("ENDPOINTS.actionCenter.summary is not configured");
  }

  const res = await apiFetch(ENDPOINTS.actionCenter.summary(companyId, params));
  return res?.row || null;
}

async function fetchActionCenterQueue(me, params = {}) {
  const companyId = practitionerCompanyIdFromMe(me);

  if (!ENDPOINTS?.actionCenter?.queue) {
    throw new Error("ENDPOINTS.actionCenter.queue is not configured");
  }

  const res = await apiFetch(ENDPOINTS.actionCenter.queue(companyId, params));
  return Array.isArray(res?.rows) ? res.rows : [];
}

async function fetchActionCenterQueue(me, params = {}) {
  const companyId = practitionerCompanyIdFromMe(me);
  const res = await apiFetch(ENDPOINTS.actionCenter.queue(companyId, params));
  return Array.isArray(res?.rows) ? res.rows : [];
}

async function postActionCenterItemAction(me, queueType, sourceId, action) {
  const companyId = practitionerCompanyIdFromMe(me);
  return apiFetch(ENDPOINTS.actionCenter.itemAction(companyId, queueType, sourceId), {
    method: "POST",
    body: JSON.stringify({ action })
  });
}

function renderActionCenterSummary(row) {
  setText("acAwaitingMyReview", safeNum(row?.awaiting_my_review, 0));
  setText("acPendingApproval", safeNum(row?.pending_approval, 0));
  setText("acOverdue", safeNum(row?.overdue_items, 0));
  setText("acBlocked", safeNum(row?.blocked_items, 0));
  setText("acDueToday", safeNum(row?.due_today, 0));
  setText("acPendingSignoffs", safeNum(row?.pending_signoffs, 0));
}

function renderActionCenterSideStats(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const reportingOverdue = safeRows.filter(r => r.queue_type === "reporting_item" && r.is_overdue).length;
  const blocked = safeRows.filter(r => r.is_blocked).length;
  const signoffs = safeRows.filter(r => r.queue_type === "signoff" && ["not_started", "in_progress", "blocked"].includes(String(r.status || "").toLowerCase())).length;

  const reporting = safeRows.filter(r => r.queue_type === "reporting_item").length;
  const deliverables = safeRows.filter(r => r.queue_type === "deliverable").length;
  const posting = safeRows.filter(r => r.queue_type === "posting_activity").length;
  const close = safeRows.filter(r => ["monthly_close", "year_end", "signoff"].includes(r.queue_type)).length;

  setText("acUrgentReporting", reportingOverdue);
  setText("acUrgentBlocked", blocked);
  setText("acUrgentSignoffs", signoffs);

  setText("acTypeReporting", reporting);
  setText("acTypeDeliverables", deliverables);
  setText("acTypePosting", posting);
  setText("acTypeClose", close);
}

function renderActionCenterSelectedItem(row) {
  const box = document.getElementById("actionCenterSelectedItem");
  if (!box) return;

  if (!row) {
    box.innerHTML = `<div class="text-sm text-slate-500">Select a row to view details.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="space-y-2">
      <div class="font-medium text-slate-800">${safeText(row.item_name, "Untitled item")}</div>
      <div class="text-xs text-slate-500">${safeText(row.queue_type)} · ${safeText(row.status)} · ${safeText(row.priority, "normal")}</div>
      <div class="text-sm text-slate-600"><strong>Client:</strong> ${safeText(row.customer_name, "—")}</div>
      <div class="text-sm text-slate-600"><strong>Engagement:</strong> ${safeText(row.engagement_name, "—")}</div>
      <div class="text-sm text-slate-600"><strong>Due:</strong> ${safeText(row.due_date, "—")}</div>
      <div class="text-sm text-slate-600"><strong>Assigned:</strong> ${safeText(row.assigned_user_name, "—")}</div>
      <div class="text-sm text-slate-600"><strong>Reviewer:</strong> ${safeText(row.reviewer_user_name, "—")}</div>
      <div class="pt-2">
        <button
          class="btn btn-secondary btn-sm"
          type="button"
          onclick="openActionCenterRowContext('${String(row.queue_type).replace(/'/g, "\\'")}', ${Number(row.source_id || 0)}, ${Number(row.engagement_id || 0)})"
        >
          Open related workflow
        </button>
      </div>
    </div>
  `;
}

function renderActionCenterRows(rows) {
  const tbody = document.getElementById("actionCenterRows");
  if (!tbody) return;

  const safeRows = Array.isArray(rows) ? rows : [];

  if (!safeRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-sm text-slate-500">No action items found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = safeRows.map((row, idx) => {
    const type = safeText(row.queue_type);
    const itemName = safeText(row.item_name, "Untitled item");
    const itemCode = safeText(row.item_code, "");
    const clientName = safeText(row.customer_name, "—");
    const engagementName = safeText(row.engagement_name, "—");
    const status = safeText(row.status, "—");
    const priority = safeText(row.priority, "normal");
    const dueDate = safeText(row.due_date, "—");
    const assigned = safeText(row.assigned_user_name, "—");
    const nextAction = safeText(row.next_action, "Open");

    const primaryAction = getActionCenterPrimaryAction(row);

    return `
      <tr
        class="cursor-pointer"
        data-ac-row-index="${idx}"
        data-queue-type="${type}"
        data-source-id="${Number(row.source_id || 0)}"
      >
        <td>${type}</td>
        <td>
          <div class="font-medium">${itemName}</div>
          <div class="text-xs text-slate-500">${itemCode || "—"}</div>
        </td>
        <td>${clientName}</td>
        <td>${engagementName}</td>
        <td>${status}</td>
        <td>${priority}</td>
        <td>${dueDate}</td>
        <td>${assigned}</td>
        <td>${nextAction}</td>
        <td>
          <div class="flex flex-wrap gap-2">
            ${
              primaryAction
                ? `<button
                     class="btn btn-secondary btn-sm"
                     type="button"
                     data-ac-action="${primaryAction}"
                     data-ac-row-index="${idx}"
                   >${primaryAction}</button>`
                : ""
            }
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              data-ac-open-row="${idx}"
            >
              Open
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function getActionCenterPrimaryAction(row) {
  const type = String(row?.queue_type || "").toLowerCase();
  const status = String(row?.status || "").toLowerCase();

  if (type === "reporting_item") {
    if (status === "ready" || status === "in_review") return "approve";
    if (status === "blocked") return "review";
    return "review";
  }

  if (type === "deliverable") {
    if (status === "requested" || status === "outstanding") return "receive";
    if (status === "received") return "review";
    return "review";
  }

  if (type === "posting_activity") {
    if (status === "pending_review" || status === "in_review") return "approve";
    if (status === "approved") return "post";
    return "review";
  }

  if (type === "monthly_close") {
    if (status === "not_started") return "start";
    if (status === "in_progress" || status === "in_review") return "complete";
    return "review";
  }

  if (type === "year_end") {
    if (status === "not_started") return "start";
    if (status === "in_progress" || status === "in_review") return "complete";
    return "review";
  }

  if (type === "signoff") {
    if (status === "not_started") return "start";
    if (status === "in_progress" || status === "blocked") return "complete";
    return "complete";
  }

  return "";
}

async function loadActionCenterScreen(me, { force = false } = {}) {
  if (PR_ACTION_CENTER_LOADING) return;

  const filters = getActionCenterFilters();
  const filtersKey = JSON.stringify(filters);

  if (
    !force &&
    PR_ACTION_CENTER_CACHE?.filtersKey === filtersKey &&
    PR_ACTION_CENTER_CACHE?.summary
  ) {
    renderActionCenterSummary(PR_ACTION_CENTER_CACHE.summary);
    renderActionCenterRows(PR_ACTION_CENTER_CACHE.rows);
    renderActionCenterSideStats(PR_ACTION_CENTER_CACHE.rows);
    renderActionCenterSelectedItem(PR_ACTION_CENTER_CACHE.selectedRow);
    return;
  }

  PR_ACTION_CENTER_LOADING = true;

  try {
    const [summary, rows] = await Promise.all([
      fetchActionCenterSummary(me, filters),
      fetchActionCenterQueue(me, { ...filters, limit: 200, offset: 0 })
    ]);

    PR_ACTION_CENTER_CACHE = {
      summary,
      rows,
      selectedRow: Array.isArray(rows) && rows.length ? rows[0] : null,
      filtersKey
    };

    renderActionCenterSummary(summary);
    renderActionCenterRows(rows);
    renderActionCenterSideStats(rows);
    renderActionCenterSelectedItem(PR_ACTION_CENTER_CACHE.selectedRow);
  } catch (err) {
    console.error("loadActionCenterScreen failed:", err);
    alert(err?.message || "Failed to load Action Center.");
  } finally {
    PR_ACTION_CENTER_LOADING = false;
  }
}

function bindActionCenterEvents(me) {
  if (PR_ACTION_CENTER_EVENTS_BOUND) return;
  PR_ACTION_CENTER_EVENTS_BOUND = true;

  document.getElementById("actionCenterRefreshBtn")?.addEventListener("click", async () => {
    resetActionCenterCache();
    await loadActionCenterScreen(me, { force: true });
  });

  document.getElementById("actionCenterMineBtn")?.addEventListener("click", async () => {
    PR_ACTION_CENTER_MINE_ONLY = !PR_ACTION_CENTER_MINE_ONLY;
    resetActionCenterCache();
    await loadActionCenterScreen(me, { force: true });
  });

  [
    "actionCenterClientFilter",
    "actionCenterEngagementFilter",
    "actionCenterTypeFilter",
    "actionCenterStatusFilter",
    "actionCenterPriorityFilter"
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", async () => {
      resetActionCenterCache();
      await loadActionCenterScreen(me, { force: true });
    });
  });

  document.getElementById("actionCenterSearchInput")?.addEventListener("input", debounce(async () => {
    resetActionCenterCache();
    await loadActionCenterScreen(me, { force: true });
  }, 250));

  document.querySelectorAll("[data-ac-quick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const quick = String(btn.getAttribute("data-ac-quick") || "all").trim().toLowerCase();
      applyActionCenterQuickFilter(quick);
      resetActionCenterCache();
      await loadActionCenterScreen(me, { force: true });
    });
  });

  document.getElementById("actionCenterRows")?.addEventListener("click", async (e) => {
    const actionBtn = e.target.closest("[data-ac-action]");
    const openBtn = e.target.closest("[data-ac-open-row]");
    const rowEl = e.target.closest("tr[data-ac-row-index]");

    if (actionBtn) {
      e.stopPropagation();
      const idx = Number(actionBtn.getAttribute("data-ac-row-index"));
      const action = String(actionBtn.getAttribute("data-ac-action") || "").trim().toLowerCase();
      const row = PR_ACTION_CENTER_CACHE.rows?.[idx];
      if (!row || !action) return;

      try {
        await postActionCenterItemAction(me, row.queue_type, row.source_id, action);
        resetActionCenterCache();
        await loadActionCenterScreen(me, { force: true });
      } catch (err) {
        console.error("Action Center quick action failed:", err);
        alert(err?.message || "Failed to apply action.");
      }
      return;
    }

    if (openBtn) {
      e.stopPropagation();
      const idx = Number(openBtn.getAttribute("data-ac-open-row"));
      const row = PR_ACTION_CENTER_CACHE.rows?.[idx];
      if (!row) return;
      openActionCenterRow(row, me);
      return;
    }

    if (rowEl) {
      const idx = Number(rowEl.getAttribute("data-ac-row-index"));
      const row = PR_ACTION_CENTER_CACHE.rows?.[idx] || null;
      PR_ACTION_CENTER_CACHE.selectedRow = row;
      renderActionCenterSelectedItem(row);
    }
  });
}

function applyActionCenterQuickFilter(quick) {
  PR_ACTION_CENTER_ACTIVE_QUICK = quick || "all";

  const typeEl = document.getElementById("actionCenterTypeFilter");
  const statusEl = document.getElementById("actionCenterStatusFilter");

  if (!typeEl || !statusEl) return;

  if (quick === "all") {
    PR_ACTION_CENTER_MINE_ONLY = false;
    typeEl.value = "";
    statusEl.value = "";
    return;
  }

  if (quick === "mine") {
    PR_ACTION_CENTER_MINE_ONLY = true;
    return;
  }

  PR_ACTION_CENTER_MINE_ONLY = false;

  if (quick === "overdue") {
    statusEl.value = "";
    return;
  }

  if (quick === "blocked") {
    statusEl.value = "blocked";
    return;
  }

  if (quick === "reviews") {
    statusEl.value = "in_review";
    return;
  }

  if (quick === "signoffs") {
    typeEl.value = "signoff";
    statusEl.value = "";
    return;
  }
}

function openActionCenterRow(row, me) {
  if (!row) return;

  const queueType = String(row.queue_type || "").toLowerCase();

  setPractitionerScreenContext?.({
    customerId: row.customer_id || null,
    engagementId: row.engagement_id || null,
    sourceScreen: PR_NAV.actionCenter,
    focus: queueType,
    filters: {
      queueType,
      sourceId: row.source_id || null
    }
  });

  if (queueType === "reporting_item") {
    switchPractitionerScreen(PR_NAV.reportingOverview, me);
    return;
  }

  if (queueType === "deliverable") {
    switchPractitionerScreen(PR_NAV.pendingDeliverables, me);
    return;
  }

  if (queueType === "posting_activity") {
    switchPractitionerScreen(PR_NAV.dayToDayPostings, me);
    return;
  }

  if (queueType === "monthly_close") {
    switchPractitionerScreen(PR_NAV.monthlyCloseRoutines, me);
    return;
  }

  if (queueType === "year_end" || queueType === "signoff") {
    switchPractitionerScreen(PR_NAV.yearEndReporting, me);
    return;
  }

  switchPractitionerScreen(PR_NAV.assignments, me);
}

function openActionCenterRowContext(queueType, sourceId, engagementId) {
  const row = (PR_ACTION_CENTER_CACHE.rows || []).find((r) =>
    String(r.queue_type) === String(queueType) &&
    Number(r.source_id) === Number(sourceId) &&
    Number(r.engagement_id) === Number(engagementId)
  );
  if (!row) return;
  openActionCenterRow(row, window.__PR_LAST_ME__);
}

function populateActionCenterClientFilter() {
  const select = document.getElementById("actionCenterClientFilter");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `<option value="">All clients</option>`;

  const rows = Array.isArray(PR_CUSTOMERS_CACHE) ? PR_CUSTOMERS_CACHE : [];
  rows.forEach((c) => {
    const id = c.id || c.customer_id;
    const name = c.customer_name || c.name || `Client ${id}`;

    const opt = document.createElement("option");
    opt.value = String(id);
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (currentValue) select.value = currentValue;
}

function populateActionCenterEngagementFilter() {
  const select = document.getElementById("actionCenterEngagementFilter");
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = `<option value="">All engagements</option>`;

  const rows = Array.isArray(PR_ASSIGNMENTS_CACHE) ? PR_ASSIGNMENTS_CACHE : [];
  rows.forEach((r) => {
    const id = r.id || r.engagement_id;
    const name = r.engagement_name || r.assignment_name || `Engagement ${id}`;

    const opt = document.createElement("option");
    opt.value = String(id);
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (currentValue) select.value = currentValue;
}

function populateActionCenterStatusFilter() {
  const select = document.getElementById("actionCenterStatusFilter");
  if (!select) return;

  const currentValue = select.value;

  const statuses = [
    "",
    "not_started",
    "in_progress",
    "ready",
    "in_review",
    "approved",
    "completed",
    "blocked",
    "waived",
    "returned",
    "requested",
    "outstanding",
    "received",
    "pending_review",
    "posted",
    "rejected",
    "reversed",
    "skipped"
  ];

  select.innerHTML = statuses.map((s) =>
    `<option value="${s}">${s ? s.replace(/_/g, " ") : "All statuses"}</option>`
  ).join("");

  if (currentValue) select.value = currentValue;
}

async function renderActionCenterScreen(me) {
  window.__PR_LAST_ME__ = me;

  bindActionCenterEvents(me);

  populateActionCenterClientFilter();
  populateActionCenterEngagementFilter();
  populateActionCenterStatusFilter();

  await loadActionCenterScreen(me, { force: false });
}


function renderSettingsScreen(me, screen) {
  console.log("Settings screen:", screen);
}
function renderDashboardHome(me) {}

async function renderClientsScreen(me) {
  // ensure customers are loaded (you may already do this elsewhere)
  if (!Array.isArray(PR_CUSTOMERS_CACHE) || PR_CUSTOMERS_CACHE.length === 0) {
    // if you have an existing loader, call it here
    // await loadCustomers(me);
  }

  populateClientOverviewCustomerSelect();

  bindClientOverviewEvents(me);

  await loadClientOverviewScreen(me, { force: false });
}

/* ======================================================
 * Bootstrapping
 * ==================================================== */

async function bootstrapPractitionerApp(me) {
  console.log("bootstrapPractitionerApp me =", me);

  const userType = String(me?.user_type || "").toLowerCase();
  const canPractitionerDashboard = !!me?.dashboards?.practitioner;
  const isPractitionerScope = userType === "practitioner";

  if (!canPractitionerDashboard && !isPractitionerScope) {
    if (window.__STOP_REDIRECTS__) {
      console.warn("[REDIRECT BLOCKED] dashboard.html replace");
    } else {
      window.location.replace("dashboard.html");
    }
    return;
  }

  const companies = await loadCompanies();

  renderProfile(me);
  renderHeader(me);
  renderCompanyFilter(companies, me);
  bindCompanyIdentity(me);
  renderContextBar(me);
  renderStaticPlaceholders();

  console.log("NAV ROLE RAW:", me);
  console.log("NAV ROLE NORMALIZED:", getUserNormalizedRole(me));

  setupPractitionerNav(me);

  const firstScreen = resolvePractitionerScreenName(getHashScreen() || PR_NAV.dashboard);
  switchPractitionerScreen(firstScreen, me, { updateHash: false });

  initDashboardModeSwitcher(companies, me, "practitioner");
  attachEvents(companies, me);

  window.addEventListener("hashchange", () => {
    const next = resolvePractitionerScreenName(getHashScreen() || PR_NAV.dashboard);
    switchPractitionerScreen(next, me, { updateHash: false });
  });
}

/* ======================================================
 * App init
 * ==================================================== */

async function initPractitioner() {
  console.log("initPractitioner: starting");

  const me = await enforcePractitionerAuth();

  if (!me) {
    if (window.__STOP_REDIRECTS__) {
      console.warn("[REDIRECT BLOCKED] signin.html replace");
    } else {
      window.location.replace("signin.html");
    }
    return;
  }

  // make user globally accessible
  window.currentUser = me;
  localStorage.setItem("fs_user", JSON.stringify(me || {}));

  await bootstrapPractitionerApp(me);
}

/* ======================================================
 * DOM ready
 * ==================================================== */

window.addEventListener("DOMContentLoaded", () => {
  initPractitioner().catch((e) => {
    console.error("Practitioner init crashed", e);

    if (window.__STOP_REDIRECTS__) {
      console.warn("[REDIRECT BLOCKED] dashboard.html replace after crash");
    } else {
      window.location.replace("dashboard.html");
    }
  });
});

})();   // ← IIFE closes here

















