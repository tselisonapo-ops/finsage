
(function hardBootstrapTokenHelpers() {
  const TOKEN_KEY = "fs_user_token";

  window.getToken = function () {
    return (
      localStorage.getItem(TOKEN_KEY) ||
      sessionStorage.getItem(TOKEN_KEY) ||
      ""
    );
  };

  window.setToken = function (token, persist = true) {
    if (!token) return;

    // clear legacy keys
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("access_token");

    // clear current key in both stores first
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);

    // write one source of truth
    (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  };

  window.clearToken = function () {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("access_token");
  };
})();

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

  audit: {
    // GET /api/companies/<cid>/audit?limit=&offset=&module=&severity=&entity_type=&entity_id=&actor_user_id=&from=&to=
    list: (
      companyId,
      {
        limit = 100,
        offset = 0,
        module = "",
        severity = "",
        entity_type = "",
        entity_id = "",
        actor_user_id = "",
        from = "",
        to = "",
      } = {}
    ) => {
      const params = new URLSearchParams();
      params.append("limit", String(limit ?? 100));
      params.append("offset", String(offset ?? 0));
      if (module) params.append("module", String(module));
      if (severity) params.append("severity", String(severity));
      if (entity_type) params.append("entity_type", String(entity_type));
      if (entity_id) params.append("entity_id", String(entity_id));
      if (actor_user_id) params.append("actor_user_id", String(actor_user_id));
      if (from) params.append("from", String(from));
      if (to) params.append("to", String(to));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/audit${qs ? `?${qs}` : ""}`;
    },
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
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/team/${encodeURIComponent(engagementTeamId)}/deactivate`,

    capacitySummary: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (role_on_engagement) params.set("role_on_engagement", role_on_engagement);
      params.set("active_only", active_only ? "true" : "false");
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-team/capacity/summary?${params.toString()}`;
    },

    capacityUsers: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        only_available = false,
        only_overloaded = false,
        limit = 100,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (role_on_engagement) params.set("role_on_engagement", role_on_engagement);
      params.set("active_only", active_only ? "true" : "false");
      params.set("only_available", only_available ? "true" : "false");
      params.set("only_overloaded", only_overloaded ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-team/capacity/users?${params.toString()}`;
    },

    capacityUser: (
      companyId,
      userId,
      {
        active_only = true
      } = {}
    ) => {
      const params = new URLSearchParams();
      params.set("active_only", active_only ? "true" : "false");
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-team/capacity/users/${encodeURIComponent(userId)}?${params.toString()}`;
    },

    capacityDashboard: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        limit = 100,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (role_on_engagement) params.set("role_on_engagement", role_on_engagement);
      params.set("active_only", active_only ? "true" : "false");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-team/capacity?${params.toString()}`;
    }
  },

  escalationsList: (
    companyId,
    {
      engagement_id = "",
      customer_id = "",
      status = "",
      severity = "",
      escalation_type = "",
      source_type = "",
      assigned_to_user_id = "",
      q = "",
      active_only = true,
      limit = 100,
      offset = 0
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (engagement_id) params.set("engagement_id", String(engagement_id));
    if (customer_id) params.set("customer_id", String(customer_id));
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    if (escalation_type) params.set("escalation_type", escalation_type);
    if (source_type) params.set("source_type", source_type);
    if (assigned_to_user_id) params.set("assigned_to_user_id", String(assigned_to_user_id));
    if (q) params.set("q", q);
    params.set("active_only", active_only ? "true" : "false");
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-escalations?${params.toString()}`;
  },

  escalationsGet: (companyId, escalationId) =>
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-escalations/${encodeURIComponent(escalationId)}`,

  escalationsCreate: (companyId) =>
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-escalations`,

  escalationsUpdate: (companyId, escalationId) =>
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-escalations/${encodeURIComponent(escalationId)}`,

  escalationsDeactivate: (companyId, escalationId) =>
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-escalations/${encodeURIComponent(escalationId)}/deactivate`,

  escalationsBackfillOverdueWP: (companyId) =>
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-escalations/auto-backfill-overdue-working-papers`,

  portfolioReviewSummary: (
    companyId,
    {
      customer_id = "",
      q = "",
      active_only = true
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (customer_id) params.set("customer_id", String(customer_id));
    if (q) params.set("q", q);
    params.set("active_only", active_only ? "true" : "false");
    return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/portfolio-review/summary?${params.toString()}`;
  },

  portfolioReviewEngagements: (
    companyId,
    {
      customer_id = "",
      q = "",
      active_only = true,
      risk_only = false,
      overdue_only = false,
      limit = 100,
      offset = 0
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (customer_id) params.set("customer_id", String(customer_id));
    if (q) params.set("q", q);
    params.set("active_only", active_only ? "true" : "false");
    params.set("risk_only", risk_only ? "true" : "false");
    params.set("overdue_only", overdue_only ? "true" : "false");
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/portfolio-review/engagements?${params.toString()}`;
  },

  portfolioReviewClientRisk: (
    companyId,
    {
      q = "",
      active_only = true,
      limit = 50,
      offset = 0
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("active_only", active_only ? "true" : "false");
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/portfolio-review/client-risk?${params.toString()}`;
  },

  portfolioReviewDashboard: (
    companyId,
    {
      customer_id = "",
      q = "",
      active_only = true,
      risk_only = false,
      overdue_only = false,
      limit = 100,
      offset = 0
    } = {}
  ) => {
    const params = new URLSearchParams();
    if (customer_id) params.set("customer_id", String(customer_id));
    if (q) params.set("q", q);
    params.set("active_only", active_only ? "true" : "false");
    params.set("risk_only", risk_only ? "true" : "false");
    params.set("overdue_only", overdue_only ? "true" : "false");
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/portfolio-review?${params.toString()}`;
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
        q = "",
        active_only = true,
        limit = 100,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (reporting_year_end) params.set("reporting_year_end", reporting_year_end);
      if (status) params.set("status", status);
      if (assigned_user_id) params.set("assigned_user_id", String(assigned_user_id));
      if (q) params.set("q", q);
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


  practitionerPosting: {
    summary: (companyId, engagementId, module_name, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/practitioner-dashboard/posting-modules/summary`,
        {
          engagement_id: engagementId,
          module_name,
          ...params
        }
      ),

    activity: (
      companyId,
      engagementId,
      module_name,
      {
        status = "",
        event_type = "",
        prepared_by_user_id = "",
        reviewer_user_id = "",
        date_from = "",
        date_to = "",
        mine_only = "",
        q = "",
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/practitioner-dashboard/posting-modules/activity`,
        {
          engagement_id: engagementId,
          module_name,
          status,
          event_type,
          prepared_by_user_id,
          reviewer_user_id,
          date_from,
          date_to,
          mine_only,
          q,
          limit,
          offset
        }
      ),

    filterOptions: (companyId, engagementId, module_name, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/practitioner-dashboard/posting-modules/filter-options`,
        {
          engagement_id: engagementId,
          module_name,
          ...params
        }
      )
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

  reviewQueue: {
    summary: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/review-queue/summary`,

    list: (companyId, engagementId, {
      queue_type = "",
      status = "",
      priority = "",
      mine_only = false,
      q = "",
      limit = 100,
      offset = 0
    } = {}) => {
      const params = new URLSearchParams();
      if (queue_type) params.set("queue_type", queue_type);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (mine_only) params.set("mine_only", "true");
      if (q) params.set("q", q);
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/review-queue/items${qs ? `?${qs}` : ""}`;
    },

    get: (companyId, engagementId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/review-queue/items/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}`,

    setStatus: (companyId, engagementId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/review-queue/items/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}/status`,

    assign: (companyId, engagementId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/review-queue/items/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}/assign`,

    deactivate: (companyId, engagementId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagements/${encodeURIComponent(engagementId)}/review-queue/items/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}/deactivate`
  },

  workingPapers: {
    list: (
      companyId,
      {
        customer_id = "",
        engagement_id = "",
        paper_section = "",
        paper_type = "",
        status = "",
        priority = "",
        mine_only = false,
        q = "",
        limit = 100,
        offset = 0
      } = {}
    ) => {
      const params = new URLSearchParams();
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_id) params.set("engagement_id", String(engagement_id));
      if (paper_section) params.set("paper_section", paper_section);
      if (paper_type) params.set("paper_type", paper_type);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (mine_only) params.set("mine_only", "true");
      if (q) params.set("q", q);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers${qs ? `?${qs}` : ""}`;
    },

    summary: (companyId, { customer_id = "", engagement_id = "" } = {}) => {
      const params = new URLSearchParams();
      if (customer_id) params.set("customer_id", String(customer_id));
      if (engagement_id) params.set("engagement_id", String(engagement_id));
      const qs = params.toString();
      return `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers/summary${qs ? `?${qs}` : ""}`;
    },

    create: (companyId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers`,

    get: (companyId, workingPaperId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers/${encodeURIComponent(workingPaperId)}`,

    update: (companyId, workingPaperId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers/${encodeURIComponent(workingPaperId)}`,

    setStatus: (companyId, workingPaperId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers/${encodeURIComponent(workingPaperId)}/status`,

    deactivate: (companyId, workingPaperId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-working-papers/${encodeURIComponent(workingPaperId)}/deactivate`
  },

  resourcePlanning: {
    summary: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        horizon_days = 60
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/resource-planning/summary`,
        {
          q,
          role_on_engagement,
          active_only,
          horizon_days
        }
      ),

    peaks: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        horizon_days = 60,
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/resource-planning/peaks`,
        {
          q,
          role_on_engagement,
          active_only,
          horizon_days,
          limit,
          offset
        }
      ),

    coverageGaps: (
      companyId,
      {
        q = "",
        active_only = true,
        horizon_days = 60,
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/resource-planning/coverage-gaps`,
        {
          q,
          active_only,
          horizon_days,
          limit,
          offset
        }
      ),

    reallocation: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        horizon_days = 60,
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/resource-planning/reallocation-opportunities`,
        {
          q,
          role_on_engagement,
          active_only,
          horizon_days,
          limit,
          offset
        }
      ),

    schedule: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        horizon_days = 60,
        only_available = false,
        only_overloaded = false,
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/resource-planning/schedule`,
        {
          q,
          role_on_engagement,
          active_only,
          horizon_days,
          only_available,
          only_overloaded,
          limit,
          offset
        }
      ),

    dashboard: (
      companyId,
      {
        q = "",
        role_on_engagement = "",
        active_only = true,
        horizon_days = 60,
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/resource-planning`,
        {
          q,
          role_on_engagement,
          active_only,
          horizon_days,
          limit,
          offset
        }
      )
  },

  finalDeliverablesReview: {
    summary: (companyId, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/final-deliverables-review/summary`,
        params
      ),

    list: (companyId, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/final-deliverables-review/list`,
        params
      ),

    detail: (companyId, engagementId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/final-deliverables-review/${encodeURIComponent(engagementId)}`
  },

  approvalCenter: {
    summary: (companyId, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/approval-center/summary`,
        params
      ),

    list: (companyId, params = {}) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/approval-center/list`,
        params
      ),

    detail: (companyId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/approval-center/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}`,

    action: (companyId, queueType, sourceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/approval-center/${encodeURIComponent(queueType)}/${encodeURIComponent(sourceId)}/action`
  },

  engagementAcceptance: {
    list: (
      companyId,
      {
        engagement_id = "",
        customer_id = "",
        acceptance_type = "",
        status = "",
        risk_level = "",
        assigned_partner_user_id = "",
        q = "",
        active_only = true,
        limit = 100,
        offset = 0
      } = {}
    ) =>
      buildApiUrl(
        `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-acceptance`,
        {
          engagement_id,
          customer_id,
          acceptance_type,
          status,
          risk_level,
          assigned_partner_user_id,
          q,
          active_only,
          limit,
          offset
        }
      ),

    create: (companyId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-acceptance`,

    get: (companyId, acceptanceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-acceptance/${encodeURIComponent(acceptanceId)}`,

  update: (companyId, acceptanceId) =>
    `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-acceptance/${encodeURIComponent(acceptanceId)}`,
    decision: (companyId, acceptanceId) =>
      `${API_BASE}/api/companies/${encodeURIComponent(companyId)}/engagement-acceptance/${encodeURIComponent(acceptanceId)}/decision`
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
};window.ENDPOINTS = ENDPOINTS;
window.endpoints = ENDPOINTS;

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

  let PR_PRACTITIONER_POSTING_CACHE = {
    journal_entries: { summary: null, rows: [], filters: null, total: 0, limit: 25, offset: 0 },
    accounts_receivable: { summary: null, rows: [], filters: null, total: 0, limit: 25, offset: 0 },
    accounts_payable: { summary: null, rows: [], filters: null, total: 0, limit: 25, offset: 0 },
    leases: { summary: null, rows: [], filters: null, total: 0, limit: 25, offset: 0 },
    ppe: { summary: null, rows: [], filters: null, total: 0, limit: 25, offset: 0 }
  };

  let PR_PRACTITIONER_POSTING_EVENTS_BOUND = false;

  let PR_REVIEW_QUEUE_CACHE = {
    summary: null,
    rows: [],
    selectedRow: null,
    detail: null,
    filters: {
      queue_type: "",
      status: "",
      priority: "",
      mine_only: false,
      q: "",
      limit: 100,
      offset: 0
    }
  };

  let PR_REVIEW_QUEUE_EVENTS_BOUND = false;
  let PR_REVIEW_QUEUE_LOADING = false;
  let PR_REVIEW_QUEUE_ACTIVE_QUICK = "all";

  let PR_DELIVERABLES_VIEW_CACHE = {
    rows: [],
    selectedRow: null,
    filters: {
      status: "",
      priority: "",
      deliverable_type: "",
      q: "",
      active_only: true,
      limit: 100,
      offset: 0
    }
  };

  let PR_DELIVERABLES_VIEW_LOADING = false;
  let PR_DELIVERABLES_VIEW_EVENTS_BOUND = false;
  let PR_DELIVERABLES_ACTIVE_QUICK = "all";

  let PR_SIGNOFF_VIEW_CACHE = {
    rows: [],
    selectedRow: null,
    filters: {
      reporting_year_end: "",
      status: "",
      assigned_user_id: "",
      active_only: true,
      limit: 100,
      offset: 0
    }
  };

  let PR_SIGNOFF_VIEW_LOADING = false;
  let PR_SIGNOFF_VIEW_EVENTS_BOUND = false;
  let PR_SIGNOFF_ACTIVE_QUICK = "all";

  window.__PR_DELIVERABLES_REGISTER_STATE__ = window.__PR_DELIVERABLES_REGISTER_STATE__ || {
    summary: {
      total: 0,
      open: 0,
      inReview: 0,
      overdue: 0,
      completed: 0
    },
    rows: [],
    selectedId: null,
    filters: {
      q: "",
      status: "",
      priority: "",
      deliverable_type: "",
      limit: 100,
      offset: 0
    }
  };

  let PR_TEAM_CAPACITY_CACHE = {
    summary: null,
    rows: [],
    selectedUserId: null,
    selectedUserDetail: null,
    loading: false,
    filters: {
      q: "",
      role_on_engagement: "",
      active_only: true,
      only_available: false,
      only_overloaded: false,
      limit: 100,
      offset: 0
    }
  };

  let PR_TEAM_CAPACITY_EVENTS_BOUND = false;

  let PR_PORTFOLIO_REVIEW_CACHE = {
    summary: null,
    engagements: [],
    clientRisk: [],
    loading: false,
    filters: {
      customer_id: "",
      q: "",
      active_only: true,
      risk_only: false,
      overdue_only: false,
      limit: 100,
      offset: 0
    }
  };

  let PR_PORTFOLIO_REVIEW_EVENTS_BOUND = false;

  let PR_ESCALATIONS_CACHE = {
    rows: [],
    selectedId: null,
    selectedRow: null,
    loading: false,
    filters: {
      engagement_id: "",
      customer_id: "",
      status: "",
      severity: "",
      escalation_type: "",
      source_type: "",
      assigned_to_user_id: "",
      q: "",
      active_only: true,
      limit: 100,
      offset: 0
    }
  };

  let PR_ESCALATIONS_EVENTS_BOUND = false;

  let PR_RESOURCE_PLANNING_CACHE = {
    summary: null,
    peaks: [],
    coverageGaps: [],
    reallocation: [],
    schedule: [],
    selectedTab: "peaks",
    selectedKey: "",
    selectedRow: null,
    loading: false,
    filters: {
      q: "",
      role_on_engagement: "",
      active_only: true,
      only_available: false,
      only_overloaded: false,
      horizon_days: 60,
      limit: 100,
      offset: 0
    }
  };

  let PR_RESOURCE_PLANNING_EVENTS_BOUND = false;

  let PR_FINAL_DELIVERABLES_REVIEW_CACHE = {
    summary: null,
    rows: [],
    selectedRow: null,
    detail: null,
    loading: false,
    detailLoading: false,
    error: "",
    filters: {
      q: "",
      module: "",
      status: "",
      ready_only: false,
      blockers_only: false,
      active_only: true,
      limit: 100,
      offset: 0
    }
  };

let PR_APPROVAL_CENTER_CACHE = {
  summary: null,
  rows: [],
  selectedRow: null,
  detail: null,
  loading: false,
  detailLoading: false,
  error: "",
  filters: {
    q: "",
    queue_type: "",
    status: "",
    ready_only: false,
    blockers_only: false,
    active_only: true,
    limit: 100,
    offset: 0
  }
};

let PR_ENGAGEMENT_ACCEPTANCE_CACHE = {
  rows: [],
  selectedRow: null,
  detail: null,
  filters: {
    engagement_id: "",
    customer_id: "",
    acceptance_type: "",
    status: "",
    risk_level: "",
    assigned_partner_user_id: "",
    q: "",
    active_only: true,
    limit: 100,
    offset: 0
  }
};

let PR_ENGAGEMENT_ACCEPTANCE_EVENTS_BOUND = false;

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
  deliverablesRegister: "deliverables-register",
  workingPapers: "working-papers",
  reviewQueue: "review-queue",

  journalEntries: "journal-entries",
  accountsReceivable: "accounts-receivable",
  accountsPayable: "accounts-payable",
  leases: "leases",
  ppe: "ppe",
  dayToDayPostings: "day-to-day-postings",
  monthlyCloseRoutines: "monthly-close-routines",
  yearEndReporting: "year-end-reporting",

  teamCapacity: "team-capacity",
  portfolioReview: "portfolio-review",
  engagementEscalations: "engagement-escalations",
  escalationCenter: "escalation-center",
  approvalCenter: "approval-center",
  resourcePlanning: "resource-planning",

  partnerSignoff: "partner-signoff",
  finalDeliverablesReview: "final-deliverables-review",
  engagementAcceptance: "engagement-acceptance",
  riskIndependence: "risk-independence",
  overrideLog: "override-log",
  engagementAuditTrail: "engagement-audit-trail",
  practiceAuditTrail: "practice-audit-trail",

  analyticsDetail: "analytics-detail",
};

/* ======================================================
  * Helpers
  * ==================================================== */
function getAuthToken() {
  return (
    localStorage.getItem("fs_user_token") ||
    sessionStorage.getItem("fs_user_token") ||
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
window.apiFetch = apiFetch;

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
    const payload = JSON.parse(atob(String(token).split(".")[1] || ""));
    const isDelegated =
      !!payload?.is_delegated_company_access ||
      String(payload?.access_scope || "").toLowerCase() === "delegated_workspace";

    const onPractitionerPage =
      /practitionerdashboard\.html$/i.test(location.pathname) ||
      location.pathname.includes("practitionerdashboard.html");

    if (onPractitionerPage && isDelegated) {
      console.warn("enforcePractitionerAuth: delegated token detected on practitioner page");
      window.location.replace("dashboard.html");
      return null;
    }
  } catch (e) {
    console.warn("enforcePractitionerAuth: token decode failed", e);
  }

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

function drEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function drPretty(v) {
  return String(v || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function drDate(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch (_) {
    return String(v);
  }
}

function drStatusClass(status) {
  return `status-${String(status || "").replace(/\s+/g, "-")}`;
}

function drPriorityClass(priority) {
  return `priority-${String(priority || "").replace(/\s+/g, "-")}`;
}

function drGetSelectedRow() {
  const state = window.__PR_DELIVERABLES_REGISTER_STATE__;
  return (state.rows || []).find((r) => String(r.id) === String(state.selectedId)) || null;
}

async function drLoadRows() {
  const companyId = getPractitionerActiveCompanyId?.();
  const engagementId = getPractitionerActiveEngagementId?.();
  if (!companyId || !engagementId) return [];

  const state = window.__PR_DELIVERABLES_REGISTER_STATE__;
  const f = state.filters || {};

  const json = await apiFetch(
    ENDPOINTS.engagementOps.deliverablesList(companyId, engagementId, {
      status: f.status || "",
      priority: f.priority || "",
      deliverable_type: f.deliverable_type || "",
      q: f.q || "",
      active_only: true,
      limit: f.limit || 100,
      offset: f.offset || 0
    }),
    { method: "GET" }
  );

  return json?.rows || json?.data?.rows || [];
}

function drBuildSummary(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const today = new Date();

  const total = safeRows.length;
  const open = safeRows.filter((r) => !["completed", "cleared", "submitted", "delivered"].includes(String(r.status || "").toLowerCase())).length;
  const inReview = safeRows.filter((r) => String(r.status || "").toLowerCase() === "in_review").length;
  const completed = safeRows.filter((r) =>
    ["completed", "cleared", "submitted", "delivered"].includes(String(r.status || "").toLowerCase())
  ).length;

  const overdue = safeRows.filter((r) => {
    if (!r.due_date) return false;
    const d = new Date(r.due_date);
    if (Number.isNaN(d.getTime())) return false;
    const s = String(r.status || "").toLowerCase();
    const closed = ["completed", "cleared", "submitted", "delivered"].includes(s);
    return !closed && d < today;
  }).length;

  return { total, open, inReview, overdue, completed };
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
        desc: "Outstanding deliverables and missing engagement inputs",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.pendingDeliverables)
      },
      {
        name: "Deliverables Register",
        screen: PR_NAV.deliverablesRegister,
        desc: "Full lifecycle register for all engagement deliverables",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.deliverablesRegister)
      },
      {
        name: "Working Papers",
        screen: PR_NAV.workingPapers,
        desc: "Schedules, reconciliations, memos, and reviewer-ready workpapers",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.workingPapers)
      },
      {
        name: "Review Queue",
        screen: PR_NAV.reviewQueue,
        desc: "Review inbox for items awaiting reviewer or manager action",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.reviewQueue)
      },
      {
        name: "Escalations",
        screen: PR_NAV.engagementEscalations,
        desc: "Raise and view escalation items for the current engagement",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.engagementEscalations)
      },
      {
        name: "Engagement Audit Trail",
        screen: PR_NAV.engagementAuditTrail,
        desc: "Audit history for engagement workflow actions, status changes, and assignments",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.engagementAuditTrail)
      },
      {
        name: "Engagement Team",
        screen: PR_NAV.team,
        desc: "Team assigned to this engagement, roles, and allocation",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.team)
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
        name: "Team Capacity",
        screen: PR_NAV.teamCapacity,
        desc: "Cross-engagement staffing, allocation load, and reviewer capacity",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.teamCapacity)
      },
      {
        name: "Portfolio Review",
        screen: PR_NAV.portfolioReview,
        desc: "Portfolio-wide engagement health, deadlines, and risk indicators",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.portfolioReview)
      },
      {
        name: "Escalation Center",
        screen: PR_NAV.escalationCenter,
        desc: "Review, assign, update, and resolve escalations across engagements",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.escalationCenter)
      },
      {
        name: "Practice Audit Trail",
        screen: PR_NAV.practiceAuditTrail,
        desc: "Cross-engagement audit history, workflow overrides, and control actions",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.practiceAuditTrail)
      },
      {
        name: "Resource Planning",
        screen: PR_NAV.resourcePlanning,
        desc: "Upcoming workload planning, staffing gaps, and scheduling pressure",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.resourcePlanning)
      }
    ]
  },
  {
    name: "Partner Tools",
    isParent: true,
    children: [
      {
        name: "Approval Center",
        screen: PR_NAV.approvalCenter,
        desc: "Manager approvals, rework routing, release controls, and approval history",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.approvalCenter)
      },
      {
        name: "Partner Sign-Off",
        screen: PR_NAV.partnerSignoff,
        desc: "Final approval workflow, sign-off steps, and completion control",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.partnerSignoff)
      },
      {
        name: "Final Deliverables Review",
        screen: PR_NAV.finalDeliverablesReview,
        desc: "Final pack review before sign-off and client release",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.finalDeliverablesReview)
      },
      {
        name: "Engagement Acceptance",
        screen: PR_NAV.engagementAcceptance,
        desc: "Client acceptance, continuation decisions, and approval notes",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.engagementAcceptance)
      },
      {
        name: "Risk & Independence",
        screen: PR_NAV.riskIndependence,
        desc: "Ethics, independence, and engagement risk oversight",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.riskIndependence)
      },
      {
        name: "Override Log",
        screen: PR_NAV.overrideLog,
        desc: "Partner overrides, exceptions, disputes, and final resolutions",
        visible: (me) => canAccessPractitionerScreen(me, PR_NAV.overrideLog)
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

  "working-papers": { auth: "private", roles: ["owner", "admin", "manager", "senior", "accountant", "bookkeeper", "audit_staff", "senior_associate", "audit_manager", "audit_partner", "engagement_partner", "quality_control_reviewer", "fs_compiler", "reviewer", "client_service_manager"] },

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

PR_SCREEN_POLICY["team-capacity"] = {
  auth: "private",
  roles: ["owner", "admin", "manager", "audit_manager", "client_service_manager"]
};

PR_SCREEN_POLICY["portfolio-review"] = {
  auth: "private",
  roles: ["owner", "admin", "manager", "audit_manager", "audit_partner", "engagement_partner", "client_service_manager"]
};

PR_SCREEN_POLICY["engagement-escalations"] = {
  auth: "private",
  roles: [
    "owner",
    "admin",
    "manager",
    "senior",
    "accountant",
    "bookkeeper",
    "audit_staff",
    "senior_associate",
    "audit_manager",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "fs_compiler",
    "reviewer",
    "client_service_manager"
  ]
};

PR_SCREEN_POLICY["escalation-center"] = {
  auth: "private",
  roles: [
    "owner",
    "admin",
    "manager",
    "audit_manager",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "client_service_manager",
    "reviewer"
  ]
};

PR_SCREEN_POLICY["approval-center"] = {
  auth: "private",
  roles: ["owner", "admin", "manager", "audit_manager", "client_service_manager", "reviewer"]
};

PR_SCREEN_POLICY["resource-planning"] = {
  auth: "private",
  roles: ["owner", "admin", "manager", "audit_manager", "client_service_manager"]
};

PR_SCREEN_POLICY["final-deliverables-review"] = {
  auth: "private",
  roles: ["owner", "admin", "audit_partner", "engagement_partner", "quality_control_reviewer"]
};

PR_SCREEN_POLICY["engagement-acceptance"] = {
  auth: "private",
  roles: ["owner", "admin", "audit_partner", "engagement_partner", "client_service_manager"]
};

PR_SCREEN_POLICY["risk-independence"] = {
  auth: "private",
  roles: ["owner", "admin", "audit_partner", "engagement_partner", "quality_control_reviewer"]
};

PR_SCREEN_POLICY["override-log"] = {
  auth: "private",
  roles: ["owner", "admin", "audit_partner", "engagement_partner", "quality_control_reviewer"]
};

PR_SCREEN_POLICY["deliverables-register"] = {
  auth: "private",
  roles: [
    "owner",
    "admin",
    "manager",
    "senior",
    "accountant",
    "bookkeeper",
    "audit_staff",
    "senior_associate",
    "audit_manager",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "fs_compiler",
    "reviewer",
    "client_service_manager"
  ]
};

PR_SCREEN_POLICY["working-papers"] = {
  auth: "private",
  roles: [
    "owner",
    "admin",
    "manager",
    "senior",
    "accountant",
    "bookkeeper",
    "audit_staff",
    "senior_associate",
    "audit_manager",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer",
    "fs_compiler",
    "reviewer",
    "client_service_manager"
  ]
};

PR_SCREEN_POLICY["engagement-audit-trail"] = {
  auth: "private",
  roles: [
    "owner",
    "admin",
    "manager",
    "audit_manager",
    "reviewer",
    "engagement_partner",
    "quality_control_reviewer",
    "client_service_manager"
  ]
};

PR_SCREEN_POLICY["practice-audit-trail"] = {
  auth: "private",
  roles: [
    "owner",
    "admin",
    "manager",
    "audit_manager",
    "audit_partner",
    "engagement_partner",
    "quality_control_reviewer"
  ]
};

function resolvePractitionerScreenName(name) {
  const n = String(name || "").trim().toLowerCase();

  const alias = {
    settings: "settings-overview",
    "partner-signoff": "partner-signoff",
    "review-queue": "review-queue",
    "working-papers": "working-papers",
    "deliverables-register": "deliverables-register",
    "engagement-audit-trail": "engagement-audit-trail",
    "practice-audit-trail": "practice-audit-trail",
    "engagement-escalations": "engagement-escalations",
    "escalation-center": "escalation-center"
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

  const needsEngagementContext = new Set([
    PR_NAV.reportingOverview,
    PR_NAV.pendingDeliverables,
    PR_NAV.deliverablesRegister,
    PR_NAV.workingPapers,
    PR_NAV.reviewQueue,
    PR_NAV.engagementAuditTrail,
    PR_NAV.team,
    PR_NAV.engagementEscalations
  ]);

  if (needsEngagementContext.has(screen)) {
    let engagementId = window.getPractitionerActiveEngagementId?.();

    if (!engagementId) {
      const restored = window.restorePractitionerActiveEngagement?.();
      engagementId = Number(restored?.engagementId || 0) || null;
    }

    if (!engagementId && PR_SELECTED_ENGAGEMENT?.id) {
      window.setPractitionerActiveEngagement?.(PR_SELECTED_ENGAGEMENT);
      engagementId = Number(PR_SELECTED_ENGAGEMENT.id) || null;
    }

    if (engagementId) {
      window.__PR_CONTEXT__ = {
        ...(window.__PR_CONTEXT__ || {}),
        engagementId
      };
    }
  }

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
  await runPractitionerScreenBinder(screen, me);

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
    team: "Engagement Team",
    analytics: "Analytics",
    "action-center": "Action Center",
    "settings-overview": "Settings Overview",
    users: "Users",
    "roles-permissions": "Roles & Permissions",
    "firm-preferences": "Firm Preferences",
    "reporting-overview": "Reporting Overview",
    "pending-deliverables": "Pending Deliverables",
    "deliverables-register": "Deliverables Register",
    "working-papers": "Working Papers",
    "journal-entries": "Journal Entries",
    "accounts-receivable": "Accounts Receivable",
    "accounts-payable": "Accounts Payable",
    leases: "Leases",
    ppe: "PPE",
    "day-to-day-postings": "Day-to-Day Postings",
    "monthly-close-routines": "Monthly Close Routines",
    "year-end-reporting": "Year-End Reporting",
    "review-queue": "Review Queue",
    "team-capacity": "Team Capacity",
    "portfolio-review": "Portfolio Review",
    "engagement-escalations": "Engagement Escalations",
    "escalation-center": "Escalation Center",
    "approval-center": "Approval Center",
    "resource-planning": "Resource Planning",
    "partner-signoff": "Partner Sign-Off",
    "final-deliverables-review": "Final Deliverables Review",
    "engagement-acceptance": "Engagement Acceptance",
    "risk-independence": "Risk & Independence",
    "override-log": "Override Log",
    "engagement-audit-trail": "Engagement Audit Trail",
    "practice-audit-trail": "Practice Audit Trail"
  };

  bindText("header.workspace_label", "Practitioner Workspace");
  bindText("header.dashboard_title", titles[screen] || "Practitioner Dashboard");

  const subtitles = {
    dashboard: "Client-service dashboard for bookkeeping, reporting engagements, approvals, and non-posting firm workflows.",
    assignments: "Track all active assignments, due dates, and role ownership.",
    clients: "View clients, service health, and engagement context.",
    team: "Team assigned to this engagement, roles, and allocation.",
    analytics: "View portfolio trends, delivery health, and risk signals.",
    "action-center": "Manage approvals, escalations, and workflow actions.",
    "settings-overview": "Configure the practitioner workspace and administration tools.",
    users: "Manage users, access, and client visibility.",
    "roles-permissions": "Control role rights for posting, review, and sign-off.",
    "firm-preferences": "Manage practice-level defaults and workspace settings.",
    "reporting-overview": "Review engagement summary, deadlines, and reporting readiness.",
    "pending-deliverables": "Track outstanding deliverables and missing engagement inputs.",
    "deliverables-register": "Full lifecycle register for all engagement deliverables.",
    "working-papers": "Prepare, review, and manage structured workpapers, schedules, reconciliations, and supporting records.",
    "journal-entries": "Manage journal posting workflow and review routing.",
    "accounts-receivable": "Manage receivables posting and review workflow.",
    "accounts-payable": "Manage payables posting and vendor workflow.",
    leases: "Review lease accounting workflow and engagement controls.",
    ppe: "Review fixed asset workflow and reporting events.",
    "day-to-day-postings": "Monitor recurring posting activity for the engagement.",
    "monthly-close-routines": "Review monthly close routines and completion status.",
    "year-end-reporting": "Manage annual reporting and finalization workflow.",
    "review-queue": "Review work awaiting reviewer or manager action.",
    "team-capacity": "Cross-engagement staffing, allocation load, and reviewer capacity visibility.",
    "portfolio-review": "Portfolio-wide engagement health, due dates, blockers, and manager risk signals.",
    "engagement-escalations": "Raise and track escalation items for the current engagement.",
    "escalation-center": "Review, assign, update, and resolve escalation items across engagements.",    "approval-center": "Manager approvals, review decisions, rework routing, and release controls.",
    "resource-planning": "Forward-looking staffing, scheduling pressure, and workload balancing.",
    "partner-signoff": "Final approval workflow, sign-off steps, and completion control.",
    "final-deliverables-review": "Final reporting pack review before sign-off and release.",
    "engagement-acceptance": "Acceptance, continuation, and approval decisions for client engagements.",
    "risk-independence": "Ethics, independence, and engagement risk oversight controls.",
    "override-log": "Partner overrides, exceptions, disputes, and final documented resolutions.",
    "engagement-audit-trail": "Audit history for engagement deliverables, workpapers, review actions, and sign-off decisions.",
    "practice-audit-trail": "Cross-engagement audit history, approvals, overrides, and workflow changes."
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

const POSTING_ENGAGEMENT_TYPES = new Set([
  "bookkeeping",
  "monthly_bookkeeping",
  "write_up",
  "management_accounts",
  "vat",
  "payroll",
  "tax",
  "tax_compliance",
  "cleanup",
  "migration",
  "outsourced_finance"
]);

const WORKING_PAPERS_ENGAGEMENT_TYPES = new Set([
  "audit",
  "audit_support",
  "internal_audit",
  "review",
  "independent_review",
  "compilation",
  "annual_financial_statements",
  "year_end_financials",
  "tax",
  "bookkeeping"
]);

const REPORTING_ENGAGEMENT_TYPES = new Set([
  "bookkeeping",
  "management_accounts",
  "compilation",
  "annual_financial_statements",
  "year_end_financials",
  "review",
  "audit"
]);

function normalizeRoleKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getCurrentPractitionerUserId() {
  const me = window.currentUser || window.__ME__ || {};
  return Number(me?.id || me?.user_id || me?.sub || 0);
}

function getCurrentPractitionerRole() {
  const me = window.currentUser || window.__ME__ || {};
  return normalizeRoleKey(me?.role || me?.user_role || "");
}

function getCurrentBusinessRole() {
  const me = window.currentUser || window.__ME__ || {};
  return normalizeRoleKey(me?.business_role || me?.invited_role || "");
}

function humanizeRole(role) {
  const r = normalizeRoleKey(role);

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
    accounting_trainee: "Accounting Trainee",
    audit_trainee: "Audit Trainee",
    audit_staff: "Audit Staff",
    senior_associate: "Senior Associate",
    audit_manager: "Audit Manager",
    audit_partner: "Audit Partner",
    engagement_partner: "Engagement Partner",
    quality_control_reviewer: "Quality Control Reviewer",
    fs_compiler: "Financial Statement Compiler",
    financial_statements_compiler: "Financial Statement Compiler",
    fs_preparer: "FS Preparer",
    tax_preparer: "Tax Preparer",
    reviewer: "Reviewer",
    tax_reviewer: "Tax Reviewer",
    client_service_manager: "Client Service Manager",
    preparer: "Preparer",
    partner: "Partner"
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

async function canOpenPartnerSignoff() {
  const snapshot = await loadEngagementWorkflowSnapshot();
  return !!snapshot?.readiness?.isReadyForPartnerSignoff;
}

async function openPartnerSignoffWithGate(me) {
  const snapshot = await loadEngagementWorkflowSnapshot();
  const readiness = snapshot?.readiness;

  if (!readiness) {
    alert("Unable to evaluate sign-off readiness.");
    return;
  }

  if (!readiness.isReadyForPartnerSignoff) {
    const msg = (readiness.blockers || [])
      .map((b) => `• ${b.label}: ${b.count}`)
      .join("\n");

    alert(`This engagement is not ready for partner sign-off.\n\nBlocking items:\n${msg}`);
    return;
  }

  await switchPractitionerScreen(PR_NAV.partnerSignoff, me);
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

function initPractitionerDashboardModeSwitcher(companies = [], me = {}, currentMode = "internal") {
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
  const block = document.getElementById("engWorkspaceSetupBlock");
  if (!block) return;

  const type = document.getElementById("engType")?.value || "";
  const customer = getSelectedEngagementCustomer();

  const requiresWorkspace = engagementTypeRequiresWorkspace(type);
  const alreadyProvisioned = customerHasProvisionedWorkspace(customer);
  const shouldShow = requiresWorkspace && !alreadyProvisioned;

  block.classList.toggle("hidden", !shouldShow);

  const countryEl = document.getElementById("engCountry");
  const currencyEl = document.getElementById("engCurrency");
  const industryEl = document.getElementById("engIndustry");
  const subIndustryEl = document.getElementById("engSubIndustry");

  if (shouldShow && customer) {
    if (countryEl && !countryEl.value) {
      countryEl.value = customer.country || customer.billing_country || "";
    }
    if (currencyEl && !currencyEl.value) {
      currencyEl.value = customer.currency || "";
    }
    if (industryEl && !industryEl.value && customer.industry) {
      industryEl.value = customer.industry;
      populateSubIndustryOptions(customer.industry);
    }
    if (subIndustryEl && customer.sub_industry) {
      subIndustryEl.value = customer.sub_industry;
    }
    return;
  }

  if (!shouldShow) {
    if (countryEl) countryEl.value = "";
    if (currencyEl) currencyEl.value = "";
    if (industryEl) industryEl.value = "";
    if (subIndustryEl) {
      subIndustryEl.innerHTML = `<option value="">Select sub-industry</option>`;
      subIndustryEl.value = "";
      subIndustryEl.disabled = true;
    }
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

async function runPractitionerScreenBinder(screen, me) {
  window.__PR_ME__ = me;

  switch (screen) {
    case PR_NAV.dashboard:
      await renderDashboardHome?.(me);
      break;

    case PR_NAV.assignments:
      await renderAssignmentsScreen?.(me);
      break;

    case PR_NAV.clients:
      await renderClientsScreen?.(me);
      break;

    case PR_NAV.team:
      await renderTeamScreen?.(me);
      break;

    case PR_NAV.analytics:
    case PR_NAV.analyticsDetail:
      await renderAnalyticsScreen?.(me, screen);
      break;

    case PR_NAV.actionCenter:
      await renderActionCenterScreen?.(me);
      break;

    case PR_NAV.settings:
    case PR_NAV.settingsOverview:
    case PR_NAV.users:
    case PR_NAV.rolesPermissions:
    case PR_NAV.firmPreferences:
      await renderSettingsScreen?.(me, screen);
      break;

    case PR_NAV.reportingOverview:
      await renderReportingOverviewScreen?.(me);
      break;

    case PR_NAV.pendingDeliverables:
      await renderPendingDeliverablesScreen?.(me);
      break;

    case PR_NAV.deliverablesRegister:
      await renderDeliverablesRegisterScreen?.(me);
      break;

    case PR_NAV.workingPapers:
      await renderWorkingPapersScreen?.(me);
      break;

    case PR_NAV.dayToDayPostings:
      await renderDayToDayPostingsScreen?.(me);
      break;

    case PR_NAV.monthlyCloseRoutines:
      await renderMonthlyCloseRoutinesScreen?.(me);
      break;

    case PR_NAV.yearEndReporting:
      await renderYearEndReportingScreen?.(me);
      break;

    case PR_NAV.journalEntries:
    case PR_NAV.accountsReceivable:
    case PR_NAV.accountsPayable:
    case PR_NAV.leases:
    case PR_NAV.ppe:
      await renderPractitionerPostingModuleScreen?.(me, screen);
      break;

    case PR_NAV.reviewQueue:
      await renderReviewQueueScreen?.(me);
      break;

    case PR_NAV.teamCapacity:
      await renderTeamCapacityScreen?.(me);
      break;

    case PR_NAV.portfolioReview:
      await renderPortfolioReviewScreen?.(me);
      break;

    case PR_NAV.engagementEscalations:
      await renderEngagementEscalationsScreen?.(me);
      break;

    case PR_NAV.escalationCenter:
      await renderEscalationCenterScreen?.(me);
      break;

    case PR_NAV.approvalCenter:
      await renderApprovalCenterScreen?.(me);
      break;

    case PR_NAV.resourcePlanning:
      await renderResourcePlanningScreen?.(me);
      break;

    case PR_NAV.partnerSignoff:
      await renderPartnerSignoffScreen?.(me);
      break;

    case PR_NAV.finalDeliverablesReview:
      await renderFinalDeliverablesReviewScreen?.(me);
      break;

    case PR_NAV.engagementAcceptance:
      await renderEngagementAcceptanceScreen?.(me);
      break;

    case PR_NAV.riskIndependence:
      await renderRiskIndependenceScreen?.(me);
      break;

    case PR_NAV.overrideLog:
      await renderOverrideLogScreen?.(me);
      break;

    case PR_NAV.engagementAuditTrail:
      await window.renderEngagementAuditTrailScreen?.(me);
      break;

    case PR_NAV.practiceAuditTrail:
      await window.renderPracticeAuditTrailScreen?.(me);
      break;

    default:
      await renderDashboardHome?.(me);
      break;
  }

  renderEngagementScreen(me, screen);
}

function renderEngagementScreen(me, screen) {
  const activeScreen = document.querySelector(".screen:not(.hidden)");
  if (!activeScreen) return;

  const canPost = canPostInEngagement(me.role);
  const canApprove = canApproveOnly(me.role);

  const postBtn = activeScreen.querySelector('[data-action="post-entry"]');
  const approveBtn = activeScreen.querySelector('[data-action="approve-entry"]');

  if (postBtn) postBtn.classList.toggle("hidden", !canPost);
  if (approveBtn) approveBtn.classList.toggle("hidden", !canApprove);
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

function closeAllEngagementActionMenus() {
  document.querySelectorAll("[data-eng-actions-menu]").forEach((menu) => {
    menu.classList.add("hidden");
  });
}

function resolveMyEngagementAccess(row) {
  const myUserId = getCurrentPractitionerUserId();
  const myRole = getCurrentPractitionerRole();
  const myBusinessRole = getCurrentBusinessRole();

  const managerId = Number(row.manager_user_id || 0);
  const partnerId = Number(row.partner_user_id || 0);
  const preparerId = Number(row.preparer_user_id || row.assigned_user_id || 0);

  const teamMembers = Array.isArray(row.team_members)
    ? row.team_members
    : Array.isArray(row.engagement_team)
    ? row.engagement_team
    : [];

  const myTeamRow = teamMembers.find((x) => Number(x.user_id || 0) === myUserId) || null;
  const myEngagementRole = normalizeRoleKey(
    myTeamRow?.role_on_engagement ||
    row.my_role_on_engagement ||
    ""
  );

  const isManager = !!myUserId && !!managerId && myUserId === managerId;
  const isPartner = !!myUserId && !!partnerId && myUserId === partnerId;
  const isLegacyPreparer = !!myUserId && !!preparerId && myUserId === preparerId;

  const isPreparer =
    myEngagementRole === "preparer" ||
    myEngagementRole === "bookkeeper" ||
    myEngagementRole === "fs_preparer" ||
    myEngagementRole === "fs_compiler" ||
    myEngagementRole === "accountant" ||
    myEngagementRole === "tax_preparer" ||
    isLegacyPreparer;

  const isReviewer =
    myEngagementRole === "reviewer" ||
    myEngagementRole === "tax_reviewer" ||
    myEngagementRole === "quality_control_reviewer";

  const isManagerLike =
    isManager ||
    isPartner ||
    ["owner", "admin", "partner", "audit_partner", "engagement_partner", "audit_manager", "manager"].includes(myRole);

  const isOpsWorker =
    isPreparer ||
    ["bookkeeper", "fs_preparer", "fs_compiler", "accountant", "senior_associate", "audit_staff", "tax_preparer"].includes(myBusinessRole) ||
    ["accountant", "senior", "audit_staff"].includes(myRole);

  return {
    myUserId,
    myRole,
    myBusinessRole,
    myEngagementRole,
    isManager,
    isPartner,
    isPreparer,
    isReviewer,
    isManagerLike,
    isOpsWorker
  };
}

function getEngagementRowActions(row) {
  const me = window.currentUser || window.__ME__ || {};
  const perms = me?.permissions || {};

  const engagementType = normalizeRoleKey(row.engagement_type || "");
  const status = normalizeRoleKey(row.status || "");
  const closed = ["completed", "cancelled", "archived"].includes(status);

  // ✅ USE your main access resolver
  const access = resolveMyEngagementAccess(row);

  const canManage = access.isManagerLike;
  const canWork = access.isOpsWorker || access.isManagerLike;
  const isPreparer = access.isPreparer;

  const supportsPosting = POSTING_ENGAGEMENT_TYPES.has(engagementType);
  const supportsWorkingPapers = WORKING_PAPERS_ENGAGEMENT_TYPES.has(engagementType);
  const supportsReporting = REPORTING_ENGAGEMENT_TYPES.has(engagementType);

  return [
    {
      key: "posting",
      label: "Start Posting",
      enabled: supportsPosting && !closed && (isPreparer || perms.can_post_journals || canManage),
      reason: !supportsPosting
        ? "Not a posting engagement"
        : closed
        ? "Engagement is closed"
        : !(isPreparer || perms.can_post_journals || canManage)
        ? "Posting access required"
        : ""
    },
    {
      key: "working_papers",
      label: "Open Working Papers",
      enabled: supportsWorkingPapers && canWork,
      reason: !supportsWorkingPapers
        ? "Working papers not applicable"
        : !canWork
        ? "Not assigned to this engagement"
        : ""
    },
    {
      key: "deliverables",
      label: "Open Deliverables",
      enabled: canWork,
      reason: !canWork ? "Not assigned to this engagement" : ""
    },
    {
      key: "reporting",
      label: "Open Reporting",
      enabled: supportsReporting && canWork,
      reason: !supportsReporting
        ? "Reporting not applicable"
        : !canWork
        ? "Not assigned to this engagement"
        : ""
    },
    {
      key: "audit_trail",
      label: "View Audit Trail",
      enabled: canManage,
      reason: !canManage ? "Manager or partner access required" : ""
    }
  ];
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
      <tr
        class="cursor-pointer hover:bg-slate-50"
        data-engagement-row="${esc(row.id)}"
      >
        <td>
          <div class="font-semibold text-slate-900">${esc(row.engagement_name || "--")}</div>
          <div class="text-xs text-slate-500">${esc(row.engagement_code || "--")}</div>
        </td>
        <td>${esc(row.customer_name || "--")}</td>
        <td class="capitalize">${esc(row.engagement_type || "--")}</td>
        <td>
          <div class="flex items-center gap-2 whitespace-nowrap">
            <span class="badge ${statusClass}">
              ${esc(row.status || "--")}
            </span>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
              data-eng-status-quick="${esc(row.id)}"
            >
              Change
            </button>
          </div>
        </td>
        <td>${esc(row.reporting_cycle || "--")}</td>
        <td>${fmtDate(row.due_date)}</td>
        <td>${esc(managerLabel)}</td>
        <td>${esc(partnerLabel)}</td>
        <td class="text-right overflow-visible">
          <div class="relative inline-block text-left overflow-visible">
            <button
              type="button"
              class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              data-eng-actions-toggle="${esc(row.id)}"
            >
              Actions
            </button>

            <div
              class="hidden absolute right-0 top-full z-[100] mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
              data-eng-actions-menu="${esc(row.id)}"
            >
              ${renderEngagementActionsMenu(row)}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderEngagementActionsMenu(row) {
 
  const actions = getEngagementRowActions(row);
  const statusOptions = ["draft", "pending", "active", "on_hold", "completed", "cancelled", "archived"];

  return `
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
      data-eng-action="open"
      data-engagement-id="${esc(row.id)}"
    >
      Open
    </button>

    <div class="my-2 border-t border-slate-200"></div>
    <div class="mb-2 px-2 text-[11px] uppercase tracking-wide text-slate-400">Set status</div>

    ${statusOptions.map((s) => `
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
          s === row.status
            ? "bg-slate-100 font-semibold text-slate-700"
            : "text-slate-600 hover:bg-slate-50"
        }"
        data-eng-action="set_status"
        data-status="${s}"
        data-engagement-id="${esc(row.id)}"
      >
        ${esc(s.replaceAll("_", " "))}
      </button>
    `).join("")}

    <div class="my-2 border-t border-slate-200"></div>

    ${actions.map((a) => `
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
          a.enabled
            ? "text-slate-700 hover:bg-slate-50"
            : "cursor-not-allowed bg-slate-50 text-slate-400"
        }"
        ${a.enabled ? `data-eng-action="${a.key}" data-engagement-id="${esc(row.id)}"` : "disabled"}
        title="${esc(a.reason || "")}"
      >
        <span>${esc(a.label)}</span>
      </button>
    `).join("")}
  `;
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

    // ✅ ensure practitioner dashboard is not still using delegated token
    const me = await enforcePractitionerAuth();
    if (!me) {
      throw new Error("Authentication expired or invalid.");
    }

    const rows = await loadAssignmentsData({ q, status, engagement_type });
    PR_ASSIGNMENTS_CACHE = rows;
    renderAssignmentsTable(rows);
    if (msg) msg.textContent = `${rows.length} assignment(s) loaded.`;
  } catch (err) {
    console.error("refreshAssignmentsScreen failed:", err);
    if (msg) msg.textContent = err.message || "Failed to load assignments.";
    renderAssignmentsTable([]);
  }
}

async function bindAssignmentsScreenEvents(me) {
  if (PR_ASSIGNMENTS_EVENTS_BOUND) return;
  PR_ASSIGNMENTS_EVENTS_BOUND = true;

  document.getElementById("assignmentsRefreshBtn")?.addEventListener("click", refreshAssignmentsScreen);

  document.getElementById("assignmentsSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") refreshAssignmentsScreen();
  });

  document.getElementById("assignmentsStatusFilter")?.addEventListener("change", refreshAssignmentsScreen);
  document.getElementById("assignmentsTypeFilter")?.addEventListener("change", refreshAssignmentsScreen);

  const tbody = document.getElementById("assignmentsTableBody");
  if (!tbody) return;

  tbody.addEventListener("click", async (e) => {

    // ✅ ROW CLICK (FIXED POSITION)
    const rowEl = e.target.closest("[data-engagement-row]");
    if (
      rowEl &&
      !e.target.closest("[data-eng-actions-toggle]") &&
      !e.target.closest("[data-eng-actions-menu]") &&
      !e.target.closest("[data-eng-status-quick]") &&
      !e.target.closest("[data-eng-action]") &&
      !e.target.closest("button") &&
      !e.target.closest("a") &&
      !e.target.closest("input") &&
      !e.target.closest("select")
    ) {
      const engagementId = Number(rowEl.dataset.engagementRow || 0);
      if (!engagementId) return;

      try {
        const row = await loadEngagementDetail(engagementId);
        if (!row) return;

        // ✅ SET FULL CONTEXT
        window.setPractitionerActiveEngagement?.(row);

        PR_SELECTED_ENGAGEMENT = row;

        renderAssignmentDetail(row);

        const teamFilter = document.getElementById("teamEngagementFilter");
        if (teamFilter) teamFilter.value = String(engagementId);

      } catch (err) {
        console.error("Failed to select engagement row:", err);
      }

      return;
    }

    // 🔽 EXISTING LOGIC (UNCHANGED)

    const toggleBtn = e.target.closest("[data-eng-actions-toggle]");
    if (toggleBtn) {
      e.preventDefault();
      e.stopPropagation();

      const engagementId = String(toggleBtn.dataset.engActionsToggle || "");
      if (!engagementId) return;

      const menu = document.querySelector(
        `[data-eng-actions-menu="${CSS.escape(engagementId)}"]`
      );
      if (!menu) return;

      const wasHidden = menu.classList.contains("hidden");
      closeAllEngagementActionMenus();

      if (wasHidden) menu.classList.remove("hidden");
      return;
    }

    const quickStatusBtn = e.target.closest("[data-eng-status-quick]");
    if (quickStatusBtn) {
      e.preventDefault();
      e.stopPropagation();

      const engagementId = String(quickStatusBtn.dataset.engStatusQuick || "");
      if (!engagementId) return;

      const menu = document.querySelector(
        `[data-eng-actions-menu="${CSS.escape(engagementId)}"]`
      );
      if (!menu) return;

      const wasHidden = menu.classList.contains("hidden");
      closeAllEngagementActionMenus();

      if (wasHidden) menu.classList.remove("hidden");
      return;
    }

    const actionBtn = e.target.closest("[data-eng-action]");
    if (!actionBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const action = String(actionBtn.dataset.engAction || "");
    const engagementId = Number(actionBtn.dataset.engagementId || 0);
    if (!engagementId || !action) return;

    closeAllEngagementActionMenus();

    try {
      const row = await loadEngagementDetail(engagementId);
      if (!row) return;

      // ✅ FIXED CONTEXT (already correct in your version)
      window.setPractitionerActiveEngagement?.(row);

      PR_SELECTED_ENGAGEMENT = row;

      if (action === "open") {
        renderAssignmentDetail(row);
        return;
      }

      if (action === "working_papers") {
        await switchPractitionerScreen(PR_NAV.workingPapers, me);
        return;
      }

      if (action === "deliverables") {
        await switchPractitionerScreen(PR_NAV.deliverables, me);
        return;
      }

      if (action === "reporting") {
        await switchPractitionerScreen(PR_NAV.reportingOverview, me);
        return;
      }

      if (action === "audit_trail") {
        await switchPractitionerScreen(PR_NAV.auditTrail, me);
        return;
      }

    if (action === "posting") {
      const targetCompanyId =
        Number(row.target_company_id || 0) ||
        Number(row.provisioned_company_id || 0) ||
        0;

      if (!targetCompanyId) {
        console.warn("Posting blocked: no target company found for engagement", row);
        alert("This engagement does not yet have a provisioned target company for posting.");
        return;
      }

      window.__PR_POSTING_CONTEXT__ = {
        engagementId: Number(row.id || 0),
        engagementCode: row.engagement_code || "",
        engagementName: row.engagement_name || "",
        customerId: Number(row.customer_id || 0),
        customerName: row.customer_name || "",
        sourceCompanyId: Number(row.company_id || 0),
        targetCompanyId,
        workspaceStatus: row.workspace_status || "",
        workspaceSource: row.workspace_source || "",
        targetCompanySource: row.target_company_source || ""
      };

      window.__PR_CONTEXT__ = {
        ...(window.__PR_CONTEXT__ || {}),
        engagementId: Number(row.id || 0),
        engagement: row,
        customerName: row.customer_name || "",
        postingCompanyId: targetCompanyId,
        targetCompanyId
      };

      await openPostingForEngagement(row, me);
      return;
    }

    } catch (err) {
      console.error("Engagement action failed:", err);
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-eng-actions-menu]") && !e.target.closest("[data-eng-actions-toggle]")) {
      closeAllEngagementActionMenus();
    }
  });
}

window.enterEngagementWorkspace = async function (engagementId, sourceCompanyId) {
  const res = await apiFetch(`/api/engagements/${engagementId}/enter-workspace`, {
    method: "POST",
    body: JSON.stringify({ source_company_id: sourceCompanyId }),
  });

  if (!res?.ok || !res?.token) {
    throw new Error(res?.error || "Failed to enter workspace");
  }

  console.log("ENTER WORKSPACE RAW RESPONSE", res);

  window.setToken(res.token, true);

  console.log("TOKEN AFTER SET", {
    getToken: window.getToken?.(),
    local: localStorage.getItem("fs_user_token"),
    session: sessionStorage.getItem("fs_user_token"),
  });

  return res;
};

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
  toggleEngagementWorkspaceSetup();
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
    "engFinancialYearStart",
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

  const block = document.getElementById("engWorkspaceSetupBlock");
  if (block) {
    block.classList.add("hidden");
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

function getEffectiveCustomerWorkspaceDefaults(customer) {
  if (!customer) {
    return {
      country: "",
      fin_year_start: "",
      currency: "",
      industry: "",
      sub_industry: ""
    };
  }

  return {
    country: String(customer.country || customer.billing_country || "").trim(),
    fin_year_start: String(customer.fin_year_start || "").trim(),
    currency: String(customer.currency || "").trim(),
    industry: String(customer.industry || "").trim(),
    sub_industry: String(customer.sub_industry || "").trim()
  };
}

function readEngagementModalPayload() {
  const customer = getSelectedEngagementCustomer();
  const customerId = Number(document.getElementById("engCustomerId")?.value || 0);

  const targetCompanyId =
    _parseModalInt(document.getElementById("engTargetCompanyId")?.value) ||
    _parseModalInt(customer?.company_master_id) ||
    null;

  const engagementType = document.getElementById("engType")?.value || "";

  const requiresWorkspace = engagementTypeRequiresWorkspace(engagementType);
  const alreadyProvisioned = customerHasProvisionedWorkspace(customer);
  const missingDefaults = customerMissingWorkspaceDefaults(customer);
  const needsWorkspaceSetup = requiresWorkspace && (!alreadyProvisioned || missingDefaults);

  const customerDefaults = getEffectiveCustomerWorkspaceDefaults(customer);

  const payload = {
    customer_id: customerId,
    target_company_id: targetCompanyId,
    engagement_code: document.getElementById("engCode")?.value?.trim() || "",
    engagement_name: document.getElementById("engName")?.value?.trim() || "",
    engagement_type: engagementType,
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
    financial_year_start:
      document.getElementById("engFinancialYearStart")?.value?.trim() ||
      customerDefaults.fin_year_start ||
      null
  };

  if (requiresWorkspace) {
    payload.target_company = {
      country:
        document.getElementById("engCountry")?.value?.trim() ||
        customerDefaults.country ||
        "",
      currency:
        document.getElementById("engCurrency")?.value?.trim() ||
        customerDefaults.currency ||
        "",
      industry:
        document.getElementById("engIndustry")?.value?.trim() ||
        customerDefaults.industry ||
        "",
      sub_industry:
        document.getElementById("engSubIndustry")?.value?.trim() ||
        customerDefaults.sub_industry ||
        ""
    };
  }

  return payload;
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

function getSelectedEngagementCustomer() {
  const customerId = Number(document.getElementById("engCustomerId")?.value || 0);
  if (!customerId) return null;
  return (PR_CUSTOMERS_CACHE || []).find(c => Number(c.id) === customerId) || null;
}

function engagementTypeRequiresWorkspace(type) {
  const v = String(type || "").toLowerCase();
  return [
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
  ].includes(v);
}

function customerHasProvisionedWorkspace(customer) {
  if (!customer) return false;

  const workspaceStatus = String(customer.workspace_status || "").toLowerCase();
  const companyMasterId = Number(customer.company_master_id || 0);

  return !!companyMasterId || ["provisioned", "linked"].includes(workspaceStatus);
}

function customerMissingWorkspaceDefaults(customer) {
  if (!customer) return true;

  const country = String(customer.country || customer.billing_country || "").trim();
  const finYearStart = String(customer.fin_year_start || "").trim();
  const currency = String(customer.currency || "").trim();
  const industry = String(customer.industry || "").trim();
  const subIndustry = String(customer.sub_industry || "").trim();

  return !(country && finYearStart && currency && industry && subIndustry);
}

function toggleEngagementWorkspaceSetup() {
  const block = document.getElementById("engWorkspaceSetupBlock");
  if (!block) return;

  const type = document.getElementById("engType")?.value || "";
  const customer = getSelectedEngagementCustomer();

  const requiresWorkspace = engagementTypeRequiresWorkspace(type);
  const alreadyProvisioned = customerHasProvisionedWorkspace(customer);
  const missingDefaults = customerMissingWorkspaceDefaults(customer);
  const shouldShow = requiresWorkspace && (!alreadyProvisioned || missingDefaults);

  block.classList.toggle("hidden", !shouldShow);

  const targetCompanyEl = document.getElementById("engTargetCompanyId");
  const countryEl = document.getElementById("engCountry");
  const finYearStartEl = document.getElementById("engFinancialYearStart");
  const currencyEl = document.getElementById("engCurrency");
  const industryEl = document.getElementById("engIndustry");
  const subIndustryEl = document.getElementById("engSubIndustry");

  if (targetCompanyEl) {
    targetCompanyEl.value = customer?.company_master_id || "";
  }

  if (customer) {
    if (countryEl && !countryEl.value) {
      countryEl.value = customer.country || customer.billing_country || "";
    }

    if (finYearStartEl && !finYearStartEl.value) {
      finYearStartEl.value = customer.fin_year_start || "";
    }

    if (currencyEl && !currencyEl.value) {
      currencyEl.value = customer.currency || "";
    }

    if (industryEl && !industryEl.value && customer.industry) {
      industryEl.value = customer.industry;
      populateSubIndustryOptions(customer.industry);
    }

    if (subIndustryEl) {
      if (industryEl?.value && subIndustryEl.options.length <= 1) {
        populateSubIndustryOptions(industryEl.value);
      }

      if (!subIndustryEl.value && customer.sub_industry) {
        subIndustryEl.value = customer.sub_industry;
      }
    }
  }

  if (!shouldShow && !customer) {
    if (countryEl) countryEl.value = "";
    if (finYearStartEl) finYearStartEl.value = "";
    if (currencyEl) currencyEl.value = "";
    if (industryEl) industryEl.value = "";
    if (subIndustryEl) {
      subIndustryEl.innerHTML = `<option value="">Select sub-industry</option>`;
      subIndustryEl.value = "";
      subIndustryEl.disabled = true;
    }
  }
}

function updateEngagementWorkspaceSetupVisibility() {
  const block = document.getElementById("engWorkspaceSetupBlock");
  if (!block) return;

  const engagementType = document.getElementById("engType")?.value || "";
  const customer = getSelectedEngagementCustomer();

  const requiresWorkspace = engagementTypeRequiresWorkspace(engagementType);
  const alreadyProvisioned = customerHasProvisionedWorkspace(customer);

  const shouldShow = requiresWorkspace && !alreadyProvisioned;

  block.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    const countryEl = document.getElementById("engCountry");
    const currencyEl = document.getElementById("engCurrency");
    const industryEl = document.getElementById("engIndustry");
    const subIndustryEl = document.getElementById("engSubIndustry");

    if (countryEl) countryEl.value = "";
    if (currencyEl) currencyEl.value = "";
    if (industryEl) industryEl.value = "";
    if (subIndustryEl) {
      subIndustryEl.innerHTML = `<option value="">Select sub-industry</option>`;
      subIndustryEl.value = "";
      subIndustryEl.disabled = true;
    }
  } else if (customer) {
    const countryEl = document.getElementById("engCountry");
    const currencyEl = document.getElementById("engCurrency");

    if (countryEl && !countryEl.value) {
      countryEl.value = customer.country || customer.billing_country || "";
    }

    if (currencyEl && !currencyEl.value) {
      currencyEl.value = customer.currency || "";
    }
  }
}

function validateEngagementPayload(payload) {
  if (!payload.customer_id) return "Customer is required.";
  if (!payload.engagement_name) return "Engagement name is required.";
  if (!payload.engagement_type) return "Engagement type is required.";

  const customer = getSelectedEngagementCustomer();
  const requiresWorkspace = engagementTypeRequiresWorkspace(payload.engagement_type);
  const alreadyProvisioned = customerHasProvisionedWorkspace(customer);
  const missingDefaults = customerMissingWorkspaceDefaults(customer);

  if (requiresWorkspace) {
    const hasExistingTarget = !!payload.target_company_id;
    const mustCollectWorkspaceFields = !alreadyProvisioned || missingDefaults || !hasExistingTarget;

    if (mustCollectWorkspaceFields) {
      const country = String(payload?.target_company?.country || "").trim();
      const currency = String(payload?.target_company?.currency || "").trim();
      const industry = String(payload?.target_company?.industry || "").trim();
      const subIndustry = String(payload?.target_company?.sub_industry || "").trim();
      const finYearStart = String(payload?.financial_year_start || "").trim();

      if (!country) return "Country is required to create or complete workspace setup for this engagement.";
      if (!finYearStart) return "Financial year start is required to create or complete workspace setup for this engagement.";
      if (!currency) return "Currency is required to create or complete workspace setup for this engagement.";
      if (!industry) return "Industry is required to create or complete workspace setup for this engagement.";
      if (!subIndustry) return "Sub-industry is required to create or complete workspace setup for this engagement.";
    }
  }

  return "";
}

async function handleCreateEngagementSubmit() {
  const saveBtn = document.getElementById("engagementModalSave");

  try {
    const payload = readEngagementModalPayload();

    const requiresWorkspace = engagementTypeRequiresWorkspace(payload.engagement_type);
    const workspace = payload.target_company || {};

    if (requiresWorkspace) {
      const missing = [];

      if (!(workspace.country || "").trim()) missing.push("country");
      if (!(payload.financial_year_start || "").trim()) missing.push("financial year start");
      if (!(workspace.currency || "").trim()) missing.push("currency");
      if (!(workspace.industry || "").trim()) missing.push("industry");
      if (!(workspace.sub_industry || "").trim()) missing.push("sub-industry");

      if (missing.length) {
        setEngagementModalMsg(
          `Please complete: ${missing.join(", ")}.`,
          "error"
        );
        return;
      }
    }

    const validation = validateEngagementPayload(payload);
    if (validation) {
      setEngagementModalMsg(validation, "error");
      return;
    }

    if (saveBtn) saveBtn.disabled = true;
    setEngagementModalMsg("Creating engagement...");

    const out = await createEngagementApi(payload);
    const row = out?.row || null;
    const acceptanceId = out?.acceptance_id || null;

    setEngagementModalMsg(
      acceptanceId
        ? "Engagement created and sent for acceptance review."
        : "Engagement created successfully.",
      "success"
    );

    await refreshAssignmentsScreen();

    if (row?.id) {
      PR_SELECTED_ENGAGEMENT = row;
      renderAssignmentDetail(row);
    }

    if (!PR_ASSIGNMENTS_CACHE.length) {
      PR_ASSIGNMENTS_CACHE = await loadAssignmentsData({});
    }

    populateTeamEngagementFilter(PR_ASSIGNMENTS_CACHE);

    setTimeout(() => {
      closeEngagementModal();
      resetEngagementModalForm();
    }, 500);
  } catch (err) {
    console.error(err);
    setEngagementModalMsg(
      err.message || "Failed to create engagement.",
      "error"
    );
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
      toggleEngagementWorkspaceSetup();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to open engagement form.");
    }
  });

  document.getElementById("engType")?.addEventListener("change", () => {
    toggleEngagementWorkspaceSetup();
  });

  document.getElementById("engCustomerId")?.addEventListener("change", () => {
    toggleEngagementWorkspaceSetup();
  });

  document.getElementById("engIndustry")?.addEventListener("change", (e) => {
    populateSubIndustryOptions(e.target.value);
  });

  document.getElementById("engagementModalClose")?.addEventListener("click", closeEngagementModal);
  document.getElementById("engagementModalCancel")?.addEventListener("click", closeEngagementModal);
  document.getElementById("engagementModalBackdrop")?.addEventListener("click", closeEngagementModal);
  document.getElementById("engagementModalSave")?.addEventListener("click", handleCreateEngagementSubmit);

  document.getElementById("engAddCustomerBtn")?.addEventListener("click", () => {
    window.open("dashboard.html#screen=customers", "_blank");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEngagementModal();
  });
}

function engagementWorkspaceSetupRequired() {
  const type = document.getElementById("engType")?.value || "";
  return engagementTypeRequiresWorkspace(type);
}

function getEngagementWorkspacePayload() {
  return {
    country: document.getElementById("engCountry")?.value?.trim() || "",
    fin_year_start: document.getElementById("engFinYearStart")?.value?.trim() || "",
    currency: document.getElementById("engCurrency")?.value?.trim() || "",
    industry: document.getElementById("engIndustry")?.value?.trim() || "",
    sub_industry: document.getElementById("engSubIndustry")?.value?.trim() || ""
  };
}

function validateEngagementWorkspacePayload(workspace) {
  if (!engagementWorkspaceSetupRequired()) return;

  const missing = [];
  if (!workspace.country) missing.push("country");
  if (!workspace.fin_year_start) missing.push("financial year start");
  if (!workspace.currency) missing.push("currency");
  if (!workspace.industry) missing.push("industry");
  if (!workspace.sub_industry) missing.push("sub-industry");

  if (missing.length) {
    throw new Error(`Please complete: ${missing.join(", ")}.`);
  }
}

async function ensureEngagementModalBound() {
  if (PR_ENG_MODAL_EVENTS_BOUND) return;
  PR_ENG_MODAL_EVENTS_BOUND = true;
  await bindEngagementModalEvents();
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
  await renderWorkflowReadinessInto("reportingReadinessSlot");
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

  applyActionCenterRoleVisibility(me);
  bindActionCenterEvents(me);

  populateActionCenterClientFilter();
  populateActionCenterEngagementFilter();
  populateActionCenterStatusFilter();

  await loadActionCenterScreen(me, { force: false });
}

function applyActionCenterRoleVisibility(me) {
  const canPost = canPostInEngagement(me.role);
  const canApprove = canApproveOnly(me.role);

  bindText("summary.role_name", humanizeRole(me.role));

  const postControls = document.getElementById("postingControls");
  const approvalControls = document.getElementById("approvalControls");

  if (postControls) postControls.classList.toggle("hidden", !canPost);
  if (approvalControls) approvalControls.classList.toggle("hidden", !canApprove);
}

function getPractitionerPostingModuleName(screen) {
  switch (screen) {
    case PR_NAV.journalEntries:
      return "journal_entries";
    case PR_NAV.accountsReceivable:
      return "accounts_receivable";
    case PR_NAV.accountsPayable:
      return "accounts_payable";
    case PR_NAV.leases:
      return "leases";
    case PR_NAV.ppe:
      return "ppe";
    default:
      return "";
  }
}

function getPractitionerPostingScreenConfig(screen) {
  const moduleName = getPractitionerPostingModuleName(screen);

  switch (screen) {
    case PR_NAV.journalEntries:
      return {
        prefix: "je",
        moduleName,
        title: "Journal Activity",
        emptyText: "No journal activity available for the selected engagement."
      };

    case PR_NAV.accountsReceivable:
      return {
        prefix: "ar",
        moduleName,
        title: "Accounts Receivable Activity",
        emptyText: "No receivable activity available for the selected engagement."
      };

    case PR_NAV.accountsPayable:
      return {
        prefix: "ap",
        moduleName,
        title: "Accounts Payable Activity",
        emptyText: "No payable activity available for the selected engagement."
      };

    case PR_NAV.leases:
      return {
        prefix: "le",
        moduleName,
        title: "Lease Activity",
        emptyText: "No lease activity available for the selected engagement."
      };

    case PR_NAV.ppe:
      return {
        prefix: "ppe",
        moduleName,
        title: "PPE Activity",
        emptyText: "No PPE activity available for the selected engagement."
      };

    default:
      return null;
  }
}

function prEl(id) {
  return document.getElementById(id);
}

function formatDateValue(v) {
  if (!v) return "--";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString();
  } catch (_) {
    return String(v);
  }
}

function formatMoneyValue(amount, currencyCode) {
  const n = Number(amount || 0);

  if (!currencyCode) {
    return n.toFixed(2); // safe fallback without currency
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2
    }).format(n);
  } catch (_) {
    return `${currencyCode} ${n.toFixed(2)}`;
  }
}

function resolveCurrencyCode({ engagement, customer, company } = {}) {
  return (
    engagement?.currency_code ||
    engagement?.currencyCode ||
    customer?.currency_code ||
    customer?.currencyCode ||
    company?.currency_code ||
    company?.currencyCode ||
    "ZAR" // last fallback only
  );
}

function getActiveCurrency(me) {
  return resolveCurrencyCode({
    engagement: PR_SELECTED_ENGAGEMENT,
    customer: PR_SELECTED_ENGAGEMENT, // if customer fields embedded
    company: me
  });
}

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (["posted", "approved", "completed"].includes(s)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (["pending_review", "in_review", "review"].includes(s)) {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
  if (["returned", "rejected", "blocked", "reversed"].includes(s)) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  if (["draft", "not_started"].includes(s)) {
    return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

function titleCaseToken(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function getSelectedPractitionerEngagementId() {
  return PR_SELECTED_ENGAGEMENT?.id || PR_SELECTED_ENGAGEMENT?.engagement_id || null;
}

function getSelectedPractitionerEngagementName() {
  return (
    PR_SELECTED_ENGAGEMENT?.engagement_name ||
    PR_SELECTED_ENGAGEMENT?.engagementName ||
    "--"
  );
}

function getSelectedPractitionerEngagementCode() {
  return (
    PR_SELECTED_ENGAGEMENT?.engagement_code ||
    PR_SELECTED_ENGAGEMENT?.engagementCode ||
    "--"
  );
}

function getPractitionerPostingCache(moduleName) {
  if (!moduleName) return null;
  if (!PR_PRACTITIONER_POSTING_CACHE[moduleName]) {
    PR_PRACTITIONER_POSTING_CACHE[moduleName] = {
      summary: null,
      rows: [],
      filters: null,
      total: 0,
      limit: 25,
      offset: 0
    };
  }
  return PR_PRACTITIONER_POSTING_CACHE[moduleName];
}

function collectPractitionerPostingFilters(prefix, cache) {
  return {
    status: prEl(`${prefix}-filter-status`)?.value || "",
    event_type: prEl(`${prefix}-filter-event-type`)?.value || "",
    prepared_by_user_id: prEl(`${prefix}-filter-prepared-by`)?.value || "",
    reviewer_user_id: prEl(`${prefix}-filter-reviewer`)?.value || "",
    date_from: prEl(`${prefix}-filter-date-from`)?.value || "",
    date_to: prEl(`${prefix}-filter-date-to`)?.value || "",
    mine_only: prEl(`${prefix}-filter-mine-only`)?.checked ? "true" : "",
    q: prEl(`${prefix}-filter-q`)?.value?.trim() || "",
    limit: cache?.limit || 25,
    offset: cache?.offset || 0
  };
}

function resetPractitionerPostingFilters(prefix, cache) {
  const ids = [
    `${prefix}-filter-status`,
    `${prefix}-filter-event-type`,
    `${prefix}-filter-prepared-by`,
    `${prefix}-filter-reviewer`,
    `${prefix}-filter-date-from`,
    `${prefix}-filter-date-to`,
    `${prefix}-filter-q`
  ];

  ids.forEach((id) => {
    const el = prEl(id);
    if (el) el.value = "";
  });

  const mineOnly = prEl(`${prefix}-filter-mine-only`);
  if (mineOnly) mineOnly.checked = false;

  if (cache) {
    cache.offset = 0;
  }
}

function renderPractitionerPostingSummary(prefix, summary, me) {
  const currency = summary?.currency_code || getActiveCurrency(me);

  prEl(`${prefix}-active-engagement-name`) && (prEl(`${prefix}-active-engagement-name`).textContent = safeText(summary?.engagement_name || getSelectedPractitionerEngagementName()));
  prEl(`${prefix}-active-engagement-code`) && (prEl(`${prefix}-active-engagement-code`).textContent = safeText(summary?.engagement_code || getSelectedPractitionerEngagementCode()));
  prEl(`${prefix}-last-activity-date`) && (prEl(`${prefix}-last-activity-date`).textContent = formatDateValue(summary?.last_activity_date));

  prEl(`${prefix}-kpi-total-items`) && (prEl(`${prefix}-kpi-total-items`).textContent = safeText(summary?.total_items ?? 0, "0"));
  prEl(`${prefix}-kpi-draft-count`) && (prEl(`${prefix}-kpi-draft-count`).textContent = safeText(summary?.draft_count ?? 0, "0"));
  prEl(`${prefix}-kpi-review-count`) && (prEl(`${prefix}-kpi-review-count`).textContent = safeText(summary?.review_count ?? 0, "0"));
  prEl(`${prefix}-kpi-posted-count`) && (prEl(`${prefix}-kpi-posted-count`).textContent = safeText(summary?.posted_count ?? 0, "0"));
  prEl(`${prefix}-kpi-total-amount`) && (prEl(`${prefix}-kpi-total-amount`).textContent = formatMoneyValue(summary?.total_amount ?? 0, currency));
}

function renderPractitionerPostingFilterOptions(prefix, filters) {
  const statusEl = prEl(`${prefix}-filter-status`);
  const eventTypeEl = prEl(`${prefix}-filter-event-type`);
  const preparedEl = prEl(`${prefix}-filter-prepared-by`);
  const reviewerEl = prEl(`${prefix}-filter-reviewer`);

  if (statusEl) {
    const current = statusEl.value;
    statusEl.innerHTML = `<option value="">All Statuses</option>${
      (filters?.statuses || [])
        .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(titleCaseToken(v))}</option>`)
        .join("")
    }`;
    statusEl.value = current || "";
  }

  if (eventTypeEl) {
    const current = eventTypeEl.value;
    eventTypeEl.innerHTML = `<option value="">All Events</option>${
      (filters?.event_types || [])
        .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(titleCaseToken(v))}</option>`)
        .join("")
    }`;
    eventTypeEl.value = current || "";
  }

  if (preparedEl) {
    const current = preparedEl.value;
    preparedEl.innerHTML = `<option value="">All Preparers</option>${
      (filters?.prepared_by_users || [])
        .map((u) => `<option value="${escapeHtml(u.user_id)}">${escapeHtml(u.user_name || `User ${u.user_id}`)}</option>`)
        .join("")
    }`;
    preparedEl.value = current || "";
  }

  if (reviewerEl) {
    const current = reviewerEl.value;
    reviewerEl.innerHTML = `<option value="">All Reviewers</option>${
      (filters?.reviewer_users || [])
        .map((u) => `<option value="${escapeHtml(u.user_id)}">${escapeHtml(u.user_name || `User ${u.user_id}`)}</option>`)
        .join("")
    }`;
    reviewerEl.value = current || "";
  }
}

function renderPractitionerPostingRows(prefix, rows, total, cache, config) {
  const tbody = prEl(`${prefix}-table-body`);
  const totalRowsEl = prEl(`${prefix}-total-rows`);
  const pageFromEl = prEl(`${prefix}-page-from`);
  const pageToEl = prEl(`${prefix}-page-to`);
  const currentPageEl = prEl(`${prefix}-current-page`);
  const emptyStateEl = prEl(`${prefix}-empty-state`);

  if (totalRowsEl) totalRowsEl.textContent = String(total || 0);

  const limit = cache?.limit || 25;
  const offset = cache?.offset || 0;
  const pageFrom = total > 0 ? offset + 1 : 0;
  const pageTo = Math.min(offset + (rows?.length || 0), total || 0);
  const currentPage = Math.floor(offset / limit) + 1;
  const currency = row?.currency_code || getActiveCurrency(me);

  if (pageFromEl) pageFromEl.textContent = String(pageFrom);
  if (pageToEl) pageToEl.textContent = String(pageTo);
  if (currentPageEl) currentPageEl.textContent = String(currentPage);

  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="py-10 text-center text-slate-500">
          ${escapeHtml(config?.emptyText || "No activity available for the selected engagement.")}
        </td>
      </tr>
    `;
    if (emptyStateEl) emptyStateEl.classList.remove("hidden");
    return;
  }

  if (emptyStateEl) emptyStateEl.classList.add("hidden");

  tbody.innerHTML = rows.map((row) => {
    const sourceLabel = row?.source_table
      ? `${row.source_table}${row?.source_id ? ` #${row.source_id}` : ""}`
      : "--";

    return `
      <tr class="border-b border-slate-100 last:border-b-0">
        <td class="py-3 pr-4 whitespace-nowrap">${escapeHtml(formatDateValue(row?.posting_date))}</td>
        <td class="py-3 pr-4 whitespace-nowrap font-medium text-slate-800">${escapeHtml(row?.reference_no || "--")}</td>
        <td class="py-3 pr-4 min-w-[260px]">${escapeHtml(row?.description || "--")}</td>
        <td class="py-3 pr-4 whitespace-nowrap">${escapeHtml(titleCaseToken(row?.event_type || "--"))}</td>
        <td class="py-3 pr-4 whitespace-nowrap">
          <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(row?.status)}">
            ${escapeHtml(titleCaseToken(row?.status || "--"))}
          </span>
        </td>
        <td class="py-3 pr-4 whitespace-nowrap">
          ${escapeHtml(formatMoneyValue(row?.amount || 0, currency))}
        </td>
        <td class="py-3 pr-4 whitespace-nowrap">${escapeHtml(row?.prepared_by_user_name || "--")}</td>
        <td class="py-3 pr-4 whitespace-nowrap">${escapeHtml(row?.reviewer_user_name || "--")}</td>
        <td class="py-3 pr-4 whitespace-nowrap text-slate-600">${escapeHtml(sourceLabel)}</td>
        <td class="py-3 whitespace-nowrap">
          <button
            type="button"
            class="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            data-posting-row-id="${escapeHtml(row?.id)}"
            data-posting-module="${escapeHtml(config?.moduleName || "")}"
            data-posting-source-table="${escapeHtml(row?.source_table || "")}"
            data-posting-source-id="${escapeHtml(row?.source_id || "")}"
          >
            View
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function setPractitionerPostingLoading(prefix, isLoading) {
  const refreshBtn = prEl(`${prefix}-refresh-btn`);
  const applyBtn = prEl(`${prefix}-filter-apply-btn`);
  const prevBtn = prEl(`${prefix}-prev-page-btn`);
  const nextBtn = prEl(`${prefix}-next-page-btn`);

  [refreshBtn, applyBtn, prevBtn, nextBtn].forEach((btn) => {
    if (!btn) return;
    btn.disabled = !!isLoading;
  });
}

async function loadPractitionerPostingSummary(me, config) {
  const companyId = me?.company_id || me?.companyId;
  const engagementId = getSelectedPractitionerEngagementId();
  if (!companyId || !engagementId || !config?.moduleName) return null;

  const json = await apiFetch(
    ENDPOINTS.practitionerPosting.summary(companyId, engagementId, config.moduleName)
  );

  const row = json?.row || null;
  const cache = getPractitionerPostingCache(config.moduleName);
  if (cache) cache.summary = row;
  renderPractitionerPostingSummary(config.prefix, row || {}, me);
  return row;
}

async function loadPractitionerPostingFilterOptions(me, config) {
  const companyId = me?.company_id || me?.companyId;
  const engagementId = getSelectedPractitionerEngagementId();
  if (!companyId || !engagementId || !config?.moduleName) return null;

  const json = await apiFetch(
    ENDPOINTS.practitionerPosting.filterOptions(companyId, engagementId, config.moduleName)
  );

  const row = json?.row || null;
  const cache = getPractitionerPostingCache(config.moduleName);
  if (cache) cache.filters = row;
  renderPractitionerPostingFilterOptions(config.prefix, row || {});
  return row;
}

async function loadPractitionerPostingActivity(me, config) {
  const companyId = me?.company_id || me?.companyId;
  const engagementId = getSelectedPractitionerEngagementId();
  if (!companyId || !engagementId || !config?.moduleName) return null;

  const cache = getPractitionerPostingCache(config.moduleName);
  const filters = collectPractitionerPostingFilters(config.prefix, cache);

  const json = await apiFetch(
    ENDPOINTS.practitionerPosting.activity(
      companyId,
      engagementId,
      config.moduleName,
      filters
    )
  );

  const rows = json?.rows || [];
  const total = Number(json?.total || 0);

  if (cache) {
    cache.rows = rows;
    cache.total = total;
    cache.limit = Number(json?.limit || cache.limit || 25);
    cache.offset = Number(json?.offset || cache.offset || 0);
  }

  renderPractitionerPostingRows(config.prefix, rows, total, cache, config);
  return { rows, total };
}

function bindPractitionerPostingModuleEvents(me) {
  if (PR_PRACTITIONER_POSTING_EVENTS_BOUND) return;
  PR_PRACTITIONER_POSTING_EVENTS_BOUND = true;

  [
    PR_NAV.journalEntries,
    PR_NAV.accountsReceivable,
    PR_NAV.accountsPayable,
    PR_NAV.leases,
    PR_NAV.ppe
  ].forEach((screen) => {
    const config = getPractitionerPostingScreenConfig(screen);
    if (!config) return;

    const { prefix, moduleName } = config;
    const cache = getPractitionerPostingCache(moduleName);

    prEl(`${prefix}-refresh-btn`)?.addEventListener("click", async () => {
      try {
        setPractitionerPostingLoading(prefix, true);
        await loadPractitionerPostingSummary(me, config);
        await loadPractitionerPostingActivity(me, config);
      } catch (err) {
        alert(err.message || "Failed to refresh posting activity.");
      } finally {
        setPractitionerPostingLoading(prefix, false);
      }
    });

    prEl(`${prefix}-filter-apply-btn`)?.addEventListener("click", async () => {
      try {
        if (cache) cache.offset = 0;
        setPractitionerPostingLoading(prefix, true);
        await loadPractitionerPostingActivity(me, config);
      } catch (err) {
        alert(err.message || "Failed to apply filters.");
      } finally {
        setPractitionerPostingLoading(prefix, false);
      }
    });

    prEl(`${prefix}-filter-reset-btn`)?.addEventListener("click", async () => {
      try {
        resetPractitionerPostingFilters(prefix, cache);
        setPractitionerPostingLoading(prefix, true);
        await loadPractitionerPostingActivity(me, config);
      } catch (err) {
        alert(err.message || "Failed to reset filters.");
      } finally {
        setPractitionerPostingLoading(prefix, false);
      }
    });

    prEl(`${prefix}-prev-page-btn`)?.addEventListener("click", async () => {
      try {
        if (cache) {
          cache.offset = Math.max(0, (cache.offset || 0) - (cache.limit || 25));
        }
        setPractitionerPostingLoading(prefix, true);
        await loadPractitionerPostingActivity(me, config);
      } catch (err) {
        alert(err.message || "Failed to load previous page.");
      } finally {
        setPractitionerPostingLoading(prefix, false);
      }
    });

    prEl(`${prefix}-next-page-btn`)?.addEventListener("click", async () => {
      try {
        if (cache) {
          const nextOffset = (cache.offset || 0) + (cache.limit || 25);
          if (nextOffset >= (cache.total || 0)) return;
          cache.offset = nextOffset;
        }
        setPractitionerPostingLoading(prefix, true);
        await loadPractitionerPostingActivity(me, config);
      } catch (err) {
        alert(err.message || "Failed to load next page.");
      } finally {
        setPractitionerPostingLoading(prefix, false);
      }
    });

    prEl(`${prefix}-filter-q`)?.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      try {
        if (cache) cache.offset = 0;
        setPractitionerPostingLoading(prefix, true);
        await loadPractitionerPostingActivity(me, config);
      } catch (err) {
        alert(err.message || "Failed to search posting activity.");
      } finally {
        setPractitionerPostingLoading(prefix, false);
      }
    });

    prEl(`${prefix}-open-posting-workspace-btn`)?.addEventListener("click", () => {
      alert("Posting workspace redirect will be wired once the source workflow route is finalised.");
    });

    prEl(`${prefix}-table-body`)?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-posting-row-id]");
      if (!btn) return;

      const rowId = btn.getAttribute("data-posting-row-id") || "";
      const sourceTable = btn.getAttribute("data-posting-source-table") || "";
      const sourceId = btn.getAttribute("data-posting-source-id") || "";

      alert(
        sourceTable && sourceId
          ? `Posting activity ${rowId}\nSource: ${sourceTable} #${sourceId}`
          : `Posting activity ${rowId}`
      );
    });
  });
}

async function renderPractitionerPostingModuleScreen(me, screen) {
  const config = getPractitionerPostingScreenConfig(screen);
  if (!config) return;

  const engagementId = getSelectedPractitionerEngagementId();
    renderPractitionerPostingSummary(config.prefix, {
      engagement_name: getSelectedPractitionerEngagementName(),
      engagement_code: getSelectedPractitionerEngagementCode(),
      total_items: 0,
      draft_count: 0,
      review_count: 0,
      posted_count: 0,
      total_amount: 0,
      last_activity_date: null
    }, me);

  bindPractitionerPostingModuleEvents(me);

  if (!engagementId) {
    const tbody = prEl(`${config.prefix}-table-body`);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="py-10 text-center text-slate-500">
            Select an engagement to view ${escapeHtml(config.title.toLowerCase())}.
          </td>
        </tr>
      `;
    }
    prEl(`${config.prefix}-total-rows`) && (prEl(`${config.prefix}-total-rows`).textContent = "0");
    prEl(`${config.prefix}-page-from`) && (prEl(`${config.prefix}-page-from`).textContent = "0");
    prEl(`${config.prefix}-page-to`) && (prEl(`${config.prefix}-page-to`).textContent = "0");
    return;
  }

  try {
    setPractitionerPostingLoading(config.prefix, true);
    await Promise.all([
      loadPractitionerPostingSummary(me, config),
      loadPractitionerPostingFilterOptions(me, config)
    ]);
    await loadPractitionerPostingActivity(me, config);
  } catch (err) {
    const tbody = prEl(`${config.prefix}-table-body`);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="py-10 text-center text-rose-600">
            ${escapeHtml(err.message || "Failed to load posting activity.")}
          </td>
        </tr>
      `;
    }
  } finally {
    setPractitionerPostingLoading(config.prefix, false);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatInt(value) {
  return Number(value || 0).toLocaleString();
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function getTeamCapacityLoadBandClass(loadBand) {
  if (loadBand === "overloaded") return "is-danger";
  if (loadBand === "near_capacity") return "is-warning";
  return "is-good";
}

function getTeamCapacityLoadBandLabel(loadBand) {
  if (loadBand === "overloaded") return "Overloaded";
  if (loadBand === "near_capacity") return "Near capacity";
  return "Available";
}

function renderTeamCapacityTableSkeleton() {
  return `
    <div class="pr-table-state">
      <div class="pr-loading">Loading team capacity…</div>
    </div>
  `;
}

function renderTeamCapacityEmptyDetail() {
  return `
    <div class="pr-empty-state">
      <div class="pr-empty-state__title">No user selected</div>
      <div class="pr-empty-state__desc">
        Select a team member from the allocation table to view detailed engagement load.
      </div>
    </div>
  `;
}

function formatDateLite(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatQueueTypeLabel(queueType) {
  switch (String(queueType || "").toLowerCase()) {
    case "reporting_item": return "Reporting item";
    case "deliverable": return "Deliverable";
    case "posting_activity": return "Posting activity";
    case "monthly_close": return "Monthly close";
    case "year_end": return "Year end";
    case "signoff": return "Signoff";
    default: return queueType || "—";
  }
}

function statusBadgeClass(status, isOverdue, isBlocked) {
  if (isBlocked || status === "blocked") return "status-blocked";
  if (isOverdue) return "status-overdue";

  const reviewStates = new Set([
    "ready",
    "pending_review",
    "in_review",
    "in_progress",
    "requested",
    "outstanding",
    "not_started"
  ]);
  if (reviewStates.has(String(status || "").toLowerCase())) return "status-review";
  return "status-ok";
}

function priorityBadgeClass(priority) {
  switch (String(priority || "").toLowerCase()) {
    case "urgent": return "priority-urgent";
    case "high": return "priority-high";
    case "low": return "priority-low";
    default: return "priority-normal";
  }
}

function formatDueMeta(row) {
  if (!row?.due_date) return "No due date";

  const due = new Date(row.due_date);
  if (Number.isNaN(due.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`;
  if (diffDays === 0) return "Due today";
  return `${diffDays} day${diffDays === 1 ? "" : "s"} remaining`;
}

function getReviewQueueStateKey() {
  const f = PR_REVIEW_QUEUE_CACHE.filters || {};
  return JSON.stringify({
    engagementId: PR_SELECTED_ENGAGEMENT?.id || null,
    queue_type: f.queue_type || "",
    status: f.status || "",
    priority: f.priority || "",
    mine_only: !!f.mine_only,
    q: f.q || "",
    limit: Number(f.limit || 100),
    offset: Number(f.offset || 0),
    quick: PR_REVIEW_QUEUE_ACTIVE_QUICK || "all"
  });
}

function getReviewQueueEngagementRequiredHtml() {
  return `
    <div class="rq-empty">
      Select an engagement first to open the review queue.
    </div>
  `;
}

function getReviewQueueLoadingRowHtml() {
  return `
    <tr>
      <td colspan="9" class="rq-empty">Loading review queue...</td>
    </tr>
  `;
}

function getReviewQueueEmptyRowHtml() {
  return `
    <tr>
      <td colspan="9" class="rq-empty">No review queue items found for the current filters.</td>
    </tr>
  `;
}

function buildReviewQueueQueryFilters() {
  const f = { ...(PR_REVIEW_QUEUE_CACHE.filters || {}) };

  if (PR_REVIEW_QUEUE_ACTIVE_QUICK === "review") {
    if (!f.status) f.status = "in_review";
  } else if (PR_REVIEW_QUEUE_ACTIVE_QUICK === "blocked") {
    f.status = "blocked";
  } else if (PR_REVIEW_QUEUE_ACTIVE_QUICK === "signoff") {
    f.queue_type = "signoff";
  } else if (PR_REVIEW_QUEUE_ACTIVE_QUICK === "mine") {
    f.mine_only = true;
  }

  return f;
}

async function fetchReviewQueueSummary(me) {
  const companyId = me?.company_id;
  const engagementId = PR_SELECTED_ENGAGEMENT?.id;

  if (!companyId || !engagementId) {
    PR_REVIEW_QUEUE_CACHE.summary = null;
    return null;
  }

  const url = ENDPOINTS.reviewQueue.summary(companyId, engagementId);
  const json = await apiFetch(url);
  const row = json?.row || null;
  PR_REVIEW_QUEUE_CACHE.summary = row;
  return row;
}

async function fetchReviewQueueRows(me) {
  const companyId = me?.company_id;
  const engagementId = PR_SELECTED_ENGAGEMENT?.id;

  if (!companyId || !engagementId) {
    PR_REVIEW_QUEUE_CACHE.rows = [];
    PR_REVIEW_QUEUE_CACHE.selectedRow = null;
    PR_REVIEW_QUEUE_CACHE.detail = null;
    return [];
  }

  const filters = buildReviewQueueQueryFilters();
  const url = ENDPOINTS.reviewQueue.list(companyId, engagementId, filters);
  const json = await apiFetch(url);
  const rows = Array.isArray(json?.rows) ? json.rows : [];

  PR_REVIEW_QUEUE_CACHE.rows = rows;

  const selected = PR_REVIEW_QUEUE_CACHE.selectedRow;
  if (selected) {
    const nextSelected = rows.find(
      (r) => String(r.queue_type) === String(selected.queue_type) && Number(r.source_id) === Number(selected.source_id)
    );
    PR_REVIEW_QUEUE_CACHE.selectedRow = nextSelected || rows[0] || null;
  } else {
    PR_REVIEW_QUEUE_CACHE.selectedRow = rows[0] || null;
  }

  return rows;
}

async function fetchReviewQueueDetail(me, row) {
  const companyId = me?.company_id;
  const engagementId = PR_SELECTED_ENGAGEMENT?.id;
  if (!companyId || !engagementId || !row?.queue_type || !row?.source_id) {
    PR_REVIEW_QUEUE_CACHE.detail = null;
    return null;
  }

  const url = ENDPOINTS.reviewQueue.get(companyId, engagementId, row.queue_type, row.source_id);
  const json = await apiFetch(url);
  const detail = json?.row || null;
  PR_REVIEW_QUEUE_CACHE.detail = detail;
  return detail;
}

function renderReviewQueueSummary() {
  const s = PR_REVIEW_QUEUE_CACHE.summary || {};

  const awaitingEl = document.getElementById("rqKpiAwaiting");
  const overdueEl = document.getElementById("rqKpiOverdue");
  const blockedEl = document.getElementById("rqKpiBlocked");
  const signoffEl = document.getElementById("rqKpiSignoff");
  const mineEl = document.getElementById("rqKpiMine");

  if (awaitingEl) awaitingEl.textContent = String(s.awaiting_review ?? 0);
  if (overdueEl) overdueEl.textContent = String(s.overdue_items ?? 0);
  if (blockedEl) blockedEl.textContent = String(s.blocked_items ?? 0);
  if (signoffEl) signoffEl.textContent = String(s.pending_signoffs ?? 0);
  if (mineEl) mineEl.textContent = String(s.my_queue ?? 0);
}

function renderReviewQueueRows() {
  const tbody = document.getElementById("rqTableBody");
  const footerText = document.getElementById("rqFooterText");
  if (!tbody) return;

  const rows = PR_REVIEW_QUEUE_CACHE.rows || [];
  const selected = PR_REVIEW_QUEUE_CACHE.selectedRow;

  if (!rows.length) {
    tbody.innerHTML = getReviewQueueEmptyRowHtml();
    if (footerText) footerText.textContent = "Showing 0 items";
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const selectedClass =
      selected &&
      String(selected.queue_type) === String(row.queue_type) &&
      Number(selected.source_id) === Number(row.source_id)
        ? "is-selected"
        : "";

    const statusClass = statusBadgeClass(row.status, row.is_overdue, row.is_blocked);
    const priorityClass = priorityBadgeClass(row.priority);

    return `
      <tr class="${selectedClass}" data-rq-row="1" data-queue-type="${escapeHtml(row.queue_type)}" data-source-id="${escapeHtml(row.source_id)}">
        <td><span class="rq-badge ${priorityClass}">${escapeHtml(row.priority || "normal")}</span></td>
        <td><div class="rq-item-title">${escapeHtml(formatQueueTypeLabel(row.queue_type))}</div></td>
        <td>
          <div class="rq-item-title">${escapeHtml(row.customer_name || "—")}</div>
          <div class="rq-item-meta">${escapeHtml(row.engagement_name || "—")} · ${escapeHtml(row.engagement_code || "—")}</div>
        </td>
        <td>
          <div class="rq-item-title">${escapeHtml(row.item_name || "—")}</div>
          <div class="rq-item-meta">${escapeHtml(row.item_code || "No code")}</div>
        </td>
        <td>${escapeHtml(row.assigned_user_name || "—")}</td>
        <td>${escapeHtml(row.reviewer_user_name || "—")}</td>
        <td><span class="rq-badge ${statusClass}">${escapeHtml(row.status || "—")}</span></td>
        <td>
          <div class="rq-item-title">${escapeHtml(formatDateLite(row.due_date))}</div>
          <div class="rq-item-meta">${escapeHtml(formatDueMeta(row))}</div>
        </td>
        <td><span class="rq-item-title">${escapeHtml(row.next_action || "Open")}</span></td>
      </tr>
    `;
  }).join("");

  const offset = Number(PR_REVIEW_QUEUE_CACHE.filters?.offset || 0);
  const limit = Number(PR_REVIEW_QUEUE_CACHE.filters?.limit || 100);
  const pageNo = Math.floor(offset / limit) + 1;

  if (footerText) footerText.textContent = `Showing ${rows.length} item${rows.length === 1 ? "" : "s"}`;
  const pageBtn = document.getElementById("rqPageBtn");
  if (pageBtn) pageBtn.textContent = `Page ${pageNo}`;
}

function renderReviewQueueDetail() {
  const panel = document.getElementById("rqDetailPanel");
  if (!panel) return;

  const row = PR_REVIEW_QUEUE_CACHE.detail || PR_REVIEW_QUEUE_CACHE.selectedRow;
  if (!row) {
    panel.innerHTML = `<div class="rq-empty">Select a queue item to view details.</div>`;
    return;
  }

  const assigned = row.assigned_user_name || "—";
  const reviewer = row.reviewer_user_name || "—";
  const status = row.status || "—";
  const priority = row.priority || "normal";
  const dueDate = formatDateLite(row.due_date || row.posting_date);
  const nextAction = row.next_action || "Open";
  const note =
    row.notes ||
    row.description ||
    "Open this source item to inspect full supporting details, workflow notes, and supporting context.";

  const timelineHtml = `
    <div class="rq-card" style="padding:14px; margin-top:16px;">
      <div class="rq-card-title" style="font-size:16px;">Activity trail</div>
      <div class="rq-card-subtitle">Latest known workflow context</div>

      <div class="rq-timeline" style="margin-top:12px;">
        <div class="rq-timeline-item">
          <div class="rq-dot"></div>
          <div class="rq-timeline-text">
            Status currently <strong>${escapeHtml(status)}</strong>
            <small>Latest synced state</small>
          </div>
        </div>

        <div class="rq-timeline-item">
          <div class="rq-dot"></div>
          <div class="rq-timeline-text">
            Assigned to <strong>${escapeHtml(assigned)}</strong>
            <small>Current owner</small>
          </div>
        </div>

        <div class="rq-timeline-item">
          <div class="rq-dot"></div>
          <div class="rq-timeline-text">
            Reviewer <strong>${escapeHtml(reviewer)}</strong>
            <small>Current review routing</small>
          </div>
        </div>
      </div>
    </div>
  `;

  panel.innerHTML = `
    <div class="rq-item-title" style="font-size:18px;">${escapeHtml(row.item_name || row.deliverable_name || row.step_name || row.description || "Selected item")}</div>
    <div class="rq-item-meta">
      ${escapeHtml(formatQueueTypeLabel(row.queue_type))} ·
      ${escapeHtml(row.item_code || row.reference_no || row.step_code || "No code")} ·
      ${escapeHtml(row.customer_name || "—")} ·
      ${escapeHtml(row.engagement_name || "—")}
    </div>

    <div class="rq-detail-grid">
      <div class="rq-detail-box">
        <div class="rq-detail-label">Status</div>
        <div class="rq-detail-value">${escapeHtml(status)}</div>
      </div>

      <div class="rq-detail-box">
        <div class="rq-detail-label">Priority</div>
        <div class="rq-detail-value">${escapeHtml(priority)}</div>
      </div>

      <div class="rq-detail-box">
        <div class="rq-detail-label">Assigned</div>
        <div class="rq-detail-value">${escapeHtml(assigned)}</div>
      </div>

      <div class="rq-detail-box">
        <div class="rq-detail-label">Reviewer</div>
        <div class="rq-detail-value">${escapeHtml(reviewer)}</div>
      </div>

      <div class="rq-detail-box">
        <div class="rq-detail-label">Due date</div>
        <div class="rq-detail-value">${escapeHtml(dueDate)}</div>
      </div>

      <div class="rq-detail-box">
        <div class="rq-detail-label">Next action</div>
        <div class="rq-detail-value">${escapeHtml(nextAction)}</div>
      </div>
    </div>

    <div class="rq-detail-note">${escapeHtml(note)}</div>

    <div class="rq-quick-actions">
      <button type="button" class="rq-btn" id="rqApproveBtn">Approve</button>
      <button type="button" class="rq-btn-ghost" id="rqReturnBtn">Return</button>
      <button type="button" class="rq-btn-soft" id="rqOpenSourceBtn">Open source</button>
      <button type="button" class="rq-btn-ghost" id="rqAssignBtn">Reassign</button>
      <button type="button" class="rq-btn-ghost" id="rqInReviewBtn">Mark in review</button>
      <button type="button" class="rq-btn-ghost" id="rqDeactivateBtn">Deactivate</button>
    </div>

    ${timelineHtml}
  `;
}

async function openReviewQueueAssignModal(me, row = null) {
  const item = row || PR_REVIEW_QUEUE_CACHE.selectedRow;
  if (!item) return;

  await prEnsureUsersCache(me);

  prFillUserSelect("rqAssignAssignedUser", PR_USERS_CACHE, {
    includeBlank: true,
    blankLabel: "Unassigned"
  });

  prFillUserSelect("rqAssignReviewerUser", PR_USERS_CACHE, {
    includeBlank: true,
    blankLabel: "No reviewer"
  });

  prMaybeSetValue("rqAssignQueueType", item.queue_type || "");
  prMaybeSetValue("rqAssignSourceId", item.source_id || "");
  prMaybeSetValue("rqAssignAssignedUser", item.assigned_user_id || "");
  prMaybeSetValue("rqAssignReviewerUser", item.reviewer_user_id || "");

  prSetModalOpen("rqAssignModal", true);
}

function closeReviewQueueAssignModal() {
  prSetModalOpen("rqAssignModal", false);
}

async function saveReviewQueueAssignModal(me) {
  const queueType = document.getElementById("rqAssignQueueType")?.value || "";
  const sourceId = document.getElementById("rqAssignSourceId")?.value || "";
  if (!queueType || !sourceId) return;

  await apiFetch(
    ENDPOINTS.reviewQueue.assign(me.company_id, queueType, sourceId),
    {
      method: "POST",
      body: JSON.stringify({
        assigned_user_id: document.getElementById("rqAssignAssignedUser")?.value || "",
        reviewer_user_id: document.getElementById("rqAssignReviewerUser")?.value || ""
      })
    }
  );

  closeReviewQueueAssignModal();
  await loadReviewQueueScreenData(me, { force: true });
}

function syncReviewQueueFiltersToUi() {
  const f = PR_REVIEW_QUEUE_CACHE.filters || {};

  const q = document.getElementById("rqSearchInput");
  const qt = document.getElementById("rqQueueTypeFilter");
  const st = document.getElementById("rqStatusFilter");
  const pr = document.getElementById("rqPriorityFilter");
  const lm = document.getElementById("rqLimitFilter");

  if (q) q.value = f.q || "";
  if (qt) qt.value = f.queue_type || "";
  if (st) st.value = f.status || "";
  if (pr) pr.value = f.priority || "";
  if (lm) lm.value = String(f.limit || 100);

  document.querySelectorAll("[data-rq-quick]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.rqQuick === PR_REVIEW_QUEUE_ACTIVE_QUICK);
  });
}

async function openSelectedReviewQueueDetail(me) {
  const row = PR_REVIEW_QUEUE_CACHE.selectedRow;
  if (!row) {
    PR_REVIEW_QUEUE_CACHE.detail = null;
    renderReviewQueueDetail();
    return;
  }

  try {
    await fetchReviewQueueDetail(me, row);
  } catch (err) {
    console.error("Failed to load review queue detail", err);
    PR_REVIEW_QUEUE_CACHE.detail = row;
  }

  renderReviewQueueDetail();
}

async function loadReviewQueueScreenData(me, { force = false } = {}) {
  if (PR_REVIEW_QUEUE_LOADING) return;
  PR_REVIEW_QUEUE_LOADING = true;

  try {
    const body = document.getElementById("rqTableBody");
    if (body) body.innerHTML = getReviewQueueLoadingRowHtml();

    const engagementId = PR_SELECTED_ENGAGEMENT?.id;
    if (!engagementId) {
      const panel = document.getElementById("rqDetailPanel");
      if (body) {
        body.innerHTML = `
          <tr><td colspan="9" class="rq-empty">Select an engagement first to view its review queue.</td></tr>
        `;
      }
      if (panel) panel.innerHTML = getReviewQueueEngagementRequiredHtml();

      PR_REVIEW_QUEUE_CACHE.summary = null;
      PR_REVIEW_QUEUE_CACHE.rows = [];
      PR_REVIEW_QUEUE_CACHE.selectedRow = null;
      PR_REVIEW_QUEUE_CACHE.detail = null;
      renderReviewQueueSummary();
      return;
    }

    await Promise.all([
      fetchReviewQueueSummary(me),
      fetchReviewQueueRows(me)
    ]);

    renderReviewQueueSummary();
    renderReviewQueueRows();
    await openSelectedReviewQueueDetail(me);
  } finally {
    PR_REVIEW_QUEUE_LOADING = false;
  }
}

function getReviewQueueSelectedRowByDom(target) {
  const tr = target?.closest?.("[data-rq-row='1']");
  if (!tr) return null;

  const queueType = tr.dataset.queueType || "";
  const sourceId = Number(tr.dataset.sourceId || 0);

  return (PR_REVIEW_QUEUE_CACHE.rows || []).find(
    (r) => String(r.queue_type) === String(queueType) && Number(r.source_id) === sourceId
  ) || null;
}

async function handleReviewQueueStatusAction(me, nextStatus) {
  const row = PR_REVIEW_QUEUE_CACHE.selectedRow;
  if (!row || !nextStatus) return;

  const companyId = me?.company_id;
  const engagementId = PR_SELECTED_ENGAGEMENT?.id;
  if (!companyId || !engagementId) return;

  await apiFetch(
    ENDPOINTS.reviewQueue.setStatus(companyId, engagementId, row.queue_type, row.source_id),
    {
      method: "POST",
      body: JSON.stringify({ status: nextStatus })
    }
  );

  await loadReviewQueueScreenData(me, { force: true });
}

function openReviewQueueSource(row) {
  if (!row) return;

  const queueType = String(row.queue_type || "").toLowerCase();

  switch (queueType) {
    case "reporting_item":
      if (typeof switchPractitionerScreen === "function") {
        switchPractitionerScreen(PR_NAV.reportingOverview, window.__PR_ME__ || null, { updateHash: true });
      } else {
        window.location.hash = `screen=${encodeURIComponent(PR_NAV.reportingOverview)}&itemId=${encodeURIComponent(row.source_id)}`;
      }
      break;

    case "deliverable":
      if (typeof switchPractitionerScreen === "function") {
        switchPractitionerScreen(PR_NAV.deliverables, window.__PR_ME__ || null, { updateHash: true });
      } else {
        window.location.hash = `screen=${encodeURIComponent(PR_NAV.deliverables)}&deliverableId=${encodeURIComponent(row.source_id)}`;
      }
      break;

    case "posting_activity": {
      const mod = String(row.module_name || "").toLowerCase();
      let screen = PR_NAV.dayToDayPostings;

      if (mod === "journal_entries") screen = PR_NAV.journalEntries;
      else if (mod === "accounts_receivable") screen = PR_NAV.accountsReceivable;
      else if (mod === "accounts_payable") screen = PR_NAV.accountsPayable;
      else if (mod === "leases") screen = PR_NAV.leases;
      else if (mod === "ppe") screen = PR_NAV.ppe;

      if (typeof switchPractitionerScreen === "function") {
        switchPractitionerScreen(screen, window.__PR_ME__ || null, { updateHash: true });
      } else {
        window.location.hash = `screen=${encodeURIComponent(screen)}&activityId=${encodeURIComponent(row.source_id)}`;
      }
      break;
    }

    case "monthly_close":
      if (typeof switchPractitionerScreen === "function") {
        switchPractitionerScreen(PR_NAV.monthlyCloseRoutines, window.__PR_ME__ || null, { updateHash: true });
      } else {
        window.location.hash = `screen=${encodeURIComponent(PR_NAV.monthlyCloseRoutines)}&taskId=${encodeURIComponent(row.source_id)}`;
      }
      break;

    case "year_end":
      if (typeof switchPractitionerScreen === "function") {
        switchPractitionerScreen(PR_NAV.yearEndReporting, window.__PR_ME__ || null, { updateHash: true });
      } else {
        window.location.hash = `screen=${encodeURIComponent(PR_NAV.yearEndReporting)}&taskId=${encodeURIComponent(row.source_id)}`;
      }
      break;

    case "signoff":
      if (typeof switchPractitionerScreen === "function") {
        switchPractitionerScreen(PR_NAV.partnerSignoff, window.__PR_ME__ || null, { updateHash: true });
      } else {
        window.location.hash = `screen=${encodeURIComponent(PR_NAV.partnerSignoff)}&stepId=${encodeURIComponent(row.source_id)}`;
      }
      break;

    default:
      break;
  }
}

async function bindReviewQueueEvents(me) {
  if (PR_REVIEW_QUEUE_EVENTS_BOUND) return;
  PR_REVIEW_QUEUE_EVENTS_BOUND = true;

  document.addEventListener("click", async (e) => {
    const quickBtn = e.target.closest("[data-rq-quick]");
    if (quickBtn) {
      const quick = quickBtn.dataset.rqQuick || "all";
      PR_REVIEW_QUEUE_ACTIVE_QUICK = quick;

      if (quick === "all") {
        PR_REVIEW_QUEUE_CACHE.filters.mine_only = false;
      } else if (quick === "mine") {
        PR_REVIEW_QUEUE_CACHE.filters.mine_only = true;
      } else {
        PR_REVIEW_QUEUE_CACHE.filters.mine_only = false;
      }

      if (quick !== "review") {
        if (PR_REVIEW_QUEUE_CACHE.filters.status === "in_review") {
          PR_REVIEW_QUEUE_CACHE.filters.status = "";
        }
      }

      if (quick !== "blocked") {
        if (PR_REVIEW_QUEUE_CACHE.filters.status === "blocked") {
          PR_REVIEW_QUEUE_CACHE.filters.status = "";
        }
      }

      if (quick !== "signoff") {
        if (PR_REVIEW_QUEUE_CACHE.filters.queue_type === "signoff") {
          PR_REVIEW_QUEUE_CACHE.filters.queue_type = "";
        }
      }

      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      syncReviewQueueFiltersToUi();
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqAssignBtn") {
      await openReviewQueueAssignModal(me, PR_REVIEW_QUEUE_CACHE.selectedRow);
      return;
    }

    if (e.target.id === "rqAssignModalCloseBtn" || e.target.id === "rqAssignModalCancelBtn") {
      closeReviewQueueAssignModal();
      return;
    }

    if (e.target.id === "rqAssignModalSaveBtn") {
      await saveReviewQueueAssignModal(me);
      return;
    }

    const row = getReviewQueueSelectedRowByDom(e.target);
    if (row) {
      PR_REVIEW_QUEUE_CACHE.selectedRow = row;
      PR_REVIEW_QUEUE_CACHE.detail = null;
      renderReviewQueueRows();
      await openSelectedReviewQueueDetail(me);
      return;
    }

    if (e.target.id === "rqSearchBtn") {
      const q = document.getElementById("rqSearchInput")?.value?.trim?.() || "";
      PR_REVIEW_QUEUE_CACHE.filters.q = q;
      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqRefreshBtn") {
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqPrevBtn") {
      const limit = Number(PR_REVIEW_QUEUE_CACHE.filters.limit || 100);
      const offset = Math.max(0, Number(PR_REVIEW_QUEUE_CACHE.filters.offset || 0) - limit);
      PR_REVIEW_QUEUE_CACHE.filters.offset = offset;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqNextBtn") {
      const limit = Number(PR_REVIEW_QUEUE_CACHE.filters.limit || 100);
      const offset = Number(PR_REVIEW_QUEUE_CACHE.filters.offset || 0) + limit;
      PR_REVIEW_QUEUE_CACHE.filters.offset = offset;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqApproveBtn") {
      await handleReviewQueueStatusAction(me, "approved");
      return;
    }

    if (e.target.id === "rqReturnBtn") {
      await handleReviewQueueStatusAction(me, "returned");
      return;
    }

    if (e.target.id === "rqInReviewBtn") {
      await handleReviewQueueStatusAction(me, "in_review");
      return;
    }

    if (e.target.id === "rqDeactivateBtn") {
      const row = PR_REVIEW_QUEUE_CACHE.selectedRow;
      if (!row) return;

      const ok = window.confirm("Deactivate this queue item?");
      if (!ok) return;

      await apiFetch(
        ENDPOINTS.reviewQueue.deactivate(me.company_id, PR_SELECTED_ENGAGEMENT.id, row.queue_type, row.source_id),
        { method: "POST" }
      );

      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqOpenSourceBtn") {
      openReviewQueueSource(PR_REVIEW_QUEUE_CACHE.selectedRow);
      return;
    }
  });

  document.querySelectorAll("[data-rq-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-rq-action");
      const id = btn.getAttribute("data-rq-id");
      const type = btn.getAttribute("data-rq-type");

      const row = (window.__PR_REVIEW_QUEUE_STATE__?.rows || []).find(
        (r) => String(r.source_id) === String(id) && String(r.queue_type) === String(type)
      );
      if (!row) return;

      try {
        await resolveReviewQueueAction(row, action);
        await renderReviewQueueScreen?.(window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to process review action.");
      }
    });
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id === "rqQueueTypeFilter") {
      PR_REVIEW_QUEUE_CACHE.filters.queue_type = e.target.value || "";
      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqStatusFilter") {
      PR_REVIEW_QUEUE_CACHE.filters.status = e.target.value || "";
      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqPriorityFilter") {
      PR_REVIEW_QUEUE_CACHE.filters.priority = e.target.value || "";
      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }

    if (e.target.id === "rqLimitFilter") {
      PR_REVIEW_QUEUE_CACHE.filters.limit = Number(e.target.value || 100);
      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      await loadReviewQueueScreenData(me, { force: true });
      return;
    }
  });

  document.addEventListener("keydown", async (e) => {
    if (e.target?.id === "rqSearchInput" && e.key === "Enter") {
      PR_REVIEW_QUEUE_CACHE.filters.q = e.target.value.trim();
      PR_REVIEW_QUEUE_CACHE.filters.offset = 0;
      await loadReviewQueueScreenData(me, { force: true });
    }
  });
}

async function renderReviewQueueScreen(me) {
  const screen = document.getElementById("screen-review-queue");
  if (!screen) return;

  await bindReviewQueueEvents(me);
  syncReviewQueueFiltersToUi();
  await loadReviewQueueScreenData(me, { force: false });
}


function prEsc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function prFmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function prStatusBadgeClass(status, isOverdue = false, isBlocked = false) {
  const s = String(status || "").toLowerCase();
  if (isBlocked || s === "blocked") return "status-blocked";
  if (isOverdue) return "status-overdue";
  if (["requested", "outstanding", "in_review", "not_started", "in_progress"].includes(s)) return "status-review";
  return "status-ok";
}

function prPriorityBadgeClass(priority) {
  switch (String(priority || "").toLowerCase()) {
    case "urgent": return "priority-urgent";
    case "high": return "priority-high";
    case "low": return "priority-low";
    default: return "priority-normal";
  }
}

function prDueMeta(value, status) {
  if (!value) return "No due date";

  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  const closed = ["completed", "received", "waived"].includes(String(status || "").toLowerCase());

  if (closed) return "Closed";
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Due today";
  return `${diff} day${diff === 1 ? "" : "s"} remaining`;
}

function getSelectedEngagementOrAlert() {
  if (!PR_SELECTED_ENGAGEMENT?.id) {
    alert("Select an engagement first.");
    return null;
  }
  return PR_SELECTED_ENGAGEMENT;
}

/* =========================
   DELIVERABLES
========================= */

async function fetchDeliverablesRows(me) {
  const engagement = getSelectedEngagementOrAlert();
  if (!engagement) {
    PR_DELIVERABLES_VIEW_CACHE.rows = [];
    PR_DELIVERABLES_VIEW_CACHE.selectedRow = null;
    return [];
  }

  const filters = { ...(PR_DELIVERABLES_VIEW_CACHE.filters || {}) };

  if (PR_DELIVERABLES_ACTIVE_QUICK === "outstanding") {
    filters.status = "outstanding";
  } else if (PR_DELIVERABLES_ACTIVE_QUICK === "received") {
    filters.status = "received";
  } else if (PR_DELIVERABLES_ACTIVE_QUICK === "in_review") {
    filters.status = "in_review";
  }

  const url = ENDPOINTS.engagementOps.deliverablesList(me.company_id, engagement.id, filters);
  const json = await apiFetch(url);
  const rows = Array.isArray(json?.rows) ? json.rows : [];

  PR_DELIVERABLES_VIEW_CACHE.rows = rows;

  const selected = PR_DELIVERABLES_VIEW_CACHE.selectedRow;
  if (selected) {
    PR_DELIVERABLES_VIEW_CACHE.selectedRow =
      rows.find((r) => Number(r.id) === Number(selected.id)) || rows[0] || null;
  } else {
    PR_DELIVERABLES_VIEW_CACHE.selectedRow = rows[0] || null;
  }

  return rows;
}

function renderDeliverablesSummary() {
  const rows = PR_DELIVERABLES_VIEW_CACHE.rows || [];
  const total = rows.length;
  const outstanding = rows.filter((r) => ["requested", "outstanding"].includes(String(r.status || "").toLowerCase())).length;
  const received = rows.filter((r) => String(r.status || "").toLowerCase() === "received").length;
  const overdue = rows.filter((r) => {
    if (!r.due_date) return false;
    const s = String(r.status || "").toLowerCase();
    if (["completed", "received", "waived"].includes(s)) return false;
    const d = new Date(r.due_date);
    const t = new Date();
    d.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return d < t;
  }).length;

  const totalEl = document.getElementById("dlKpiTotal");
  const outstandingEl = document.getElementById("dlKpiOutstanding");
  const receivedEl = document.getElementById("dlKpiReceived");
  const overdueEl = document.getElementById("dlKpiOverdue");

  if (totalEl) totalEl.textContent = String(total);
  if (outstandingEl) outstandingEl.textContent = String(outstanding);
  if (receivedEl) receivedEl.textContent = String(received);
  if (overdueEl) overdueEl.textContent = String(overdue);
}

function renderDeliverablesRows() {
  const tbody = document.getElementById("dlTableBody");
  const footer = document.getElementById("dlFooterText");
  if (!tbody) return;

  const rows = PR_DELIVERABLES_VIEW_CACHE.rows || [];
  const selected = PR_DELIVERABLES_VIEW_CACHE.selectedRow;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="dl-empty">No deliverables found for the current filters.</td></tr>`;
    if (footer) footer.textContent = "Showing 0 items";
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const isSelected = selected && Number(selected.id) === Number(row.id);
    const isOverdue = (() => {
      if (!row.due_date) return false;
      const s = String(row.status || "").toLowerCase();
      if (["completed", "received", "waived"].includes(s)) return false;
      const d = new Date(row.due_date);
      const t = new Date();
      d.setHours(0, 0, 0, 0);
      t.setHours(0, 0, 0, 0);
      return d < t;
    })();

    return `
      <tr class="${isSelected ? "is-selected" : ""}" data-dl-row="1" data-id="${prEsc(row.id)}">
        <td><span class="dl-badge ${prPriorityBadgeClass(row.priority)}">${prEsc(row.priority || "normal")}</span></td>
        <td>
          <div class="dl-item-title">${prEsc(row.deliverable_name || "—")}</div>
          <div class="dl-item-meta">${prEsc(row.deliverable_code || "No code")}</div>
        </td>
        <td>${prEsc(row.deliverable_type || "—")}</td>
        <td>${prEsc(row.assigned_user_name || row.assigned_user_id || "—")}</td>
        <td>${prEsc(row.reviewer_user_name || row.reviewer_user_id || "—")}</td>
        <td><span class="dl-badge ${prStatusBadgeClass(row.status, isOverdue, false)}">${prEsc(row.status || "—")}</span></td>
        <td>
          <div class="dl-item-title">${prEsc(prFmtDate(row.due_date))}</div>
          <div class="dl-item-meta">Received: ${prEsc(prFmtDate(row.received_date))}</div>
        </td>
        <td>${prEsc(row.document_count ?? 0)}</td>
      </tr>
    `;
  }).join("");

  const limit = Number(PR_DELIVERABLES_VIEW_CACHE.filters.limit || 100);
  const offset = Number(PR_DELIVERABLES_VIEW_CACHE.filters.offset || 0);
  const page = Math.floor(offset / limit) + 1;

  if (footer) footer.textContent = `Showing ${rows.length} item${rows.length === 1 ? "" : "s"}`;
  const pageBtn = document.getElementById("dlPageBtn");
  if (pageBtn) pageBtn.textContent = `Page ${page}`;
}

function renderDeliverablesDetail() {
  const panel = document.getElementById("dlDetailPanel");
  if (!panel) return;

  const row = PR_DELIVERABLES_VIEW_CACHE.selectedRow;
  if (!row) {
    panel.innerHTML = `<div class="dl-empty">Select a deliverable to view details.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="dl-item-title" style="font-size:18px;">${prEsc(row.deliverable_name || "Deliverable")}</div>
    <div class="dl-item-meta">${prEsc(row.deliverable_code || "No code")} · ${prEsc(row.deliverable_type || "—")}</div>

    <div class="dl-detail-grid">
      <div class="dl-detail-box">
        <div class="dl-detail-label">Status</div>
        <div class="dl-detail-value">${prEsc(row.status || "—")}</div>
      </div>
      <div class="dl-detail-box">
        <div class="dl-detail-label">Priority</div>
        <div class="dl-detail-value">${prEsc(row.priority || "normal")}</div>
      </div>
      <div class="dl-detail-box">
        <div class="dl-detail-label">Assigned</div>
        <div class="dl-detail-value">${prEsc(row.assigned_user_name || row.assigned_user_id || "—")}</div>
      </div>
      <div class="dl-detail-box">
        <div class="dl-detail-label">Reviewer</div>
        <div class="dl-detail-value">${prEsc(row.reviewer_user_name || row.reviewer_user_id || "—")}</div>
      </div>
      <div class="dl-detail-box">
        <div class="dl-detail-label">Due date</div>
        <div class="dl-detail-value">${prEsc(prFmtDate(row.due_date))}</div>
      </div>
      <div class="dl-detail-box">
        <div class="dl-detail-label">Received date</div>
        <div class="dl-detail-value">${prEsc(prFmtDate(row.received_date))}</div>
      </div>
    </div>

    <div class="dl-detail-note">${prEsc(row.notes || "No notes recorded for this deliverable.")}</div>

    <div class="dl-quick-actions">
      <button id="dlEditBtn" class="dl-btn-ghost" type="button">Edit</button>
      <button id="dlMarkRequestedBtn" class="dl-btn-ghost" type="button">Mark requested</button>
      <button id="dlMarkOutstandingBtn" class="dl-btn-ghost" type="button">Mark outstanding</button>
      <button id="dlMarkReceivedBtn" class="dl-btn-soft" type="button">Mark received</button>
      <button id="dlMarkReviewBtn" class="dl-btn-ghost" type="button">Mark in review</button>
      <button id="dlMarkCompleteBtn" class="dl-btn" type="button">Complete</button>
      <button id="dlDeactivateBtn" class="dl-btn-ghost" type="button">Deactivate</button>
    </div>
  `;
}

function syncDeliverablesFiltersUi() {
  const f = PR_DELIVERABLES_VIEW_CACHE.filters || {};
  const statusEl = document.getElementById("dlStatusFilter");
  const priorityEl = document.getElementById("dlPriorityFilter");
  const typeEl = document.getElementById("dlTypeFilter");
  const searchEl = document.getElementById("dlSearchInput");
  const limitEl = document.getElementById("dlLimitFilter");

  if (statusEl) statusEl.value = f.status || "";
  if (priorityEl) priorityEl.value = f.priority || "";
  if (typeEl) typeEl.value = f.deliverable_type || "";
  if (searchEl) searchEl.value = f.q || "";
  if (limitEl) limitEl.value = String(f.limit || 100);

  document.querySelectorAll("[data-dl-quick]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.dlQuick === PR_DELIVERABLES_ACTIVE_QUICK);
  });
}

async function loadDeliverablesScreen(me) {
  if (PR_DELIVERABLES_VIEW_LOADING) return;
  PR_DELIVERABLES_VIEW_LOADING = true;

  try {
    const tbody = document.getElementById("dlTableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="dl-empty">Loading deliverables...</td></tr>`;

    const engagement = PR_SELECTED_ENGAGEMENT;
    if (!engagement?.id) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="dl-empty">Select an engagement first to view deliverables.</td></tr>`;
      const panel = document.getElementById("dlDetailPanel");
      if (panel) panel.innerHTML = `<div class="dl-empty">Select an engagement first.</div>`;
      PR_DELIVERABLES_VIEW_CACHE.rows = [];
      PR_DELIVERABLES_VIEW_CACHE.selectedRow = null;
      renderDeliverablesSummary();
      return;
    }

    await fetchDeliverablesRows(me);
    renderDeliverablesSummary();
    renderDeliverablesRows();
    renderDeliverablesDetail();
  } finally {
    PR_DELIVERABLES_VIEW_LOADING = false;
  }
}

async function bindDeliverablesScreen(me) {
  if (PR_DELIVERABLES_VIEW_EVENTS_BOUND) return;
  PR_DELIVERABLES_VIEW_EVENTS_BOUND = true;

  document.addEventListener("click", async (e) => {
    const quickBtn = e.target.closest("[data-dl-quick]");
    if (quickBtn) {
      PR_DELIVERABLES_ACTIVE_QUICK = quickBtn.dataset.dlQuick || "all";
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      syncDeliverablesFiltersUi();
      await loadDeliverablesScreen(me);
      return;
    }

    const createWpBtn = e.target.closest("[data-deliv-create-wp]");
    if (createWpBtn) {
      e.stopPropagation();
      const id = createWpBtn.getAttribute("data-deliv-create-wp");
      const row = (window.__PR_DELIVERABLES_STATE__?.rows || []).find((r) => String(r.id) === String(id));
      if (!row) return;

      try {
        const wp = await createWorkingPaperFromDeliverable(row);
        alert(`Working paper created: ${wp.paper_name || wp.id}`);
        await renderDeliverablesRegisterScreen?.(window.__PR_ME__);
        await refreshEngagementWorkflowScreens?.(window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to create working paper.");
      }
      return;
    }

    if (e.target.id === "dlNewBtn") {
      await openDeliverableModal(me, null);
      return;
    }

    if (e.target.id === "dlEditBtn") {
      const selected = PR_DELIVERABLES_VIEW_CACHE.selectedRow;
      if (!selected) return;
      await openDeliverableModal(me, selected);
      return;
    }

    if (e.target.id === "dlModalCloseBtn" || e.target.id === "dlModalCancelBtn") {
      closeDeliverableModal();
      return;
    }

    if (e.target.id === "dlModalSaveBtn") {
      await saveDeliverableModal(me);
      return;
    }

    const rowEl = e.target.closest("[data-dl-row='1']");
    if (rowEl) {
      const id = Number(rowEl.dataset.id || 0);
      PR_DELIVERABLES_VIEW_CACHE.selectedRow =
        (PR_DELIVERABLES_VIEW_CACHE.rows || []).find((r) => Number(r.id) === id) || null;
      renderDeliverablesRows();
      renderDeliverablesDetail();
      return;
    }

    if (e.target.id === "dlSearchBtn") {
      PR_DELIVERABLES_VIEW_CACHE.filters.q = (document.getElementById("dlSearchInput")?.value || "").trim();
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      await loadDeliverablesScreen(me);
      return;
    }

    if (e.target.id === "dlRefreshBtn") {
      await loadDeliverablesScreen(me);
      return;
    }

    if (e.target.id === "dlPrevBtn") {
      const limit = Number(PR_DELIVERABLES_VIEW_CACHE.filters.limit || 100);
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = Math.max(0, Number(PR_DELIVERABLES_VIEW_CACHE.filters.offset || 0) - limit);
      await loadDeliverablesScreen(me);
      return;
    }

    if (e.target.id === "dlNextBtn") {
      const limit = Number(PR_DELIVERABLES_VIEW_CACHE.filters.limit || 100);
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = Number(PR_DELIVERABLES_VIEW_CACHE.filters.offset || 0) + limit;
      await loadDeliverablesScreen(me);
      return;
    }

    const selected = PR_DELIVERABLES_VIEW_CACHE.selectedRow;
    if (!selected?.id) return;

    async function setStatus(status, extra = {}) {
      await apiFetch(
        ENDPOINTS.engagementOps.deliverablesSetStatus(me.company_id, selected.id),
        {
          method: "POST",
          body: JSON.stringify({ status, ...extra })
        }
      );
      await loadDeliverablesScreen(me);
      await refreshEngagementWorkflowScreens(me);
    }

    if (e.target.id === "dlMarkRequestedBtn") return setStatus("requested");
    if (e.target.id === "dlMarkOutstandingBtn") return setStatus("outstanding");
    if (e.target.id === "dlMarkReviewBtn") return setStatus("in_review");
    if (e.target.id === "dlMarkCompleteBtn") return setStatus("completed");
    if (e.target.id === "dlMarkReceivedBtn") return setStatus("received", {
      received_date: new Date().toISOString().slice(0, 10)
    });

    if (e.target.id === "dlDeactivateBtn") {
      const ok = window.confirm("Deactivate this deliverable?");
      if (!ok) return;

      await apiFetch(
        ENDPOINTS.engagementOps.deliverablesDeactivate(me.company_id, selected.id),
        { method: "POST" }
      );
      await loadDeliverablesScreen(me);
      await refreshEngagementWorkflowScreens(me);
    }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id === "dlStatusFilter") {
      PR_DELIVERABLES_VIEW_CACHE.filters.status = e.target.value || "";
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      await loadDeliverablesScreen(me);
      return;
    }

    if (e.target.id === "dlPriorityFilter") {
      PR_DELIVERABLES_VIEW_CACHE.filters.priority = e.target.value || "";
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      await loadDeliverablesScreen(me);
      return;
    }

    if (e.target.id === "dlTypeFilter") {
      PR_DELIVERABLES_VIEW_CACHE.filters.deliverable_type = e.target.value || "";
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      await loadDeliverablesScreen(me);
      return;
    }

    if (e.target.id === "dlLimitFilter") {
      PR_DELIVERABLES_VIEW_CACHE.filters.limit = Number(e.target.value || 100);
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      await loadDeliverablesScreen(me);
    }
  });

  document.addEventListener("keydown", async (e) => {
    if (e.target?.id === "dlSearchInput" && e.key === "Enter") {
      PR_DELIVERABLES_VIEW_CACHE.filters.q = e.target.value.trim();
      PR_DELIVERABLES_VIEW_CACHE.filters.offset = 0;
      await loadDeliverablesScreen(me);
    }
  });
}

async function renderDeliverablesScreen(me) {
  syncDeliverablesFiltersUi();
  await bindDeliverablesScreen(me);
  await loadDeliverablesScreen(me);
}

/* =========================
   PARTNER SIGNOFF
========================= */

async function fetchSignoffRows(me) {
  const engagement = getSelectedEngagementOrAlert();
  if (!engagement) {
    PR_SIGNOFF_VIEW_CACHE.rows = [];
    PR_SIGNOFF_VIEW_CACHE.selectedRow = null;
    return [];
  }

  const filters = { ...(PR_SIGNOFF_VIEW_CACHE.filters || {}) };

  if (PR_SIGNOFF_ACTIVE_QUICK === "pending") {
    filters.status = "in_progress";
  } else if (PR_SIGNOFF_ACTIVE_QUICK === "completed") {
    filters.status = "completed";
  } else if (PR_SIGNOFF_ACTIVE_QUICK === "blocked") {
    filters.status = "blocked";
  }

  const url = ENDPOINTS.engagementOps.signoffStepsList(me.company_id, engagement.id, filters);
  const json = await apiFetch(url);
  const rows = Array.isArray(json?.rows) ? json.rows : [];

  PR_SIGNOFF_VIEW_CACHE.rows = rows;

  const selected = PR_SIGNOFF_VIEW_CACHE.selectedRow;
  if (selected) {
    PR_SIGNOFF_VIEW_CACHE.selectedRow =
      rows.find((r) => Number(r.id) === Number(selected.id)) || rows[0] || null;
  } else {
    PR_SIGNOFF_VIEW_CACHE.selectedRow = rows[0] || null;
  }

  return rows;
}

function renderSignoffSummary() {
  const rows = PR_SIGNOFF_VIEW_CACHE.rows || [];
  const total = rows.length;
  const pending = rows.filter((r) => ["not_started", "in_progress"].includes(String(r.status || "").toLowerCase())).length;
  const completed = rows.filter((r) => String(r.status || "").toLowerCase() === "completed").length;
  const risk = rows.filter((r) => {
    const s = String(r.status || "").toLowerCase();
    if (s === "blocked") return true;
    if (!r.due_date) return false;
    if (["completed", "waived"].includes(s)) return false;
    const d = new Date(r.due_date);
    const t = new Date();
    d.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return d < t;
  }).length;

  const totalEl = document.getElementById("psKpiTotal");
  const pendingEl = document.getElementById("psKpiPending");
  const completedEl = document.getElementById("psKpiCompleted");
  const riskEl = document.getElementById("psKpiRisk");

  if (totalEl) totalEl.textContent = String(total);
  if (pendingEl) pendingEl.textContent = String(pending);
  if (completedEl) completedEl.textContent = String(completed);
  if (riskEl) riskEl.textContent = String(risk);
}

function renderSignoffRows() {
  const tbody = document.getElementById("psTableBody");
  const footer = document.getElementById("psFooterText");
  if (!tbody) return;

  const rows = PR_SIGNOFF_VIEW_CACHE.rows || [];
  const selected = PR_SIGNOFF_VIEW_CACHE.selectedRow;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="ps-empty">No sign-off steps found for the current filters.</td></tr>`;
    if (footer) footer.textContent = "Showing 0 items";
    return;
  }

  tbody.innerHTML = rows.map((row) => {
    const isSelected = selected && Number(selected.id) === Number(row.id);

    const isOverdue = (() => {
      if (!row.due_date) return false;
      const s = String(row.status || "").toLowerCase();
      if (["completed", "waived"].includes(s)) return false;
      const d = new Date(row.due_date);
      const t = new Date();
      d.setHours(0, 0, 0, 0);
      t.setHours(0, 0, 0, 0);
      return d < t;
    })();

    return `
      <tr class="${isSelected ? "is-selected" : ""}" data-ps-row="1" data-id="${prEsc(row.id)}">
        <td>
          <div class="ps-item-title">${prEsc(row.step_name || "—")}</div>
        </td>
        <td>${prEsc(row.step_code || "—")}</td>
        <td>${prEsc(row.assigned_user_name || row.assigned_user_id || "—")}</td>
        <td><span class="ps-badge ${prStatusBadgeClass(row.status, isOverdue, row.status === "blocked")}">${prEsc(row.status || "—")}</span></td>
        <td>${prEsc(prFmtDate(row.reporting_year_end))}</td>
        <td>${prEsc(prFmtDate(row.due_date))}</td>
        <td>${row.is_required ? "Yes" : "No"}</td>
      </tr>
    `;
  }).join("");

  const limit = Number(PR_SIGNOFF_VIEW_CACHE.filters.limit || 100);
  const offset = Number(PR_SIGNOFF_VIEW_CACHE.filters.offset || 0);
  const page = Math.floor(offset / limit) + 1;

  if (footer) footer.textContent = `Showing ${rows.length} item${rows.length === 1 ? "" : "s"}`;
  const pageBtn = document.getElementById("psPageBtn");
  if (pageBtn) pageBtn.textContent = `Page ${page}`;
}

function renderSignoffDetail() {
  const panel = document.getElementById("psDetailPanel");
  if (!panel) return;

  const row = PR_SIGNOFF_VIEW_CACHE.selectedRow;
  if (!row) {
    panel.innerHTML = `<div class="ps-empty">Select a sign-off step to view details.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="ps-item-title" style="font-size:18px;">${prEsc(row.step_name || "Signoff step")}</div>
    <div class="ps-item-meta">${prEsc(row.step_code || "No code")} · Reporting year end ${prEsc(prFmtDate(row.reporting_year_end))}</div>

    <div class="ps-detail-grid">
      <div class="ps-detail-box">
        <div class="ps-detail-label">Status</div>
        <div class="ps-detail-value">${prEsc(row.status || "—")}</div>
      </div>
      <div class="ps-detail-box">
        <div class="ps-detail-label">Assigned</div>
        <div class="ps-detail-value">${prEsc(row.assigned_user_name || row.assigned_user_id || "—")}</div>
      </div>
      <div class="ps-detail-box">
        <div class="ps-detail-label">Due date</div>
        <div class="ps-detail-value">${prEsc(prFmtDate(row.due_date))}</div>
      </div>
      <div class="ps-detail-box">
        <div class="ps-detail-label">Completed at</div>
        <div class="ps-detail-value">${prEsc(prFmtDate(row.completed_at))}</div>
      </div>
      <div class="ps-detail-box">
        <div class="ps-detail-label">Required</div>
        <div class="ps-detail-value">${row.is_required ? "Yes" : "No"}</div>
      </div>
      <div class="ps-detail-box">
        <div class="ps-detail-label">Sort order</div>
        <div class="ps-detail-value">${prEsc(row.sort_order ?? 0)}</div>
      </div>
    </div>

    <div class="ps-detail-note">${prEsc(row.notes || "No notes recorded for this sign-off step.")}</div>

    <div class="ps-quick-actions">
      <button id="psEditBtn" class="ps-btn-ghost" type="button">Edit</button>
      <button id="psMarkProgressBtn" class="ps-btn-ghost" type="button">In progress</button>
      <button id="psMarkBlockedBtn" class="ps-btn-ghost" type="button">Blocked</button>
      <button id="psMarkCompletedBtn" class="ps-btn" type="button">Complete</button>
      <button id="psMarkWaivedBtn" class="ps-btn-soft" type="button">Waive</button>
      <button id="psDeactivateBtn" class="ps-btn-ghost" type="button">Deactivate</button>
    </div>
  `;
}

function syncSignoffFiltersUi() {
  const f = PR_SIGNOFF_VIEW_CACHE.filters || {};

  const statusEl = document.getElementById("psStatusFilter");
  const yearEl = document.getElementById("psYearEndFilter");
  const assignedEl = document.getElementById("psAssignedFilter");
  const searchEl = document.getElementById("psSearchInput");
  const limitEl = document.getElementById("psLimitFilter");

  if (statusEl) statusEl.value = f.status || "";
  if (yearEl) yearEl.value = f.reporting_year_end || "";
  if (assignedEl) assignedEl.value = f.assigned_user_id || "";
  if (searchEl) searchEl.value = f.q || "";
  if (limitEl) limitEl.value = String(f.limit || 100);

  document.querySelectorAll("[data-ps-quick]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.psQuick === PR_SIGNOFF_ACTIVE_QUICK);
  });
}

async function loadSignoffScreen(me) {
  if (PR_SIGNOFF_VIEW_LOADING) return;
  PR_SIGNOFF_VIEW_LOADING = true;

  try {
    const tbody = document.getElementById("psTableBody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="ps-empty">Loading sign-off steps...</td></tr>`;

    const engagement = PR_SELECTED_ENGAGEMENT;
    if (!engagement?.id) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="ps-empty">Select an engagement first to view sign-off steps.</td></tr>`;
      const panel = document.getElementById("psDetailPanel");
      if (panel) panel.innerHTML = `<div class="ps-empty">Select an engagement first.</div>`;
      PR_SIGNOFF_VIEW_CACHE.rows = [];
      PR_SIGNOFF_VIEW_CACHE.selectedRow = null;
      renderSignoffSummary();
      return;
    }

    await fetchSignoffRows(me);
    renderSignoffSummary();
    renderSignoffRows();
    renderSignoffDetail();
  } finally {
    PR_SIGNOFF_VIEW_LOADING = false;
  }
}

async function bindSignoffScreen(me) {
  if (PR_SIGNOFF_VIEW_EVENTS_BOUND) return;
  PR_SIGNOFF_VIEW_EVENTS_BOUND = true;

  document.addEventListener("click", async (e) => {
    const quickBtn = e.target.closest("[data-ps-quick]");
    if (quickBtn) {
      PR_SIGNOFF_ACTIVE_QUICK = quickBtn.dataset.psQuick || "all";
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      syncSignoffFiltersUi();
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psNewBtn") {
      await openSignoffModal(me, null);
      return;
    }

    if (e.target.id === "psEditBtn") {
      const selected = PR_SIGNOFF_VIEW_CACHE.selectedRow;
      if (!selected) return;
      await openSignoffModal(me, selected);
      return;
    }

    if (e.target.id === "psModalCloseBtn" || e.target.id === "psModalCancelBtn") {
      closeSignoffModal();
      return;
    }

    if (e.target.id === "psModalSaveBtn") {
      await saveSignoffModal(me);
      return;
    }

    const rowEl = e.target.closest("[data-ps-row='1']");
    if (rowEl) {
      const id = Number(rowEl.dataset.id || 0);
      PR_SIGNOFF_VIEW_CACHE.selectedRow =
        (PR_SIGNOFF_VIEW_CACHE.rows || []).find((r) => Number(r.id) === id) || null;
      renderSignoffRows();
      renderSignoffDetail();
      return;
    }

    if (e.target.id === "psSearchBtn") {
      PR_SIGNOFF_VIEW_CACHE.filters.q = (document.getElementById("psSearchInput")?.value || "").trim();
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psRefreshBtn") {
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psPrevBtn") {
      const limit = Number(PR_SIGNOFF_VIEW_CACHE.filters.limit || 100);
      PR_SIGNOFF_VIEW_CACHE.filters.offset = Math.max(0, Number(PR_SIGNOFF_VIEW_CACHE.filters.offset || 0) - limit);
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psNextBtn") {
      const limit = Number(PR_SIGNOFF_VIEW_CACHE.filters.limit || 100);
      PR_SIGNOFF_VIEW_CACHE.filters.offset = Number(PR_SIGNOFF_VIEW_CACHE.filters.offset || 0) + limit;
      await loadSignoffScreen(me);
      return;
    }

    const selected = PR_SIGNOFF_VIEW_CACHE.selectedRow;
    if (!selected?.id) return;

    async function setStatus(status, extra = {}) {
      await apiFetch(
        ENDPOINTS.engagementOps.signoffStepsSetStatus(me.company_id, selected.id),
        {
          method: "POST",
          body: JSON.stringify({ status, ...extra })
        }
      );
      await loadSignoffScreen(me);
    }

    if (e.target.id === "psMarkProgressBtn") return setStatus("in_progress");
    if (e.target.id === "psMarkBlockedBtn") return setStatus("blocked");
    if (e.target.id === "psMarkWaivedBtn") return setStatus("waived");
    if (e.target.id === "psMarkCompletedBtn") {
      return setStatus("completed", {
        completed_at: new Date().toISOString()
      });
    }

    if (e.target.id === "psDeactivateBtn") {
      const ok = window.confirm("Deactivate this sign-off step?");
      if (!ok) return;

      await apiFetch(
        ENDPOINTS.engagementOps.signoffStepsDeactivate(me.company_id, selected.id),
        { method: "POST" }
      );
      await loadSignoffScreen(me);
    }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id === "psStatusFilter") {
      PR_SIGNOFF_VIEW_CACHE.filters.status = e.target.value || "";
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psYearEndFilter") {
      PR_SIGNOFF_VIEW_CACHE.filters.reporting_year_end = e.target.value || "";
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psAssignedFilter") {
      PR_SIGNOFF_VIEW_CACHE.filters.assigned_user_id = e.target.value || "";
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      await loadSignoffScreen(me);
      return;
    }

    if (e.target.id === "psLimitFilter") {
      PR_SIGNOFF_VIEW_CACHE.filters.limit = Number(e.target.value || 100);
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      await loadSignoffScreen(me);
    }
  });

  document.addEventListener("keydown", async (e) => {
    if (e.target?.id === "psSearchInput" && e.key === "Enter") {
      PR_SIGNOFF_VIEW_CACHE.filters.q = e.target.value.trim();
      PR_SIGNOFF_VIEW_CACHE.filters.offset = 0;
      await loadSignoffScreen(me);
    }
  });

  document.getElementById("openPartnerSignoffBtn")?.addEventListener("click", async () => {
    await openPartnerSignoffWithGate(window.__PR_ME__);
  });
}

async function renderPartnerSignoffScreen(me) {
  syncSignoffFiltersUi();
  await populateSignoffAssignedFilter(me);
  await bindSignoffScreen(me);
  await loadSignoffScreen(me);
}

function prSetModalOpen(modalId, open) {
  const el = document.getElementById(modalId);
  if (!el) return;
  if (open) {
    el.classList.remove("hidden");
    el.classList.add("flex");
  } else {
    el.classList.add("hidden");
    el.classList.remove("flex");
  }
}

function prFillUserSelect(selectId, users, { includeBlank = true, blankLabel = "Select" } = {}) {
  const el = document.getElementById(selectId);
  if (!el) return;

  const opts = [];
  if (includeBlank) {
    opts.push(`<option value="">${prEsc(blankLabel)}</option>`);
  }

  (users || []).forEach((u) => {
    const id = u?.id ?? "";
    const name = [u?.first_name || "", u?.last_name || ""].join(" ").trim() || u?.email || `User ${id}`;
    opts.push(`<option value="${prEsc(id)}">${prEsc(name)}</option>`);
  });

  el.innerHTML = opts.join("");
}

async function prEnsureUsersCache(me) {
  if (Array.isArray(PR_USERS_CACHE) && PR_USERS_CACHE.length) return PR_USERS_CACHE;

  if (typeof ENDPOINTS?.users?.list === "function") {
    const json = await apiFetch(ENDPOINTS.users.list(me.company_id));
    PR_USERS_CACHE = Array.isArray(json?.rows) ? json.rows : [];
    return PR_USERS_CACHE;
  }

  if (typeof ENDPOINTS?.settings?.usersList === "function") {
    const json = await apiFetch(ENDPOINTS.settings.usersList(me.company_id));
    PR_USERS_CACHE = Array.isArray(json?.rows) ? json.rows : [];
    return PR_USERS_CACHE;
  }

  return PR_USERS_CACHE || [];
}

function prMaybeSetValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value == null ? "" : String(value);
}

function prMaybeSetChecked(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!value;
}

async function openDeliverableModal(me, row = null) {
  await prEnsureUsersCache(me);

  prFillUserSelect("dlFormAssignedUser", PR_USERS_CACHE, { includeBlank: true, blankLabel: "Unassigned" });
  prFillUserSelect("dlFormReviewerUser", PR_USERS_CACHE, { includeBlank: true, blankLabel: "No reviewer" });

  const isEdit = !!row?.id;
  const titleEl = document.getElementById("dlModalTitle");
  if (titleEl) titleEl.textContent = isEdit ? "Edit Deliverable" : "New Deliverable";

  prMaybeSetValue("dlFormId", row?.id || "");
  prMaybeSetValue("dlFormName", row?.deliverable_name || "");
  prMaybeSetValue("dlFormCode", row?.deliverable_code || "");
  prMaybeSetValue("dlFormType", row?.deliverable_type || "");
  prMaybeSetValue("dlFormRequestedFrom", row?.requested_from || "");
  prMaybeSetValue("dlFormAssignedUser", row?.assigned_user_id || "");
  prMaybeSetValue("dlFormReviewerUser", row?.reviewer_user_id || "");
  prMaybeSetValue("dlFormStatus", row?.status || "not_started");
  prMaybeSetValue("dlFormPriority", row?.priority || "normal");
  prMaybeSetValue("dlFormDueDate", row?.due_date || "");
  prMaybeSetValue("dlFormReceivedDate", row?.received_date || "");
  prMaybeSetValue("dlFormNotes", row?.notes || "");

  prSetModalOpen("dlModal", true);
}

function closeDeliverableModal() {
  prSetModalOpen("dlModal", false);
}

async function saveDeliverableModal(me) {
  const engagement = getSelectedEngagementOrAlert();
  if (!engagement) return;

  const id = document.getElementById("dlFormId")?.value?.trim() || "";
  const body = {
    deliverable_name: document.getElementById("dlFormName")?.value?.trim() || "",
    deliverable_code: document.getElementById("dlFormCode")?.value?.trim() || "",
    deliverable_type: document.getElementById("dlFormType")?.value || "",
    requested_from: document.getElementById("dlFormRequestedFrom")?.value?.trim() || "",
    assigned_user_id: document.getElementById("dlFormAssignedUser")?.value || "",
    reviewer_user_id: document.getElementById("dlFormReviewerUser")?.value || "",
    status: document.getElementById("dlFormStatus")?.value || "not_started",
    priority: document.getElementById("dlFormPriority")?.value || "normal",
    due_date: document.getElementById("dlFormDueDate")?.value || "",
    received_date: document.getElementById("dlFormReceivedDate")?.value || "",
    notes: document.getElementById("dlFormNotes")?.value?.trim() || ""
  };

  if (!body.deliverable_name) {
    alert("Deliverable name is required.");
    return;
  }

  if (id) {
    await apiFetch(
      ENDPOINTS.engagementOps.deliverablesUpdate(me.company_id, id),
      { method: "PATCH", body: JSON.stringify(body) }
    );
  } else {
    await apiFetch(
      ENDPOINTS.engagementOps.deliverablesCreate(me.company_id, engagement.id),
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  closeDeliverableModal();
  await loadDeliverablesScreen(me);
}

async function openSignoffModal(me, row = null) {
  await prEnsureUsersCache(me);

  prFillUserSelect("psFormAssignedUser", PR_USERS_CACHE, { includeBlank: true, blankLabel: "Unassigned" });

  const isEdit = !!row?.id;
  const titleEl = document.getElementById("psModalTitle");
  if (titleEl) titleEl.textContent = isEdit ? "Edit Sign-Off Step" : "New Sign-Off Step";

  prMaybeSetValue("psFormId", row?.id || "");
  prMaybeSetValue("psFormName", row?.step_name || "");
  prMaybeSetValue("psFormCode", row?.step_code || "");
  prMaybeSetValue("psFormYearEnd", row?.reporting_year_end || "");
  prMaybeSetValue("psFormAssignedUser", row?.assigned_user_id || "");
  prMaybeSetValue("psFormStatus", row?.status || "not_started");
  prMaybeSetValue("psFormDueDate", row?.due_date || "");
  prMaybeSetValue("psFormSortOrder", row?.sort_order ?? 0);
  prMaybeSetChecked("psFormRequired", row?.is_required !== false);
  prMaybeSetValue("psFormNotes", row?.notes || "");

  prSetModalOpen("psModal", true);
}

function closeSignoffModal() {
  prSetModalOpen("psModal", false);
}

async function saveSignoffModal(me) {
  const engagement = getSelectedEngagementOrAlert();
  if (!engagement) return;

  const id = document.getElementById("psFormId")?.value?.trim() || "";
  const body = {
    step_name: document.getElementById("psFormName")?.value?.trim() || "",
    step_code: document.getElementById("psFormCode")?.value || "",
    reporting_year_end: document.getElementById("psFormYearEnd")?.value || "",
    assigned_user_id: document.getElementById("psFormAssignedUser")?.value || "",
    status: document.getElementById("psFormStatus")?.value || "not_started",
    due_date: document.getElementById("psFormDueDate")?.value || "",
    sort_order: Number(document.getElementById("psFormSortOrder")?.value || 0),
    is_required: !!document.getElementById("psFormRequired")?.checked,
    notes: document.getElementById("psFormNotes")?.value?.trim() || ""
  };

  if (!body.step_name) {
    alert("Step name is required.");
    return;
  }
  if (!body.step_code) {
    alert("Step code is required.");
    return;
  }
  if (!body.reporting_year_end) {
    alert("Reporting year end is required.");
    return;
  }

  if (id) {
    await apiFetch(
      ENDPOINTS.engagementOps.signoffStepsUpdate(me.company_id, id),
      { method: "PATCH", body: JSON.stringify(body) }
    );
  } else {
    await apiFetch(
      ENDPOINTS.engagementOps.signoffStepsCreate(me.company_id, engagement.id),
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  closeSignoffModal();
  await loadSignoffScreen(me);
}

async function populateSignoffAssignedFilter(me) {
  await prEnsureUsersCache(me);
  prFillUserSelect("psAssignedFilter", PR_USERS_CACHE, {
    includeBlank: true,
    blankLabel: "All assigned users"
  });

  const current = PR_SIGNOFF_VIEW_CACHE.filters?.assigned_user_id || "";
  prMaybeSetValue("psAssignedFilter", current);
}

window.__PR_WORKING_PAPERS_STATE__ = {
  rows: [],
  selectedId: null,
  summary: null,
  filters: {
    quick: "all",
    paper_section: "",
    paper_type: "",
    status: "",
    priority: "",
    q: "",
    mine_only: false,
    limit: 100,
    offset: 0
  },
  modal: {
    mode: "create",
    id: null,
    open: false
  }
};

function getPractitionerActiveCompanyId() {
  return (
    window.__PR_CONTEXT__?.companyId ||
    window.__PR_ACTIVE_COMPANY_ID__ ||
    window.__COMPANY_ID__ ||
    window.getCurrentCompanyId?.() ||
    window.getActiveCompanyId?.() ||
    null
  );
}

function getPractitionerActiveCustomerId() {
  return (
    window.__PR_CONTEXT__?.customerId ||
    window.__PR_ACTIVE_CUSTOMER_ID__ ||
    null
  );
}

window.setPractitionerActiveEngagement = function (row) {
  const engagementId = Number(row?.id || row?.engagement_id || 0) || null;
  const companyId = Number(row?.company_id || window.__PR_ACTIVE_COMPANY_ID__ || window.__PR_CONTEXT__?.companyId || 0) || null;
  const customerId = Number(row?.customer_id || 0) || null;

  const payload = {
    engagementId,
    companyId,
    customerId,
    engagement: row || null
  };

  window.__PR_ACTIVE_ENGAGEMENT_ID__ = engagementId;
  window.__PR_ACTIVE_COMPANY_ID__ = companyId || window.__PR_ACTIVE_COMPANY_ID__ || null;
  window.__PR_ACTIVE_CUSTOMER_ID__ = customerId || null;

  window.__PR_CONTEXT__ = {
    ...(window.__PR_CONTEXT__ || {}),
    companyId,
    customerId,
    engagementId,
    engagement: row || null
  };

  if (engagementId) {
    sessionStorage.setItem("fs_pr_active_engagement", JSON.stringify(payload));
  } else {
    sessionStorage.removeItem("fs_pr_active_engagement");
  }

  return payload;
};

window.getPractitionerActiveEngagementId = function () {
  const direct =
    window.__PR_CONTEXT__?.engagementId ||
    window.__PR_ACTIVE_ENGAGEMENT_ID__ ||
    null;

  if (direct) return Number(direct);

  try {
    const raw = sessionStorage.getItem("fs_pr_active_engagement");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number(parsed?.engagementId || 0) || null;
  } catch (_) {
    return null;
  }
};

window.restorePractitionerActiveEngagement = function () {
  try {
    const raw = sessionStorage.getItem("fs_pr_active_engagement");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.engagementId) return null;

    window.__PR_ACTIVE_ENGAGEMENT_ID__ = Number(parsed.engagementId) || null;
    window.__PR_ACTIVE_COMPANY_ID__ = Number(parsed.companyId) || null;
    window.__PR_ACTIVE_CUSTOMER_ID__ = Number(parsed.customerId) || null;

    window.__PR_CONTEXT__ = {
      ...(window.__PR_CONTEXT__ || {}),
      companyId: Number(parsed.companyId) || null,
      customerId: Number(parsed.customerId) || null,
      engagementId: Number(parsed.engagementId) || null,
      engagement: parsed.engagement || null
    };

    return parsed;
  } catch (err) {
    console.warn("Failed to restore active engagement", err);
    return null;
  }
};


async function openPostingForEngagement(row, me) {
  const targetCompanyId = Number(row?.target_company_id || 0);
  const sourceCompanyId = Number(row?.company_id || 0);

  if (!targetCompanyId) {
    console.warn("No provisioned target company for posting", row);
    return;
  }

  const customerId = Number(row?.customer_id || 0) || null;
  const engagementId = Number(row?.id || 0) || null;

  if (!engagementId || !sourceCompanyId) {
    console.warn("Missing engagement/source company context for delegated workspace", {
      engagementId,
      sourceCompanyId,
      row,
    });
    return;
  }

  // keep original home token once, using the SAME token system
  try {
    const currentToken = window.getToken?.() || "";
    if (currentToken && !localStorage.getItem("fs_home_token")) {
      localStorage.setItem("fs_home_token", currentToken);
    }
  } catch (e) {
    console.warn("Could not preserve home token", e);
  }

  // ask backend for delegated workspace token
  console.log("BEFORE ENTER", {
    getToken: window.getToken?.(),
    fs_user_token_local: localStorage.getItem("fs_user_token"),
    fs_user_token_session: sessionStorage.getItem("fs_user_token"),
    authToken_local: localStorage.getItem("authToken"),
    authToken_session: sessionStorage.getItem("authToken"),
  });

  const res = await window.enterEngagementWorkspace(engagementId, sourceCompanyId);

  console.log("AFTER ENTER RESPONSE", res);

  console.log("AFTER TOKEN SET", {
    getToken: window.getToken?.(),
    fs_user_token_local: localStorage.getItem("fs_user_token"),
    fs_user_token_session: sessionStorage.getItem("fs_user_token"),
    authToken_local: localStorage.getItem("authToken"),
    authToken_session: sessionStorage.getItem("authToken"),
  });

  const meAfter = await apiFetch("/api/auth/me", { method: "GET" });
  console.log("AFTER SWITCH /api/auth/me", meAfter);

  console.log("POST ENTER WORKSPACE RES", res);

  if (!res?.ok || !res?.token) {
    throw new Error(res?.error || "Failed to enter delegated workspace");
  }

  // store delegated token using the SAME key your AUTH_HEADER() reads
  window.setToken(res.token, true);

  // 🔥 CRITICAL: sync active company with delegated company
  localStorage.setItem("company_id", String(targetCompanyId));

  console.log("AFTER SET DELEGATED", {
    tokenCompany: targetCompanyId,
    storedCompany: localStorage.getItem("company_id"),
  }); 

  const ctx = {
    companyId: targetCompanyId,
    targetCompanyId,
    sourceCompanyId,

    customerId,
    customerName: row?.customer_name || "",

    engagementId,
    engagementCode: row?.engagement_code || "",
    engagementName: row?.engagement_name || "",
    engagementType: row?.engagement_type || "",

    workspaceStatus: row?.workspace_status || "",
    workspaceSource: row?.workspace_source || "",
    targetCompanySource: row?.target_company_source || "",

    launchMode: "posting",
    requestedScreen: "posting",
    sourceDashboard: "practitioner",
    accessMode: "delegated_workspace",

    engagement: row || null,
    returnTo: "practitionerdashboard.html#screen=assignments",

    launchedByUserId: Number(me?.id || me?.user_id || me?.sub || 0) || null,
  };

  localStorage.setItem("fs_posting_context", JSON.stringify(ctx));

  // set active company before redirect
  try {
    window.setActiveCompanyId?.(targetCompanyId);
    window.__PR_ACTIVE_COMPANY_ID__ = targetCompanyId;
  } catch (e) {
    console.warn("Failed to set active company before redirect", e);
  }

  console.log("FINAL TOKEN BEFORE REDIRECT", {
    fs_user_token_local: localStorage.getItem("fs_user_token"),
    fs_user_token_session: sessionStorage.getItem("fs_user_token"),
    token_local: localStorage.getItem("token"),
    access_token_local: localStorage.getItem("access_token"),
    posting_context: localStorage.getItem("fs_posting_context"),
    targetCompanyId,
    sourceCompanyId,
    engagementId,
  });

  window.location.href = "dashboard.html";
}

function restorePractitionerReturnContext() {
  try {
    const raw = localStorage.getItem("fs_pr_return_context");
    if (!raw) return null;

    const ctx = JSON.parse(raw);
    localStorage.removeItem("fs_pr_return_context");

    if (ctx?.companyId) {
      window.__PR_ACTIVE_COMPANY_ID__ = Number(ctx.companyId) || null;
    }

    if (ctx?.customerId) {
      window.__PR_ACTIVE_CUSTOMER_ID__ = Number(ctx.customerId) || null;
    }

    if (ctx?.engagementId) {
      window.setPractitionerActiveEngagementId?.(Number(ctx.engagementId) || null);
    }

    window.__PR_CONTEXT__ = {
      ...(window.__PR_CONTEXT__ || {}),
      companyId: Number(ctx?.companyId) || null,
      customerId: Number(ctx?.customerId) || null,
      engagementId: Number(ctx?.engagementId) || null,
      engagement: ctx?.engagement || null
    };

    return ctx;
  } catch (err) {
    console.warn("Failed to restore practitioner return context", err);
    return null;
  }
}

function wpEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wpSafeText(v, fallback = "—") {
  const s = String(v == null ? "" : v).trim();
  return s || fallback;
}

function wpFormatDate(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch (_) {
    return String(v);
  }
}

function wpPrettyLabel(v) {
  return String(v || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function wpStatusBadgeClass(status) {
  return `status-${String(status || "").replace(/\s+/g, "-")}`;
}

function wpPriorityBadgeClass(priority) {
  return `priority-${String(priority || "").replace(/\s+/g, "-")}`;
}

function wpGetSelectedRow() {
  const state = window.__PR_WORKING_PAPERS_STATE__;
  return (state.rows || []).find((r) => String(r.id) === String(state.selectedId)) || null;
}

function wpSetQuickFilter(quick) {
  const state = window.__PR_WORKING_PAPERS_STATE__;
  state.filters.quick = quick || "all";
  state.filters.mine_only = false;
  state.filters.status = "";

  if (quick === "mine") {
    state.filters.mine_only = true;
  } else if (quick === "prepared") {
    state.filters.status = "prepared";
  } else if (quick === "review") {
    state.filters.status = "in_review";
  } else if (quick === "blocked") {
    state.filters.status = "blocked";
  }

  state.filters.offset = 0;
}

function wpToDateTimeLocal(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (_) {
    return "";
  }
}

function wpFromDateTimeLocal(v) {
  return v ? v : null;
}

function wpParseInt(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function wpLoadSummary() {
  const companyId = getPractitionerActiveCompanyId();
  if (!companyId) return null;

  const customerId = getPractitionerActiveCustomerId();
  const engagementId = getPractitionerActiveEngagementId();

  const json = await apiFetch(
    ENDPOINTS.workingPapers.summary(companyId, {
      customer_id: customerId || "",
      engagement_id: engagementId || ""
    })
  );

  return json?.row || json?.data || null;
}

async function wpLoadRows() {
  const companyId = getPractitionerActiveCompanyId();
  if (!companyId) return [];

  const customerId = getPractitionerActiveCustomerId();
  const engagementId = getPractitionerActiveEngagementId();
  const state = window.__PR_WORKING_PAPERS_STATE__;
  const f = state.filters || {};

  const json = await apiFetch(
    ENDPOINTS.workingPapers.list(companyId, {
      customer_id: customerId || "",
      engagement_id: engagementId || "",
      paper_section: f.paper_section || "",
      paper_type: f.paper_type || "",
      status: f.status || "",
      priority: f.priority || "",
      mine_only: !!f.mine_only,
      q: f.q || "",
      limit: f.limit || 100,
      offset: f.offset || 0
    })
  );

  return json?.rows || json?.data?.rows || [];
}

async function wpFetchOne(workingPaperId) {
  const companyId = getPractitionerActiveCompanyId();
  if (!companyId || !workingPaperId) return null;
  const json = await apiFetch(
    ENDPOINTS.workingPapers.get(companyId, workingPaperId)
  );
  return json?.row || null;
}

function wpBuildToolbarHtml() {
  const state = window.__PR_WORKING_PAPERS_STATE__;
  const f = state.filters || {};

  return `
    <div class="wp-card wp-toolbar">
      <div class="wp-toolbar-copy">
        <div class="wp-toolbar-title">Working Papers</div>
        <div class="wp-toolbar-subtitle">
          Prepare, review, and manage structured workpapers, schedules, reconciliations, memos, and linked support.
        </div>
      </div>

      <div class="wp-toolbar-actions">
        <input id="wpSearchInput" class="wp-search" type="text" placeholder="Search paper, code, client, engagement, section..." value="${wpEsc(f.q || "")}" />
        <button class="wp-btn" id="wpSearchBtn">Search</button>
        <button class="wp-btn" id="wpRefreshBtn">Refresh</button>
        <button class="wp-btn wp-btn-primary" id="wpCreateBtn">New Working Paper</button>
      </div>
    </div>
  `;
}

function wpBuildKpisHtml(summary) {
  const totalItems = Number(summary?.total_items || 0);
  const readyOrInReview = Number(summary?.ready_or_in_review || 0);
  const overdueItems = Number(summary?.overdue_items || 0);
  const blockedItems = Number(summary?.blocked_items || 0);
  const myItems = Number(summary?.my_items || 0);

  return `
    <div class="wp-kpis">
      <div class="wp-card wp-kpi">
        <div class="wp-kpi-label">Total papers</div>
        <div class="wp-kpi-value">${totalItems}</div>
        <div class="wp-kpi-note">All active workpapers in scope</div>
      </div>
      <div class="wp-card wp-kpi">
        <div class="wp-kpi-label">Prepared / in review</div>
        <div class="wp-kpi-value">${readyOrInReview}</div>
        <div class="wp-kpi-note">Ready for reviewer attention</div>
      </div>
      <div class="wp-card wp-kpi">
        <div class="wp-kpi-label">Overdue</div>
        <div class="wp-kpi-value">${overdueItems}</div>
        <div class="wp-kpi-note">Past due and still open</div>
      </div>
      <div class="wp-card wp-kpi">
        <div class="wp-kpi-label">Blocked</div>
        <div class="wp-kpi-value">${blockedItems}</div>
        <div class="wp-kpi-note">Require escalation or support</div>
      </div>
      <div class="wp-card wp-kpi">
        <div class="wp-kpi-label">My papers</div>
        <div class="wp-kpi-value">${myItems}</div>
        <div class="wp-kpi-note">Assigned or routed to me</div>
      </div>
    </div>
  `;
}

function wpBuildRegisterHtml() {
  const state = window.__PR_WORKING_PAPERS_STATE__;
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const f = state.filters || {};

  let displayRows = rows.slice();
  if (f.quick === "overdue") {
    displayRows = displayRows.filter((r) => !!r.is_overdue);
  }

  const rowHtml = displayRows.length
    ? displayRows.map((row) => {
        const isSelected = String(state.selectedId) === String(row.id);
        return `
          <tr class="${isSelected ? "is-selected" : ""}" data-wp-row-id="${wpEsc(row.id)}">
            <td><span class="wp-badge ${wpPriorityBadgeClass(row.priority)}">${wpEsc(wpPrettyLabel(row.priority || "normal"))}</span></td>
            <td>${wpEsc(wpPrettyLabel(row.paper_section || ""))}</td>
            <td>${wpEsc(wpPrettyLabel(row.paper_type || ""))}</td>
            <td>
              <div class="wp-item-title">${wpEsc(row.paper_name || "—")}</div>
              <div class="wp-item-meta">${wpEsc(row.paper_code || "No code")}</div>
            </td>
            <td>
              <div class="wp-item-title">${wpEsc(row.customer_name || "—")}</div>
              <div class="wp-item-meta">${wpEsc(row.engagement_name || "—")} • ${wpEsc(row.engagement_code || "—")}</div>
            </td>
            <td>${wpEsc(row.preparer_user_name || "—")}</td>
            <td>${wpEsc(row.reviewer_user_name || "—")}</td>
            <td><span class="wp-badge ${wpStatusBadgeClass(row.status)}">${wpEsc(wpPrettyLabel(row.status || ""))}</span></td>
            <td>${wpEsc(wpFormatDate(row.due_date))}</td>
            <td>
              <div class="wp-row-actions">
                <button class="wp-mini-btn" data-wp-open="${wpEsc(row.id)}">Open</button>
                <button class="wp-mini-btn" data-wp-edit="${wpEsc(row.id)}">Edit</button>
              </div>
            </td>
          </tr>
        `;
      }).join("")
    : `
      <tr>
        <td colspan="10">
          <div class="wp-empty">No working papers found for the current filters.</div>
        </td>
      </tr>
    `;

  const pageNo = Math.floor((Number(f.offset || 0) / Number(f.limit || 100)) + 1);

  return `
    <div class="wp-card wp-panel">
      <div class="wp-panel-title">Working papers register</div>
      <div class="wp-panel-subtitle">Search, filter, open, edit, and route workpapers for the active engagement.</div>

      <div class="wp-chip-row">
        <button class="wp-chip ${f.quick === "all" ? "active" : ""}" data-wp-quick="all">All</button>
        <button class="wp-chip ${f.quick === "prepared" ? "active" : ""}" data-wp-quick="prepared">Prepared</button>
        <button class="wp-chip ${f.quick === "review" ? "active" : ""}" data-wp-quick="review">In review</button>
        <button class="wp-chip ${f.quick === "blocked" ? "active" : ""}" data-wp-quick="blocked">Blocked</button>
        <button class="wp-chip ${f.quick === "overdue" ? "active" : ""}" data-wp-quick="overdue">Overdue</button>
        <button class="wp-chip ${f.quick === "mine" ? "active" : ""}" data-wp-quick="mine">Mine only</button>
      </div>

      <div class="wp-filters">
        <select id="wpSectionFilter">
          <option value="">All sections</option>
          <option value="planning" ${f.paper_section === "planning" ? "selected" : ""}>Planning</option>
          <option value="cash" ${f.paper_section === "cash" ? "selected" : ""}>Cash</option>
          <option value="receivables" ${f.paper_section === "receivables" ? "selected" : ""}>Receivables</option>
          <option value="payables" ${f.paper_section === "payables" ? "selected" : ""}>Payables</option>
          <option value="revenue" ${f.paper_section === "revenue" ? "selected" : ""}>Revenue</option>
          <option value="expenses" ${f.paper_section === "expenses" ? "selected" : ""}>Expenses</option>
          <option value="payroll" ${f.paper_section === "payroll" ? "selected" : ""}>Payroll</option>
          <option value="tax" ${f.paper_section === "tax" ? "selected" : ""}>Tax</option>
          <option value="ppe" ${f.paper_section === "ppe" ? "selected" : ""}>PPE</option>
          <option value="equity" ${f.paper_section === "equity" ? "selected" : ""}>Equity</option>
          <option value="fs" ${f.paper_section === "fs" ? "selected" : ""}>FS</option>
          <option value="completion" ${f.paper_section === "completion" ? "selected" : ""}>Completion</option>
          <option value="other" ${f.paper_section === "other" ? "selected" : ""}>Other</option>
        </select>

        <select id="wpTypeFilter">
          <option value="">All paper types</option>
          <option value="working_paper" ${f.paper_type === "working_paper" ? "selected" : ""}>Working paper</option>
          <option value="lead_schedule" ${f.paper_type === "lead_schedule" ? "selected" : ""}>Lead schedule</option>
          <option value="reconciliation" ${f.paper_type === "reconciliation" ? "selected" : ""}>Reconciliation</option>
          <option value="checklist" ${f.paper_type === "checklist" ? "selected" : ""}>Checklist</option>
          <option value="memo" ${f.paper_type === "memo" ? "selected" : ""}>Memo</option>
          <option value="analysis" ${f.paper_type === "analysis" ? "selected" : ""}>Analysis</option>
          <option value="support" ${f.paper_type === "support" ? "selected" : ""}>Support</option>
        </select>

        <select id="wpStatusFilter">
          <option value="">All statuses</option>
          <option value="not_started" ${f.status === "not_started" ? "selected" : ""}>Not started</option>
          <option value="in_progress" ${f.status === "in_progress" ? "selected" : ""}>In progress</option>
          <option value="prepared" ${f.status === "prepared" ? "selected" : ""}>Prepared</option>
          <option value="in_review" ${f.status === "in_review" ? "selected" : ""}>In review</option>
          <option value="reviewed" ${f.status === "reviewed" ? "selected" : ""}>Reviewed</option>
          <option value="cleared" ${f.status === "cleared" ? "selected" : ""}>Cleared</option>
          <option value="blocked" ${f.status === "blocked" ? "selected" : ""}>Blocked</option>
          <option value="returned" ${f.status === "returned" ? "selected" : ""}>Returned</option>
          <option value="archived" ${f.status === "archived" ? "selected" : ""}>Archived</option>
        </select>

        <select id="wpPriorityFilter">
          <option value="">All priorities</option>
          <option value="urgent" ${f.priority === "urgent" ? "selected" : ""}>Urgent</option>
          <option value="high" ${f.priority === "high" ? "selected" : ""}>High</option>
          <option value="normal" ${f.priority === "normal" ? "selected" : ""}>Normal</option>
          <option value="low" ${f.priority === "low" ? "selected" : ""}>Low</option>
        </select>

        <select id="wpLimitFilter">
          <option value="25" ${String(f.limit) === "25" ? "selected" : ""}>25 rows</option>
          <option value="50" ${String(f.limit) === "50" ? "selected" : ""}>50 rows</option>
          <option value="100" ${String(f.limit) === "100" ? "selected" : ""}>100 rows</option>
          <option value="200" ${String(f.limit) === "200" ? "selected" : ""}>200 rows</option>
        </select>
      </div>

      <div class="wp-table-wrap">
        <table class="wp-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Section</th>
              <th>Type</th>
              <th>Paper</th>
              <th>Client / Engagement</th>
              <th>Preparer</th>
              <th>Reviewer</th>
              <th>Status</th>
              <th>Due</th>
              <th>Next</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>

      <div class="wp-footer">
        <div class="wp-footer-note">Showing ${displayRows.length} item(s)</div>
        <div class="wp-pagination">
          <button class="wp-btn" id="wpPrevPageBtn">Previous</button>
          <span class="wp-page-pill">Page ${pageNo}</span>
          <button class="wp-btn" id="wpNextPageBtn">Next</button>
        </div>
      </div>
    </div>
  `;
}

function wpBuildDetailHtml() {
  const row = wpGetSelectedRow();

  if (!row) {
    return `
      <div class="wp-card wp-panel">
        <div class="wp-panel-title">Selected working paper</div>
        <div class="wp-panel-subtitle">Detail, routing, notes, and workflow actions</div>
        <div class="wp-detail-empty">Select a working paper from the register to view its details.</div>
      </div>
    `;
  }

  return `
    <div class="wp-card wp-panel">
      <div class="wp-panel-title">Selected working paper</div>
      <div class="wp-panel-subtitle">Detail, routing, notes, linked records, and quick workflow actions</div>

      <div class="wp-detail-block">
        <div class="wp-detail-head">
          <div>
            <div class="wp-detail-title">${wpEsc(row.paper_name || "—")}</div>
            <div class="wp-detail-subtitle">
              ${wpEsc(row.paper_code || "No code")} • ${wpEsc(wpPrettyLabel(row.paper_section || ""))} • ${wpEsc(wpPrettyLabel(row.paper_type || ""))}
            </div>
          </div>

          <div class="wp-detail-actions">
            <button class="wp-btn" data-wp-status-action="prepared">Mark prepared</button>
            <button class="wp-btn" data-wp-status-action="in_review">Send to review</button>
            <button class="wp-btn" data-wp-status-action="cleared">Clear</button>
            <button class="wp-btn" id="wpEditSelectedBtn">Edit</button>
            <button class="wp-btn wp-btn-danger" id="wpDeactivateSelectedBtn">Deactivate</button>
            <button
              class="px-3 py-1 text-xs bg-slate-50 border rounded"
              data-wp-open-deliverable="${wp.id}"
            >
              Open Deliverable
            </button>
          </div>
        </div>

        <div class="wp-detail-grid">
          <div class="wp-detail-field">
            <div class="wp-detail-label">Status</div>
            <div class="wp-detail-value"><span class="wp-badge ${wpStatusBadgeClass(row.status)}">${wpEsc(wpPrettyLabel(row.status || ""))}</span></div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Priority</div>
            <div class="wp-detail-value"><span class="wp-badge ${wpPriorityBadgeClass(row.priority)}">${wpEsc(wpPrettyLabel(row.priority || ""))}</span></div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Client</div>
            <div class="wp-detail-value">${wpEsc(row.customer_name || "—")}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Engagement</div>
            <div class="wp-detail-value">${wpEsc(row.engagement_name || "—")} • ${wpEsc(row.engagement_code || "—")}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Preparer</div>
            <div class="wp-detail-value">${wpEsc(row.preparer_user_name || "—")}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Reviewer</div>
            <div class="wp-detail-value">${wpEsc(row.reviewer_user_name || "—")}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Due date</div>
            <div class="wp-detail-value">${wpEsc(wpFormatDate(row.due_date))}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Version</div>
            <div class="wp-detail-value">${wpEsc(row.version_no || "1")}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Documents</div>
            <div class="wp-detail-value">${wpEsc(row.document_count || 0)}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Prepared at</div>
            <div class="wp-detail-value">${wpEsc(wpFormatDate(row.prepared_at))}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Reviewed at</div>
            <div class="wp-detail-value">${wpEsc(wpFormatDate(row.reviewed_at))}</div>
          </div>
          <div class="wp-detail-field">
            <div class="wp-detail-label">Cleared at</div>
            <div class="wp-detail-value">${wpEsc(wpFormatDate(row.cleared_at))}</div>
          </div>
        </div>

        <div class="wp-note-stack">
          <div class="wp-note-card">
            <div class="wp-note-title">Working notes</div>
            <div class="wp-note-body">${wpEsc(wpSafeText(row.notes, "No working notes captured yet."))}</div>
          </div>

          <div class="wp-note-card">
            <div class="wp-note-title">Review notes</div>
            <div class="wp-note-body">${wpEsc(wpSafeText(row.review_notes, "No review notes captured yet."))}</div>
          </div>

          <div class="wp-note-card">
            <div class="wp-note-title">Linked records</div>
            <div class="wp-note-body">Reporting item ID: ${wpEsc(row.linked_reporting_item_id || "—")}\nDeliverable ID: ${wpEsc(row.linked_deliverable_id || "—")}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wpRenderShell() {
  const mount = document.getElementById("workingPapersMount");
  if (!mount) return;

  const state = window.__PR_WORKING_PAPERS_STATE__;

  mount.innerHTML = `
    ${wpBuildToolbarHtml()}
    ${wpBuildKpisHtml(state.summary)}
    <div class="wp-main">
      ${wpBuildRegisterHtml()}
      ${wpBuildDetailHtml()}
    </div>
  `;

  wpBindEvents();
}

function wpBindEvents() {
  const state = window.__PR_WORKING_PAPERS_STATE__;

  document.getElementById("wpSearchBtn")?.addEventListener("click", async () => {
    state.filters.q = document.getElementById("wpSearchInput")?.value?.trim() || "";
    state.filters.offset = 0;
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpSearchInput")?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.filters.q = e.currentTarget.value.trim() || "";
      state.filters.offset = 0;
      await renderWorkingPapersScreen(window.__PR_ME__);
    }
  });

  document.getElementById("wpRefreshBtn")?.addEventListener("click", async () => {
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpCreateBtn")?.addEventListener("click", async () => {
    wpOpenModal("create");
  });

  document.getElementById("wpSectionFilter")?.addEventListener("change", async (e) => {
    state.filters.paper_section = e.target.value || "";
    state.filters.offset = 0;
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpTypeFilter")?.addEventListener("change", async (e) => {
    state.filters.paper_type = e.target.value || "";
    state.filters.offset = 0;
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpStatusFilter")?.addEventListener("change", async (e) => {
    state.filters.status = e.target.value || "";
    state.filters.offset = 0;
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpPriorityFilter")?.addEventListener("change", async (e) => {
    state.filters.priority = e.target.value || "";
    state.filters.offset = 0;
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpLimitFilter")?.addEventListener("change", async (e) => {
    state.filters.limit = Number(e.target.value || 100) || 100;
    state.filters.offset = 0;
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.querySelectorAll("[data-wp-quick]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      wpSetQuickFilter(btn.getAttribute("data-wp-quick"));
      await renderWorkingPapersScreen(window.__PR_ME__);
    });
  });

  document.querySelectorAll("[data-wp-row-id]").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedId = el.getAttribute("data-wp-row-id");
      wpRenderShell();
    });
  });

  document.querySelectorAll("[data-wp-open]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const id = Number(btn.getAttribute("data-wp-open"));
      if (!id) return;

      if (state.selectedRow?.id === id) {
        state.selectedId = id;
        wpRenderShell();
        return;
      }

      state.selectedId = id;

      try {
        const row = await wpFetchOne(id);
        state.selectedRow = row;
      } catch (err) {
        console.error("Failed to fetch working paper:", err);
        state.selectedRow = null;
      }

      wpRenderShell();
    });
  });

  document.querySelectorAll("[data-wp-edit]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-wp-edit");
      if (!id) return;
      state.selectedId = id;
      await wpOpenModal("edit", id);
    });
  });

  document.querySelectorAll("[data-wp-status-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextStatus = btn.getAttribute("data-wp-status-action");
      const row = wpGetSelectedRow();
      if (!row?.id || !nextStatus) return;
      await wpSetStatus(row.id, nextStatus);
    });
  });

  document.querySelectorAll("[data-wp-open-deliverable]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const id = btn.getAttribute("data-wp-open-deliverable");
      const row = window.__PR_WORKING_PAPERS_STATE__?.rows?.find(
        r => String(r.id) === String(id)
      );

      if (!row) return;

      await openDeliverablesForWorkingPaper(row, window.__PR_ME__);
    });
  });

  document.getElementById("wpEditSelectedBtn")?.addEventListener("click", async () => {
    const row = wpGetSelectedRow();
    if (!row?.id) return;
    await wpOpenModal("edit", row.id);
  });

  document.getElementById("wpDeactivateSelectedBtn")?.addEventListener("click", async () => {
    const row = wpGetSelectedRow();
    if (!row?.id) return;
    await wpDeactivate(row.id);
  });

  document.getElementById("wpPrevPageBtn")?.addEventListener("click", async () => {
    state.filters.offset = Math.max(0, Number(state.filters.offset || 0) - Number(state.filters.limit || 100));
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpNextPageBtn")?.addEventListener("click", async () => {
    state.filters.offset = Number(state.filters.offset || 0) + Number(state.filters.limit || 100);
    await renderWorkingPapersScreen(window.__PR_ME__);
  });

  document.getElementById("wpModalCloseBtn")?.addEventListener("click", wpCloseModal);
  document.getElementById("wpModalCancelBtn")?.addEventListener("click", wpCloseModal);
  document.getElementById("wpModalSaveBtn")?.addEventListener("click", wpSaveModal);

  document.querySelectorAll("[data-wp-mark-prepared]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-wp-mark-prepared");
      try {
        await markWorkingPaperPrepared(id);
        await renderWorkingPapersScreen(window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to mark prepared.");
      }
    });
  });

  document.querySelectorAll("[data-wp-send-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-wp-send-review");
      try {
        await sendWorkingPaperToReview(id);
        await renderWorkingPapersScreen(window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to send to review.");
      }
    });
  });

  document.getElementById("wpModalBackdrop")?.addEventListener("click", (e) => {
    if (e.target?.id === "wpModalBackdrop") wpCloseModal();
  });
}

function wpOpenModal(mode = "create", workingPaperId = null) {
  const backdrop = document.getElementById("wpModalBackdrop");
  const title = document.getElementById("wpModalTitle");
  const subtitle = document.getElementById("wpModalSubtitle");
  const state = window.__PR_WORKING_PAPERS_STATE__;

  state.modal.mode = mode;
  state.modal.id = workingPaperId || null;
  state.modal.open = true;

  if (title) title.textContent = mode === "edit" ? "Edit Working Paper" : "New Working Paper";
  if (subtitle) subtitle.textContent = mode === "edit"
    ? "Update the selected working paper."
    : "Create a structured working paper for the selected engagement.";

  wpResetModalForm();

  if (mode === "edit" && workingPaperId) {
    wpPopulateModalFromSelected();
  }

  backdrop?.classList.add("active");
}

function wpCloseModal() {
  const backdrop = document.getElementById("wpModalBackdrop");
  backdrop?.classList.remove("active");

  const state = window.__PR_WORKING_PAPERS_STATE__;
  state.modal.open = false;
  state.modal.id = null;
}

function wpResetModalForm() {
  const form = document.getElementById("wpForm");
  if (!form) return;
  form.reset();

  document.getElementById("wpFormStatus").value = "not_started";
  document.getElementById("wpFormPriority").value = "normal";
  document.getElementById("wpFormPaperType").value = "working_paper";
  document.getElementById("wpFormVersionNo").value = "1";
  document.getElementById("wpFormDocumentCount").value = "0";
}

function wpPopulateModalFromSelected() {
  const row = wpGetSelectedRow();
  if (!row) return;

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  };

  set("wpFormPaperCode", row.paper_code);
  set("wpFormPaperName", row.paper_name);
  set("wpFormPaperSection", row.paper_section);
  set("wpFormPaperType", row.paper_type);
  set("wpFormStatus", row.status);
  set("wpFormPriority", row.priority);
  set("wpFormPreparerUserId", row.preparer_user_id);
  set("wpFormReviewerUserId", row.reviewer_user_id);
  set("wpFormDueDate", row.due_date ? String(row.due_date).slice(0, 10) : "");
  set("wpFormVersionNo", row.version_no || 1);
  set("wpFormDocumentCount", row.document_count || 0);
  set("wpFormPreparedAt", wpToDateTimeLocal(row.prepared_at));
  set("wpFormReviewedAt", wpToDateTimeLocal(row.reviewed_at));
  set("wpFormClearedAt", wpToDateTimeLocal(row.cleared_at));
  set("wpFormLinkedReportingItemId", row.linked_reporting_item_id);
  set("wpFormLinkedDeliverableId", row.linked_deliverable_id);
  set("wpFormNotes", row.notes);
  set("wpFormReviewNotes", row.review_notes);
}

function wpCollectModalPayload() {
  const engagementId = getPractitionerActiveEngagementId();
  const payload = {
    engagement_id: Number(engagementId),
    paper_code: document.getElementById("wpFormPaperCode")?.value?.trim() || null,
    paper_name: document.getElementById("wpFormPaperName")?.value?.trim() || null,
    paper_section: document.getElementById("wpFormPaperSection")?.value || null,
    paper_type: document.getElementById("wpFormPaperType")?.value || "working_paper",
    status: document.getElementById("wpFormStatus")?.value || "not_started",
    priority: document.getElementById("wpFormPriority")?.value || "normal",
    preparer_user_id: wpParseInt(document.getElementById("wpFormPreparerUserId")?.value),
    reviewer_user_id: wpParseInt(document.getElementById("wpFormReviewerUserId")?.value),
    due_date: document.getElementById("wpFormDueDate")?.value || null,
    version_no: wpParseInt(document.getElementById("wpFormVersionNo")?.value) || 1,
    document_count: wpParseInt(document.getElementById("wpFormDocumentCount")?.value) || 0,
    prepared_at: wpFromDateTimeLocal(document.getElementById("wpFormPreparedAt")?.value),
    reviewed_at: wpFromDateTimeLocal(document.getElementById("wpFormReviewedAt")?.value),
    cleared_at: wpFromDateTimeLocal(document.getElementById("wpFormClearedAt")?.value),
    linked_reporting_item_id: wpParseInt(document.getElementById("wpFormLinkedReportingItemId")?.value),
    linked_deliverable_id: wpParseInt(document.getElementById("wpFormLinkedDeliverableId")?.value),
    notes: document.getElementById("wpFormNotes")?.value?.trim() || null,
    review_notes: document.getElementById("wpFormReviewNotes")?.value?.trim() || null
  };

  return payload;
}

async function wpSaveModal() {
  try {
    const companyId = getPractitionerActiveCompanyId();
    const engagementId = getPractitionerActiveEngagementId();
    const state = window.__PR_WORKING_PAPERS_STATE__;

    if (!companyId) {
      alert("No active company in context.");
      return;
    }

    if (!engagementId) {
      alert("Select an engagement first.");
      return;
    }

    const payload = wpCollectModalPayload();

    if (!payload.paper_name) {
      alert("Paper name is required.");
      return;
    }

    if (!payload.paper_section) {
      alert("Paper section is required.");
      return;
    }

    let json;
    if (state.modal.mode === "edit" && state.modal.id) {
      json = await apiFetch(ENDPOINTS.workingPapers.update(companyId, state.modal.id), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      json = await apiFetch(ENDPOINTS.workingPapers.create(companyId), {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    const row = json?.row || null;
    if (row?.id) {
      state.selectedId = row.id;
    }

    wpCloseModal();
    await renderWorkingPapersScreen(window.__PR_ME__);
  } catch (err) {
    alert(err?.message || "Failed to save working paper.");
  }
}

async function wpSetStatus(workingPaperId, status) {
  try {
    const companyId = getPractitionerActiveCompanyId();
    if (!companyId) {
      alert("No active company in context.");
      return;
    }

    await apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, workingPaperId), {
      method: "POST",
      body: JSON.stringify({ status })
    });

    await renderWorkingPapersScreen(window.__PR_ME__);
  } catch (err) {
    alert(err?.message || "Failed to update working paper status.");
  }
}

async function wpDeactivate(workingPaperId) {
  try {
    const companyId = getPractitionerActiveCompanyId();
    if (!companyId) {
      alert("No active company in context.");
      return;
    }

    const ok = window.confirm("Deactivate this working paper?");
    if (!ok) return;

    await apiFetch(ENDPOINTS.workingPapers.deactivate(companyId, workingPaperId), {
      method: "POST"
    });

    window.__PR_WORKING_PAPERS_STATE__.selectedId = null;
    await renderWorkingPapersScreen(window.__PR_ME__);
  } catch (err) {
    alert(err?.message || "Failed to deactivate working paper.");
  }
}

async function renderWorkingPapersScreen(me) {
  console.log("renderWorkingPapersScreen called");
  console.log("active engagement in render:", window.getPractitionerActiveEngagementId?.());

  const mount = document.getElementById("workingPapersMount");
  console.log("workingPapersMount:", mount);

  if (!mount) {
    console.warn("workingPapersMount not found");
    return;
  }

  window.__PR_WORKING_PAPERS_STATE__ = window.__PR_WORKING_PAPERS_STATE__ || {
    summary: {},
    rows: [],
    selectedId: null,
    selectedRow: null,
    filters: {
      quick: "all",
      q: "",
      paper_section: "",
      paper_type: "",
      status: "",
      priority: "",
      mine_only: false,
      limit: 100,
      offset: 0
    },
    modal: {
      open: false,
      mode: "create",
      id: null
    }
  };

  const state = window.__PR_WORKING_PAPERS_STATE__;
  if (typeof state.selectedRow === "undefined") {
    state.selectedRow = null;
  }

  let engagementId = window.getPractitionerActiveEngagementId?.();

  if (!engagementId && PR_SELECTED_ENGAGEMENT?.id) {
    engagementId = Number(PR_SELECTED_ENGAGEMENT.id);
    window.setPractitionerActiveEngagementId?.(engagementId);
  }
  if (!engagementId) {
    mount.innerHTML = `
      <div class="wp-card wp-toolbar">
        <div class="wp-toolbar-copy">
          <div class="wp-toolbar-title">Working Papers</div>
          <div class="wp-toolbar-subtitle">Select an engagement first to manage working papers for that engagement.</div>
        </div>
      </div>
      <div class="wp-card wp-panel">
        <div class="wp-empty">Select an engagement first to open the working papers workspace.</div>
      </div>
    `;
    return;
  }

  mount.innerHTML = `
    <div class="wp-card wp-panel">
      <div class="wp-empty">Loading working papers...</div>
    </div>
  `;

  try {
    const [summary, rows] = await Promise.all([
      wpLoadSummary(),
      wpLoadRows()
    ]);

    state.summary = summary || {};
    state.rows = Array.isArray(rows) ? rows : [];

    let displayRows = state.rows.slice();
    if (state.filters.quick === "overdue") {
      displayRows = displayRows.filter((r) => !!r.is_overdue);
    }

    if (!state.selectedId && displayRows.length) {
      state.selectedId = displayRows[0].id;
    } else if (
      state.selectedId &&
      !displayRows.find((r) => String(r.id) === String(state.selectedId))
    ) {
      state.selectedId = displayRows[0]?.id || null;
    }

    if (state.selectedId) {
      try {
        state.selectedRow = await wpFetchOne(Number(state.selectedId));
      } catch (detailErr) {
        console.error("Failed to fetch initial working paper:", detailErr);
        state.selectedRow = null;
      }
    } else {
      state.selectedRow = null;
    }

    wpRenderShell();
  } catch (err) {
    console.error("renderWorkingPapersScreen failed:", err);
    mount.innerHTML = `
      <div class="wp-card wp-panel">
        <div class="wp-empty">${wpEsc(err?.message || "Failed to load working papers.")}</div>
      </div>
    `;
  }
}

async function renderTeamCapacityScreen(me) {
  const host = document.getElementById("screen-team-capacity");
  if (!host) {
    console.warn("screen-team-capacity host not found");
    return;
  }

  host.innerHTML = `
    <div class="pr-screen pr-team-capacity-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Team Capacity</h1>
          <p class="pr-screen__subtitle">
            Cross-engagement staffing, allocation load, reviewer pressure, and available capacity visibility.
          </p>
        </div>

        <div class="pr-screen__actions">
          <button class="btn btn-ghost" id="prTeamCapacityRefreshBtn" type="button">Refresh</button>
        </div>
      </div>

      <div class="pr-panel pr-team-capacity-filters">
        <div class="pr-filter-grid">
          <label class="pr-field">
            <span class="pr-field__label">Search</span>
            <input
              id="prTeamCapacitySearch"
              class="pr-input"
              type="text"
              placeholder="Search user, engagement, or code"
              value="${escapeHtml(PR_TEAM_CAPACITY_CACHE.filters.q || "")}"
            />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Role</span>
            <select id="prTeamCapacityRole" class="pr-select">
              <option value="">All roles</option>
              <option value="partner">Partner</option>
              <option value="manager">Manager</option>
              <option value="reviewer">Reviewer</option>
              <option value="preparer">Preparer</option>
              <option value="staff">Staff</option>
            </select>
          </label>

          <label class="pr-field pr-field--check">
            <input
              id="prTeamCapacityActiveOnly"
              type="checkbox"
              ${PR_TEAM_CAPACITY_CACHE.filters.active_only ? "checked" : ""}
            />
            <span>Active only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input
              id="prTeamCapacityOnlyAvailable"
              type="checkbox"
              ${PR_TEAM_CAPACITY_CACHE.filters.only_available ? "checked" : ""}
            />
            <span>Available only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input
              id="prTeamCapacityOnlyOverloaded"
              type="checkbox"
              ${PR_TEAM_CAPACITY_CACHE.filters.only_overloaded ? "checked" : ""}
            />
            <span>Overloaded only</span>
          </label>

          <div class="pr-filter-actions">
            <button class="btn btn-primary" id="prTeamCapacityApplyBtn" type="button">Apply</button>
            <button class="btn btn-ghost" id="prTeamCapacityResetBtn" type="button">Reset</button>
          </div>
        </div>
      </div>

      <div id="prTeamCapacitySummary" class="pr-team-capacity-summary"></div>

      <div class="pr-team-capacity-layout">
        <div class="pr-panel pr-team-capacity-main">
          <div class="pr-panel__head">
            <div>
              <h3>Allocation by user</h3>
              <p>Total assigned workload across active engagements.</p>
            </div>
          </div>

          <div id="prTeamCapacityTableWrap" class="pr-team-capacity-table-wrap">
            ${renderTeamCapacityTableSkeleton()}
          </div>
        </div>

        <aside class="pr-panel pr-team-capacity-side">
          <div class="pr-panel__head">
            <div>
              <h3>Reviewer pressure</h3>
              <p>Selected user workload and engagement breakdown.</p>
            </div>
          </div>

          <div id="prTeamCapacityUserDetail">
            ${renderTeamCapacityEmptyDetail()}
          </div>
        </aside>
      </div>
    </div>
  `;

  const roleEl = document.getElementById("prTeamCapacityRole");
  if (roleEl) {
    roleEl.value = PR_TEAM_CAPACITY_CACHE.filters.role_on_engagement || "";
  }

  bindTeamCapacityEvents(me);
  loadTeamCapacityDashboard(me, { force: true });
}

function renderTeamCapacitySummary(summary = {}) {
  const host = document.getElementById("prTeamCapacitySummary");
  if (!host) return;

  host.innerHTML = `
    <div class="pr-summary-grid">
      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Team members</div>
        <div class="pr-summary-card__value">${formatInt(summary.total_users)}</div>
        <div class="pr-summary-card__hint">Users with active engagement allocation</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Overloaded</div>
        <div class="pr-summary-card__value pr-text-danger">${formatInt(summary.overloaded_users)}</div>
        <div class="pr-summary-card__hint">Allocation at or above 100%</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Near capacity</div>
        <div class="pr-summary-card__value pr-text-warning">${formatInt(summary.near_capacity_users)}</div>
        <div class="pr-summary-card__hint">Allocation between 80% and 99.99%</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Available</div>
        <div class="pr-summary-card__value pr-text-good">${formatInt(summary.available_users)}</div>
        <div class="pr-summary-card__hint">Users below target allocation</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Reviewer pressure</div>
        <div class="pr-summary-card__value">${formatInt(summary.reviewers_with_pressure)}</div>
        <div class="pr-summary-card__hint">Reviewers with queue or overdue items</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Average allocation</div>
        <div class="pr-summary-card__value">${formatPct(summary.avg_allocation_percent)}</div>
        <div class="pr-summary-card__hint">Across active assigned users</div>
      </article>
    </div>
  `;
}

function renderTeamCapacityTable(rows = []) {
  const host = document.getElementById("prTeamCapacityTableWrap");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `
      <div class="pr-table-state">
        <div class="pr-empty-state__title">No team capacity data found</div>
        <div class="pr-empty-state__desc">Try adjusting the filters.</div>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="pr-table-scroll">
      <table class="pr-table pr-team-capacity-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Assignments</th>
            <th>Engagements</th>
            <th>Total allocation</th>
            <th>Available</th>
            <th>Review queue</th>
            <th>Overdue review</th>
            <th>Blocked</th>
            <th>Load</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderTeamCapacityRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTeamCapacityRow(row) {
  const selected = Number(PR_TEAM_CAPACITY_CACHE.selectedUserId) === Number(row.user_id);
  const loadClass = getTeamCapacityLoadBandClass(row.load_band);

  return `
    <tr
      class="pr-team-capacity-row ${selected ? "is-selected" : ""}"
      data-user-id="${Number(row.user_id)}"
      tabindex="0"
    >
      <td>
        <div class="pr-user-cell">
          <div class="pr-user-cell__name">${escapeHtml(row.full_name || "Unknown user")}</div>
          <div class="pr-user-cell__meta">${escapeHtml(row.email || "")}</div>
        </div>
      </td>
      <td>${formatInt(row.active_assignments)}</td>
      <td>${formatInt(row.active_engagements)}</td>
      <td><strong>${formatPct(row.total_allocation_percent)}</strong></td>
      <td>${formatPct(row.available_capacity_percent)}</td>
      <td>${formatInt(row.review_queue_count)}</td>
      <td>${formatInt(row.overdue_review_items)}</td>
      <td>${formatInt(row.blocked_items)}</td>
      <td>
        <span class="pr-badge ${loadClass}">
          ${escapeHtml(getTeamCapacityLoadBandLabel(row.load_band))}
        </span>
      </td>
    </tr>
  `;
}

function renderTeamCapacityUserDetail(detail) {
  const host = document.getElementById("prTeamCapacityUserDetail");
  if (!host) return;

  if (!detail || !detail.totals) {
    host.innerHTML = renderTeamCapacityEmptyDetail();
    return;
  }

  const totals = detail.totals || {};
  const engagements = Array.isArray(detail.engagements) ? detail.engagements : [];

  host.innerHTML = `
    <div class="pr-user-detail">
      <div class="pr-user-detail__stats">
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Assignments</span>
          <strong>${formatInt(totals.active_assignments)}</strong>
        </div>
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Engagements</span>
          <strong>${formatInt(totals.active_engagements)}</strong>
        </div>
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Total allocation</span>
          <strong>${formatPct(totals.total_allocation_percent)}</strong>
        </div>
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Available capacity</span>
          <strong>${formatPct(totals.available_capacity_percent)}</strong>
        </div>
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Review queue</span>
          <strong>${formatInt(totals.review_queue_count)}</strong>
        </div>
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Overdue reviews</span>
          <strong>${formatInt(totals.overdue_review_items)}</strong>
        </div>
      </div>

      <div class="pr-detail-list">
        <div class="pr-detail-list__title">Engagement breakdown</div>
        ${
          engagements.length
            ? engagements.map(renderTeamCapacityDetailItem).join("")
            : `
              <div class="pr-empty-state__desc">
                No engagement assignments found for this user.
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderTeamCapacityDetailItem(row) {
  return `
    <article class="pr-detail-card">
      <div class="pr-detail-card__top">
        <div>
          <div class="pr-detail-card__title">
            ${escapeHtml(row.engagement_name || "Untitled engagement")}
          </div>
          <div class="pr-detail-card__meta">
            ${escapeHtml(row.engagement_code || "")}
            ${row.role_on_engagement ? `• ${escapeHtml(row.role_on_engagement)}` : ""}
          </div>
        </div>
        <div class="pr-detail-card__allocation">${formatPct(row.allocation_percent)}</div>
      </div>

      <div class="pr-detail-card__grid">
        <div><span>Status</span><strong>${escapeHtml(row.engagement_status || "—")}</strong></div>
        <div><span>Priority</span><strong>${escapeHtml(row.priority || "—")}</strong></div>
        <div><span>Review queue</span><strong>${formatInt(row.review_queue_count)}</strong></div>
        <div><span>Overdue review</span><strong>${formatInt(row.overdue_review_items)}</strong></div>
        <div><span>Blocked</span><strong>${formatInt(row.blocked_items)}</strong></div>
        <div><span>Due date</span><strong>${escapeHtml(row.due_date || "—")}</strong></div>
      </div>
    </article>
  `;
}

async function loadTeamCapacityDashboard(me, { force = false } = {}) {
  if (!me?.company_id) return;

  const companyId = me.company_id;
  const filters = { ...PR_TEAM_CAPACITY_CACHE.filters };

  PR_TEAM_CAPACITY_CACHE.loading = true;

  const tableWrap = document.getElementById("prTeamCapacityTableWrap");
  if (tableWrap && force) {
    tableWrap.innerHTML = renderTeamCapacityTableSkeleton();
  }

  try {
    const dashboardUrl = ENDPOINTS.engagements.capacityDashboard(companyId, {
      q: filters.q,
      role_on_engagement: filters.role_on_engagement,
      active_only: filters.active_only,
      limit: filters.limit,
      offset: filters.offset
    });

    const usersUrl = ENDPOINTS.engagements.capacityUsers(companyId, {
      q: filters.q,
      role_on_engagement: filters.role_on_engagement,
      active_only: filters.active_only,
      only_available: filters.only_available,
      only_overloaded: filters.only_overloaded,
      limit: filters.limit,
      offset: filters.offset
    });

    const [dashboardRes, usersRes] = await Promise.all([
      apiFetch(dashboardUrl),
      apiFetch(usersUrl)
    ]);

    PR_TEAM_CAPACITY_CACHE.summary =
      dashboardRes?.data?.summary || dashboardRes?.summary || {};

    PR_TEAM_CAPACITY_CACHE.rows =
      usersRes?.data?.rows || usersRes?.rows || [];

    renderTeamCapacitySummary(PR_TEAM_CAPACITY_CACHE.summary);
    renderTeamCapacityTable(PR_TEAM_CAPACITY_CACHE.rows);

    const selectedStillExists = PR_TEAM_CAPACITY_CACHE.rows.some(
      (r) => Number(r.user_id) === Number(PR_TEAM_CAPACITY_CACHE.selectedUserId)
    );

    if (!selectedStillExists) {
      PR_TEAM_CAPACITY_CACHE.selectedUserId =
        PR_TEAM_CAPACITY_CACHE.rows[0]?.user_id || null;
    }

    if (PR_TEAM_CAPACITY_CACHE.selectedUserId) {
      await loadTeamCapacityUserDetail(me, PR_TEAM_CAPACITY_CACHE.selectedUserId);
    } else {
      PR_TEAM_CAPACITY_CACHE.selectedUserDetail = null;
      renderTeamCapacityUserDetail(null);
    }
  } catch (err) {
    console.error("loadTeamCapacityDashboard failed", err);


    if (tableWrap) {
      tableWrap.innerHTML = `
        <div class="pr-table-state">
          <div class="pr-empty-state__title">Could not load team capacity</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }

    renderTeamCapacitySummary({});
    renderTeamCapacityUserDetail(null);
  } finally {
    PR_TEAM_CAPACITY_CACHE.loading = false;
  }
}

async function loadTeamCapacityUserDetail(me, userId) {
  if (!me?.company_id || !userId) return;

  const companyId = me.company_id;
  PR_TEAM_CAPACITY_CACHE.selectedUserId = userId;

  renderTeamCapacityTable(PR_TEAM_CAPACITY_CACHE.rows);

  const host = document.getElementById("prTeamCapacityUserDetail");
  if (host) {
    host.innerHTML = `<div class="pr-loading">Loading user detail…</div>`;
  }

  try {
    const url = ENDPOINTS.engagements.capacityUser(companyId, userId, {
      active_only: PR_TEAM_CAPACITY_CACHE.filters.active_only
    });

    const res = await apiFetch(url);
    PR_TEAM_CAPACITY_CACHE.selectedUserDetail = res?.data || res || null;
    renderTeamCapacityUserDetail(PR_TEAM_CAPACITY_CACHE.selectedUserDetail);
  } catch (err) {
    console.error("loadTeamCapacityUserDetail failed", err);
    if (host) {
      host.innerHTML = `
        <div class="pr-empty-state">
          <div class="pr-empty-state__title">Could not load user detail</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }
  }
}

function bindTeamCapacityEvents(me) {
  if (PR_TEAM_CAPACITY_EVENTS_BOUND) return;
  PR_TEAM_CAPACITY_EVENTS_BOUND = true;

  document.addEventListener("click", async (event) => {
    const refreshBtn = event.target.closest("#prTeamCapacityRefreshBtn");
    if (refreshBtn) {
      await loadTeamCapacityDashboard(me, { force: true });
      return;
    }

    const applyBtn = event.target.closest("#prTeamCapacityApplyBtn");
    if (applyBtn) {
      syncTeamCapacityFiltersFromDom();
      await loadTeamCapacityDashboard(me, { force: true });
      return;
    }

    const resetBtn = event.target.closest("#prTeamCapacityResetBtn");
    if (resetBtn) {
      PR_TEAM_CAPACITY_CACHE.filters = {
        q: "",
        role_on_engagement: "",
        active_only: true,
        only_available: false,
        only_overloaded: false,
        limit: 100,
        offset: 0
      };
      await renderTeamCapacityScreen(me);
      return;
    }

    const row = event.target.closest(".pr-team-capacity-row");
    if (row) {
      const userId = Number(row.dataset.userId || 0);
      if (userId) {
        await loadTeamCapacityUserDetail(me, userId);
      }
    }
  });

  document.addEventListener("keydown", async (event) => {
    const row = event.target.closest(".pr-team-capacity-row");
    if (!row) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const userId = Number(row.dataset.userId || 0);
      if (userId) {
        await loadTeamCapacityUserDetail(me, userId);
      }
    }
  });

  document.addEventListener("change", (event) => {
    if (
      event.target?.id === "prTeamCapacityActiveOnly" ||
      event.target?.id === "prTeamCapacityOnlyAvailable" ||
      event.target?.id === "prTeamCapacityOnlyOverloaded" ||
      event.target?.id === "prTeamCapacityRole"
    ) {
      syncTeamCapacityFiltersFromDom();
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (event.target?.id === "prTeamCapacitySearch" && event.key === "Enter") {
      syncTeamCapacityFiltersFromDom();
      await loadTeamCapacityDashboard(me, { force: true });
    }
  });
}

function syncTeamCapacityFiltersFromDom() {
  const qEl = document.getElementById("prTeamCapacitySearch");
  const roleEl = document.getElementById("prTeamCapacityRole");
  const activeEl = document.getElementById("prTeamCapacityActiveOnly");
  const availEl = document.getElementById("prTeamCapacityOnlyAvailable");
  const overloadEl = document.getElementById("prTeamCapacityOnlyOverloaded");

  PR_TEAM_CAPACITY_CACHE.filters.q = qEl?.value?.trim() || "";
  PR_TEAM_CAPACITY_CACHE.filters.role_on_engagement = roleEl?.value || "";
  PR_TEAM_CAPACITY_CACHE.filters.active_only = !!activeEl?.checked;
  PR_TEAM_CAPACITY_CACHE.filters.only_available = !!availEl?.checked;
  PR_TEAM_CAPACITY_CACHE.filters.only_overloaded = !!overloadEl?.checked;
  PR_TEAM_CAPACITY_CACHE.filters.offset = 0;

  if (PR_TEAM_CAPACITY_CACHE.filters.only_available) {
    PR_TEAM_CAPACITY_CACHE.filters.only_overloaded = false;
    if (overloadEl) overloadEl.checked = false;
  }

  if (PR_TEAM_CAPACITY_CACHE.filters.only_overloaded) {
    PR_TEAM_CAPACITY_CACHE.filters.only_available = false;
    if (availEl) availEl.checked = false;
  }
}


async function renderPortfolioReviewScreen(me) {
  const host = document.getElementById("screen-portfolio-review");
  if (!host) {
    console.warn("screen-portfolio-review not found");
    return;
  }

  host.innerHTML = `
    <div class="pr-screen pr-portfolio-review-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Portfolio Review</h1>
          <p class="pr-screen__subtitle">
            Portfolio-wide engagement health, due dates, blockers, readiness tracking, and client risk indicators.
          </p>
        </div>

        <div class="pr-screen__actions">
          <button class="btn btn-ghost" id="prPortfolioReviewRefreshBtn" type="button">Refresh</button>
        </div>
      </div>

      <div class="pr-panel pr-portfolio-review-filters">
        <div class="pr-filter-grid pr-filter-grid--portfolio">
          <label class="pr-field">
            <span class="pr-field__label">Search</span>
            <input
              id="prPortfolioReviewSearch"
              class="pr-input"
              type="text"
              placeholder="Search engagement, code, type, or client"
              value="${escapeHtml(PR_PORTFOLIO_REVIEW_CACHE.filters.q || "")}"
            />
          </label>

          <label class="pr-field pr-field--check">
            <input
              id="prPortfolioReviewActiveOnly"
              type="checkbox"
              ${PR_PORTFOLIO_REVIEW_CACHE.filters.active_only ? "checked" : ""}
            />
            <span>Active only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input
              id="prPortfolioReviewRiskOnly"
              type="checkbox"
              ${PR_PORTFOLIO_REVIEW_CACHE.filters.risk_only ? "checked" : ""}
            />
            <span>Risk only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input
              id="prPortfolioReviewOverdueOnly"
              type="checkbox"
              ${PR_PORTFOLIO_REVIEW_CACHE.filters.overdue_only ? "checked" : ""}
            />
            <span>Overdue only</span>
          </label>

          <div class="pr-filter-actions">
            <button class="btn btn-primary" id="prPortfolioReviewApplyBtn" type="button">Apply</button>
            <button class="btn btn-ghost" id="prPortfolioReviewResetBtn" type="button">Reset</button>
          </div>
        </div>
      </div>

      <div id="prPortfolioReviewSummary" class="pr-portfolio-review-summary"></div>

      <div class="pr-portfolio-review-layout">
        <div class="pr-panel pr-portfolio-review-main">
          <div class="pr-panel__head">
            <div>
              <h3>Portfolio engagements</h3>
              <p>Health, due-date pressure, blockers, and readiness across the engagement portfolio.</p>
            </div>
          </div>

          <div id="prPortfolioReviewTableWrap" class="pr-portfolio-review-table-wrap">
            ${renderPortfolioReviewTableSkeleton()}
          </div>
        </div>

        <aside class="pr-panel pr-portfolio-review-side">
          <div class="pr-panel__head">
            <div>
              <h3>Client risk view</h3>
              <p>Clients requiring escalation, management focus, or partner attention.</p>
            </div>
          </div>

          <div id="prPortfolioReviewClientRiskWrap">
            ${renderPortfolioReviewClientRiskSkeleton()}
          </div>
        </aside>
      </div>
    </div>
  `;

  bindPortfolioReviewEvents(me);
  loadPortfolioReviewDashboard(me, { force: true });
}

function getPortfolioRiskClass(riskBand) {
  if (riskBand === "high") return "is-danger";
  if (riskBand === "medium") return "is-warning";
  return "is-good";
}

function getPortfolioRiskLabel(riskBand) {
  if (riskBand === "high") return "High";
  if (riskBand === "medium") return "Medium";
  return "Low";
}

function renderPortfolioReviewTableSkeleton() {
  return `
    <div class="pr-table-state">
      <div class="pr-loading">Loading portfolio review…</div>
    </div>
  `;
}

function renderPortfolioReviewClientRiskSkeleton() {
  return `
    <div class="pr-table-state">
      <div class="pr-loading">Loading client risk…</div>
    </div>
  `;
}

function formatPortfolioPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function renderPortfolioReviewSummary(summary = {}) {
  const host = document.getElementById("prPortfolioReviewSummary");
  if (!host) return;

  const wpCompletion =
    Number(summary.total_working_papers || 0) > 0
      ? (Number(summary.completed_working_papers || 0) / Number(summary.total_working_papers || 0)) * 100
      : 0;

  const deliverableCompletion =
    Number(summary.total_deliverables || 0) > 0
      ? (Number(summary.completed_deliverables || 0) / Number(summary.total_deliverables || 0)) * 100
      : 0;

  host.innerHTML = `
    <div class="pr-summary-grid">
      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Active engagements</div>
        <div class="pr-summary-card__value">${formatInt(summary.total_engagements)}</div>
        <div class="pr-summary-card__hint">Portfolio items currently in scope</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Overdue engagements</div>
        <div class="pr-summary-card__value pr-text-danger">${formatInt(summary.overdue_engagements)}</div>
        <div class="pr-summary-card__hint">Past due and not yet completed</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Due this week</div>
        <div class="pr-summary-card__value pr-text-warning">${formatInt(summary.due_this_week)}</div>
        <div class="pr-summary-card__hint">Immediate date pressure</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Blocked engagements</div>
        <div class="pr-summary-card__value pr-text-warning">${formatInt(summary.blocked_engagements)}</div>
        <div class="pr-summary-card__hint">Blocked work papers or deliverables</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Pending sign-off</div>
        <div class="pr-summary-card__value">${formatInt(summary.pending_signoff_engagements)}</div>
        <div class="pr-summary-card__hint">Awaiting review or sign-off completion</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Escalated</div>
        <div class="pr-summary-card__value pr-text-danger">${formatInt(summary.escalated_engagements)}</div>
        <div class="pr-summary-card__hint">Open escalation activity</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">WP completion</div>
        <div class="pr-summary-card__value">${formatPortfolioPct(wpCompletion)}</div>
        <div class="pr-summary-card__hint">Working paper completion rate</div>
      </article>

      <article class="pr-summary-card">
        <div class="pr-summary-card__label">Deliverable completion</div>
        <div class="pr-summary-card__value">${formatPortfolioPct(deliverableCompletion)}</div>
        <div class="pr-summary-card__hint">Deliverable completion rate</div>
      </article>
    </div>
  `;
}

function renderPortfolioReviewEngagements(rows = []) {
  const host = document.getElementById("prPortfolioReviewTableWrap");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `
      <div class="pr-table-state">
        <div class="pr-empty-state__title">No portfolio items found</div>
        <div class="pr-empty-state__desc">Try adjusting the filters.</div>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="pr-table-scroll">
      <table class="pr-table pr-portfolio-review-table">
        <thead>
          <tr>
            <th>Engagement</th>
            <th>Client</th>
            <th>Due date</th>
            <th>Risk</th>
            <th>Readiness</th>
            <th>Overdue WP</th>
            <th>Blocked</th>
            <th>Escalations</th>
            <th>Pending sign-off</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderPortfolioReviewEngagementRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPortfolioReviewEngagementRow(row) {
  const blockedCount =
    Number(row.blocked_working_papers || 0) + Number(row.blocked_deliverables || 0);

  return `
    <tr>
      <td>
        <div class="pr-user-cell">
          <div class="pr-user-cell__name">${escapeHtml(row.engagement_name || "Untitled engagement")}</div>
          <div class="pr-user-cell__meta">
            ${escapeHtml(row.engagement_code || "")}
            ${row.engagement_type ? `• ${escapeHtml(row.engagement_type)}` : ""}
            ${row.priority ? `• ${escapeHtml(row.priority)}` : ""}
          </div>
        </div>
      </td>
      <td>${escapeHtml(row.customer_name || "—")}</td>
      <td>${escapeHtml(row.due_date || "—")}</td>
      <td>
        <span class="pr-badge ${getPortfolioRiskClass(row.risk_band)}">
          ${escapeHtml(getPortfolioRiskLabel(row.risk_band))}
        </span>
      </td>
      <td><strong>${formatPortfolioPct(row.readiness_percent)}</strong></td>
      <td>${formatInt(row.overdue_working_papers)}</td>
      <td>${formatInt(blockedCount)}</td>
      <td>${formatInt(row.open_escalations)}</td>
      <td>${formatInt(row.pending_signoff_steps)}</td>
    </tr>
  `;
}

function renderPortfolioReviewClientRisk(rows = []) {
  const host = document.getElementById("prPortfolioReviewClientRiskWrap");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">No client risk items</div>
        <div class="pr-empty-state__desc">No clients currently match the risk view.</div>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="pr-client-risk-list">
      ${rows.map(renderPortfolioReviewClientRiskItem).join("")}
    </div>
  `;
}

function renderPortfolioReviewClientRiskItem(row) {
  const riskScore =
    Number(row.open_escalations || 0) +
    Number(row.overdue_engagements || 0) +
    Number(row.overdue_deliverables || 0) +
    Number(row.blocked_deliverables || 0) +
    Number(row.blocked_working_papers || 0);

  const band = riskScore >= 3 ? "high" : riskScore >= 1 ? "medium" : "low";

  return `
    <article class="pr-detail-card">
      <div class="pr-detail-card__top">
        <div>
          <div class="pr-detail-card__title">${escapeHtml(row.customer_name || "Unassigned client")}</div>
          <div class="pr-detail-card__meta">
            ${formatInt(row.total_engagements)} engagements
          </div>
        </div>
        <span class="pr-badge ${getPortfolioRiskClass(band)}">
          ${escapeHtml(getPortfolioRiskLabel(band))}
        </span>
      </div>

      <div class="pr-detail-card__grid">
        <div><span>Overdue engagements</span><strong>${formatInt(row.overdue_engagements)}</strong></div>
        <div><span>Overdue deliverables</span><strong>${formatInt(row.overdue_deliverables)}</strong></div>
        <div><span>Overdue WP</span><strong>${formatInt(row.overdue_working_papers)}</strong></div>
        <div><span>Blocked deliverables</span><strong>${formatInt(row.blocked_deliverables)}</strong></div>
        <div><span>Blocked WP</span><strong>${formatInt(row.blocked_working_papers)}</strong></div>
        <div><span>Open escalations</span><strong>${formatInt(row.open_escalations)}</strong></div>
      </div>
    </article>
  `;
}

async function loadPortfolioReviewDashboard(me, { force = false } = {}) {
  if (!me?.company_id) return;

  const companyId = me.company_id;
  const filters = { ...PR_PORTFOLIO_REVIEW_CACHE.filters };
  PR_PORTFOLIO_REVIEW_CACHE.loading = true;

  const tableWrap = document.getElementById("prPortfolioReviewTableWrap");
  const clientRiskWrap = document.getElementById("prPortfolioReviewClientRiskWrap");

  if (force && tableWrap) {
    tableWrap.innerHTML = renderPortfolioReviewTableSkeleton();
  }
  if (force && clientRiskWrap) {
    clientRiskWrap.innerHTML = renderPortfolioReviewClientRiskSkeleton();
  }

  try {
    const url = ENDPOINTS.portfolioReviewDashboard(companyId, {
      customer_id: filters.customer_id,
      q: filters.q,
      active_only: filters.active_only,
      risk_only: filters.risk_only,
      overdue_only: filters.overdue_only,
      limit: filters.limit,
      offset: filters.offset
    });

    const res = await apiFetch(url);
    const data = res?.data || res || {};

    PR_PORTFOLIO_REVIEW_CACHE.summary = data.summary || {};
    PR_PORTFOLIO_REVIEW_CACHE.engagements = data.engagements || [];
    PR_PORTFOLIO_REVIEW_CACHE.clientRisk = data.client_risk || [];

    renderPortfolioReviewSummary(PR_PORTFOLIO_REVIEW_CACHE.summary);
    renderPortfolioReviewEngagements(PR_PORTFOLIO_REVIEW_CACHE.engagements);
    renderPortfolioReviewClientRisk(PR_PORTFOLIO_REVIEW_CACHE.clientRisk);
  } catch (err) {
    console.error("loadPortfolioReviewDashboard failed", err);

    if (tableWrap) {
      tableWrap.innerHTML = `
        <div class="pr-table-state">
          <div class="pr-empty-state__title">Could not load portfolio review</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }

    if (clientRiskWrap) {
      clientRiskWrap.innerHTML = `
        <div class="pr-empty-state">
          <div class="pr-empty-state__title">Could not load client risk</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }

    renderPortfolioReviewSummary({});
  } finally {
    PR_PORTFOLIO_REVIEW_CACHE.loading = false;
  }
}

function bindPortfolioReviewEvents(me) {
  if (PR_PORTFOLIO_REVIEW_EVENTS_BOUND) return;
  PR_PORTFOLIO_REVIEW_EVENTS_BOUND = true;

  document.addEventListener("click", async (event) => {
    const refreshBtn = event.target.closest("#prPortfolioReviewRefreshBtn");
    if (refreshBtn) {
      await loadPortfolioReviewDashboard(me, { force: true });
      return;
    }

    const applyBtn = event.target.closest("#prPortfolioReviewApplyBtn");
    if (applyBtn) {
      syncPortfolioReviewFiltersFromDom();
      await loadPortfolioReviewDashboard(me, { force: true });
      return;
    }

    const resetBtn = event.target.closest("#prPortfolioReviewResetBtn");
    if (resetBtn) {
      PR_PORTFOLIO_REVIEW_CACHE.filters = {
        customer_id: "",
        q: "",
        active_only: true,
        risk_only: false,
        overdue_only: false,
        limit: 100,
        offset: 0
      };
      renderPortfolioReviewScreen(me);
    }
  });

  document.addEventListener("change", (event) => {
    if (
      event.target?.id === "prPortfolioReviewActiveOnly" ||
      event.target?.id === "prPortfolioReviewRiskOnly" ||
      event.target?.id === "prPortfolioReviewOverdueOnly"
    ) {
      syncPortfolioReviewFiltersFromDom();
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (event.target?.id === "prPortfolioReviewSearch" && event.key === "Enter") {
      syncPortfolioReviewFiltersFromDom();
      await loadPortfolioReviewDashboard(me, { force: true });
    }
  });
}

function syncPortfolioReviewFiltersFromDom() {
  const qEl = document.getElementById("prPortfolioReviewSearch");
  const activeEl = document.getElementById("prPortfolioReviewActiveOnly");
  const riskEl = document.getElementById("prPortfolioReviewRiskOnly");
  const overdueEl = document.getElementById("prPortfolioReviewOverdueOnly");

  PR_PORTFOLIO_REVIEW_CACHE.filters.q = qEl?.value?.trim() || "";
  PR_PORTFOLIO_REVIEW_CACHE.filters.active_only = !!activeEl?.checked;
  PR_PORTFOLIO_REVIEW_CACHE.filters.risk_only = !!riskEl?.checked;
  PR_PORTFOLIO_REVIEW_CACHE.filters.overdue_only = !!overdueEl?.checked;
  PR_PORTFOLIO_REVIEW_CACHE.filters.offset = 0;
}

async function renderEscalationCenterScreen(me) {
  const host = document.getElementById("screen-escalation-center");
  if (!host) {
    console.warn("screen-escalations not found");
    return;
  }

  host.innerHTML = `
    <div class="pr-screen pr-escalations-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Escalations</h1>
          <p class="pr-screen__subtitle">
             Review, assign, update, and resolve escalation items across engagements.
          </p>
        </div>

        <div class="pr-screen__actions pr-filter-actions">
          <button class="btn btn-ghost" id="prEscalationsBackfillBtn" type="button">Backfill Overdue WP</button>
          <button class="btn btn-primary" id="prEscalationsNewBtn" type="button">New Escalation</button>
          <button class="btn btn-ghost" id="prEscalationsRefreshBtn" type="button">Refresh</button>
        </div>
      </div>

      <div class="pr-panel">
        <div class="pr-filter-grid pr-filter-grid--escalations">
          <label class="pr-field">
            <span class="pr-field__label">Search</span>
            <input
              id="prEscalationsSearch"
              class="pr-input"
              type="text"
              placeholder="Search title, engagement, code, client"
              value="${escapeHtml(PR_ESCALATIONS_CACHE.filters.q || "")}"
            />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Status</span>
            <select id="prEscalationsStatus" class="pr-select">
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Severity</span>
            <select id="prEscalationsSeverity" class="pr-select">
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Type</span>
            <select id="prEscalationsType" class="pr-select">
              <option value="">All</option>
              <option value="deadline_risk">Deadline risk</option>
              <option value="quality_issue">Quality issue</option>
              <option value="blocker">Blocker</option>
              <option value="client_issue">Client issue</option>
              <option value="review_delay">Review delay</option>
              <option value="signoff_delay">Signoff delay</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Source</span>
            <select id="prEscalationsSourceType" class="pr-select">
              <option value="">All</option>
              <option value="working_paper">Working paper</option>
              <option value="deliverable">Deliverable</option>
              <option value="signoff">Signoff</option>
              <option value="posting_activity">Posting activity</option>
              <option value="monthly_close_task">Monthly close task</option>
              <option value="year_end_task">Year-end task</option>
              <option value="manual">Manual</option>
            </select>
          </label>

          <label class="pr-field pr-field--check">
            <input id="prEscalationsActiveOnly" type="checkbox" ${PR_ESCALATIONS_CACHE.filters.active_only ? "checked" : ""} />
            <span>Active only</span>
          </label>

          <div class="pr-filter-actions">
            <button class="btn btn-primary" id="prEscalationsApplyBtn" type="button">Apply</button>
            <button class="btn btn-ghost" id="prEscalationsResetBtn" type="button">Reset</button>
          </div>
        </div>
      </div>

      <div class="pr-escalations-layout">
        <div class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Escalation register</h3>
              <p>Open and historical escalation items across the engagement portfolio.</p>
            </div>
          </div>
          <div id="prEscalationsTableWrap">
            ${renderEscalationsTableSkeleton()}
          </div>
        </div>

        <aside class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Detail</h3>
              <p>Selected escalation details and quick actions.</p>
            </div>
          </div>
          <div id="prEscalationsDetailWrap">
            ${renderEscalationsEmptyDetail()}
          </div>
        </aside>
      </div>
    </div>

    <div id="prEscalationsModal" class="pr-modal hidden">
      <div class="pr-modal__backdrop" data-close-escalation-modal="1"></div>
      <div class="pr-modal__dialog">
        <div class="pr-modal__head">
          <h3 id="prEscalationsModalTitle">New Escalation</h3>
          <button class="btn btn-ghost" type="button" data-close-escalation-modal="1">Close</button>
        </div>

        <div class="pr-modal__body pr-escalation-form">
          <input type="hidden" id="prEscalationFormId" />

          <label class="pr-field">
            <span class="pr-field__label">Engagement ID</span>
            <input id="prEscalationEngagementId" class="pr-input" type="number" />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Source type</span>
            <select id="prEscalationSourceType" class="pr-select">
              <option value="manual">Manual</option>
              <option value="working_paper">Working paper</option>
              <option value="deliverable">Deliverable</option>
              <option value="signoff">Signoff</option>
              <option value="posting_activity">Posting activity</option>
              <option value="monthly_close_task">Monthly close task</option>
              <option value="year_end_task">Year-end task</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Source ID</span>
            <input id="prEscalationSourceId" class="pr-input" type="number" />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Type</span>
            <select id="prEscalationType" class="pr-select">
              <option value="deadline_risk">Deadline risk</option>
              <option value="quality_issue">Quality issue</option>
              <option value="blocker">Blocker</option>
              <option value="client_issue">Client issue</option>
              <option value="review_delay">Review delay</option>
              <option value="signoff_delay">Signoff delay</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Severity</span>
            <select id="prEscalationSeverity" class="pr-select">
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Status</span>
            <select id="prEscalationStatus" class="pr-select">
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Assigned to user ID</span>
            <input id="prEscalationAssignedToUserId" class="pr-input" type="number" />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Due date</span>
            <input id="prEscalationDueDate" class="pr-input" type="date" />
          </label>

          <label class="pr-field pr-field--full">
            <span class="pr-field__label">Title</span>
            <input id="prEscalationTitle" class="pr-input" type="text" />
          </label>

          <label class="pr-field pr-field--full">
            <span class="pr-field__label">Description</span>
            <textarea id="prEscalationDescription" class="pr-textarea" rows="5"></textarea>
          </label>
        </div>

        <div class="pr-modal__foot">
          <button class="btn btn-primary" id="prEscalationSaveBtn" type="button">Save</button>
        </div>
      </div>
    </div>
  `;

  const statusEl = document.getElementById("prEscalationsStatus");
  const severityEl = document.getElementById("prEscalationsSeverity");
  const typeEl = document.getElementById("prEscalationsType");
  const sourceEl = document.getElementById("prEscalationsSourceType");

  if (statusEl) statusEl.value = PR_ESCALATIONS_CACHE.filters.status || "";
  if (severityEl) severityEl.value = PR_ESCALATIONS_CACHE.filters.severity || "";
  if (typeEl) typeEl.value = PR_ESCALATIONS_CACHE.filters.escalation_type || "";
  if (sourceEl) sourceEl.value = PR_ESCALATIONS_CACHE.filters.source_type || "";

  bindEscalationsEvents(me);
  await loadEscalationsScreen(me, { force: true });
}

async function renderEngagementEscalationsScreen(me) {
  const host = document.getElementById("screen-engagement-escalations");
  if (!host) {
    console.warn("screen-engagement-escalations not found");
    return;
  }

  const engagementId =
    window.getPractitionerActiveEngagementId?.() ||
    Number(window.__PR_CONTEXT__?.engagementId || 0) ||
    Number(PR_SELECTED_ENGAGEMENT?.id || 0) ||
    0;

  host.innerHTML = `
    <div class="pr-screen pr-escalations-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Engagement Escalations</h1>
          <p class="pr-screen__subtitle">
            Raise and track escalation items for the current engagement.
          </p>
        </div>

        <div class="pr-screen__actions pr-filter-actions">
          <button class="btn btn-primary" id="prEngagementEscalationsNewBtn" type="button">New Escalation</button>
          <button class="btn btn-ghost" id="prEngagementEscalationsRefreshBtn" type="button">Refresh</button>
        </div>
      </div>

      <div class="pr-panel">
        <div class="pr-filter-grid pr-filter-grid--escalations">
          <label class="pr-field">
            <span class="pr-field__label">Search</span>
            <input
              id="prEngagementEscalationsSearch"
              class="pr-input"
              type="text"
              placeholder="Search title, type, source"
              value="${escapeHtml(PR_ESCALATIONS_CACHE.filters.q || "")}"
            />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Status</span>
            <select id="prEngagementEscalationsStatus" class="pr-select">
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Severity</span>
            <select id="prEngagementEscalationsSeverity" class="pr-select">
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label class="pr-field pr-field--check">
            <input id="prEngagementEscalationsActiveOnly" type="checkbox" ${PR_ESCALATIONS_CACHE.filters.active_only ? "checked" : ""} />
            <span>Active only</span>
          </label>

          <div class="pr-filter-actions">
            <button class="btn btn-primary" id="prEngagementEscalationsApplyBtn" type="button">Apply</button>
            <button class="btn btn-ghost" id="prEngagementEscalationsResetBtn" type="button">Reset</button>
          </div>
        </div>
      </div>

      <div class="pr-escalations-layout">
        <div class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Escalations for engagement</h3>
              <p>${engagementId ? `Engagement ID: ${engagementId}` : "No engagement selected."}</p>
            </div>
          </div>
          <div id="prEngagementEscalationsTableWrap">
            ${renderEscalationsTableSkeleton()}
          </div>
        </div>

        <aside class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Detail</h3>
              <p>Selected escalation details for this engagement.</p>
            </div>
          </div>
          <div id="prEngagementEscalationsDetailWrap">
            ${renderEscalationsEmptyDetail()}
          </div>
        </aside>
      </div>
    </div>

    <div id="prEngagementEscalationsModal" class="pr-modal hidden">
      <div class="pr-modal__backdrop" data-close-engagement-escalation-modal="1"></div>
      <div class="pr-modal__dialog">
        <div class="pr-modal__head">
          <h3 id="prEngagementEscalationsModalTitle">New Escalation</h3>
          <button class="btn btn-ghost" type="button" data-close-engagement-escalation-modal="1">Close</button>
        </div>

        <div class="pr-modal__body pr-escalation-form">
          <input type="hidden" id="prEngagementEscalationFormId" />

          <label class="pr-field">
            <span class="pr-field__label">Engagement ID</span>
            <input id="prEngagementEscalationEngagementId" class="pr-input" type="number" value="${engagementId || ""}" />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Source type</span>
            <select id="prEngagementEscalationSourceType" class="pr-select">
              <option value="manual">Manual</option>
              <option value="working_paper">Working paper</option>
              <option value="deliverable">Deliverable</option>
              <option value="signoff">Signoff</option>
              <option value="posting_activity">Posting activity</option>
              <option value="monthly_close_task">Monthly close task</option>
              <option value="year_end_task">Year-end task</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Source ID</span>
            <input id="prEngagementEscalationSourceId" class="pr-input" type="number" />
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Type</span>
            <select id="prEngagementEscalationType" class="pr-select">
              <option value="deadline_risk">Deadline risk</option>
              <option value="quality_issue">Quality issue</option>
              <option value="blocker">Blocker</option>
              <option value="client_issue">Client issue</option>
              <option value="review_delay">Review delay</option>
              <option value="signoff_delay">Signoff delay</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Severity</span>
            <select id="prEngagementEscalationSeverity" class="pr-select">
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <label class="pr-field">
            <span class="pr-field__label">Due date</span>
            <input id="prEngagementEscalationDueDate" class="pr-input" type="date" />
          </label>

          <label class="pr-field pr-field--full">
            <span class="pr-field__label">Title</span>
            <input id="prEngagementEscalationTitle" class="pr-input" type="text" />
          </label>

          <label class="pr-field pr-field--full">
            <span class="pr-field__label">Description</span>
            <textarea id="prEngagementEscalationDescription" class="pr-textarea" rows="5"></textarea>
          </label>
        </div>

        <div class="pr-modal__foot">
          <button class="btn btn-primary" id="prEngagementEscalationSaveBtn" type="button">Save</button>
        </div>
      </div>
    </div>
  `;

  const statusEl = document.getElementById("prEngagementEscalationsStatus");
  const severityEl = document.getElementById("prEngagementEscalationsSeverity");

  if (statusEl) statusEl.value = PR_ESCALATIONS_CACHE.filters.status || "";
  if (severityEl) severityEl.value = PR_ESCALATIONS_CACHE.filters.severity || "";

  bindEngagementEscalationsEvents(me);
  await loadEngagementEscalationsScreen(me, { force: true });
}

function getEscalationSeverityClass(severity) {
  if (severity === "critical" || severity === "high") return "is-danger";
  if (severity === "medium") return "is-warning";
  return "is-good";
}

function getEscalationStatusClass(status) {
  if (status === "open") return "is-danger";
  if (status === "in_progress") return "is-warning";
  return "is-good";
}

function renderEscalationsTableSkeleton() {
  return `
    <div class="pr-table-state">
      <div class="pr-loading">Loading escalations…</div>
    </div>
  `;
}

function renderEscalationsEmptyDetail() {
  return `
    <div class="pr-empty-state">
      <div class="pr-empty-state__title">No escalation selected</div>
      <div class="pr-empty-state__desc">Select an escalation to view and manage it.</div>
    </div>
  `;
}

function openEscalationModal(mode, row = null) {
  const modal = document.getElementById("prEscalationsModal");
  if (!modal) return;

  document.getElementById("prEscalationsModalTitle").textContent =
    mode === "edit" ? "Edit Escalation" : "New Escalation";

  document.getElementById("prEscalationFormId").value = row?.id || "";
  document.getElementById("prEscalationEngagementId").value = row?.engagement_id || "";
  document.getElementById("prEscalationSourceType").value = row?.source_type || "manual";
  document.getElementById("prEscalationSourceId").value = row?.source_id || "";
  document.getElementById("prEscalationType").value = row?.escalation_type || "deadline_risk";
  document.getElementById("prEscalationSeverity").value = row?.severity || "medium";
  document.getElementById("prEscalationStatus").value = row?.status || "open";
  document.getElementById("prEscalationAssignedToUserId").value = row?.assigned_to_user_id || "";
  document.getElementById("prEscalationDueDate").value = row?.due_date || "";
  document.getElementById("prEscalationTitle").value = row?.title || "";
  document.getElementById("prEscalationDescription").value = row?.description || "";

  modal.classList.remove("hidden");
}

function closeEscalationModal() {
  const modal = document.getElementById("prEscalationsModal");
  if (modal) modal.classList.add("hidden");
}

function renderEscalationsTable(rows = []) {
  const host = document.getElementById("prEscalationsTableWrap");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `
      <div class="pr-table-state">
        <div class="pr-empty-state__title">No escalations found</div>
        <div class="pr-empty-state__desc">Try different filters or backfill overdue working papers.</div>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="pr-table-scroll">
      <table class="pr-table pr-escalations-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Engagement</th>
            <th>Client</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Type</th>
            <th>Due date</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="pr-escalation-row ${Number(PR_ESCALATIONS_CACHE.selectedId) === Number(row.id) ? "is-selected" : ""}" data-escalation-id="${Number(row.id)}" tabindex="0">
              <td>
                <div class="pr-user-cell">
                  <div class="pr-user-cell__name">${escapeHtml(row.title || "Untitled escalation")}</div>
                  <div class="pr-user-cell__meta">${escapeHtml(row.source_type || "")}${row.escalation_code ? ` • ${escapeHtml(row.escalation_code)}` : ""}</div>
                </div>
              </td>
              <td>${escapeHtml(row.engagement_name || "—")}</td>
              <td>${escapeHtml(row.customer_name || "—")}</td>
              <td><span class="pr-badge ${getEscalationSeverityClass(row.severity)}">${escapeHtml(row.severity || "—")}</span></td>
              <td><span class="pr-badge ${getEscalationStatusClass(row.status)}">${escapeHtml(row.status || "—")}</span></td>
              <td>${escapeHtml(row.escalation_type || "—")}</td>
              <td>${escapeHtml(row.due_date || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEscalationsDetail(row) {
  const host = document.getElementById("prEscalationsDetailWrap");
  if (!host) return;

  if (!row) {
    host.innerHTML = renderEscalationsEmptyDetail();
    return;
  }

  host.innerHTML = `
    <div class="pr-user-detail">
      <div class="pr-detail-card">
        <div class="pr-detail-card__top">
          <div>
            <div class="pr-detail-card__title">${escapeHtml(row.title || "Untitled escalation")}</div>
            <div class="pr-detail-card__meta">
              ${escapeHtml(row.engagement_name || "—")}
              ${row.engagement_code ? ` • ${escapeHtml(row.engagement_code)}` : ""}
            </div>
          </div>
          <div class="pr-filter-actions">
            <button class="btn btn-primary" type="button" id="prEscalationEditBtn">Edit</button>
            <button class="btn btn-ghost" type="button" id="prEscalationDeactivateBtn">Deactivate</button>
          </div>
        </div>

        <div class="pr-detail-card__grid">
          <div><span>Client</span><strong>${escapeHtml(row.customer_name || "—")}</strong></div>
          <div><span>Severity</span><strong>${escapeHtml(row.severity || "—")}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(row.status || "—")}</strong></div>
          <div><span>Type</span><strong>${escapeHtml(row.escalation_type || "—")}</strong></div>
          <div><span>Source</span><strong>${escapeHtml(row.source_type || "—")}</strong></div>
          <div><span>Source ID</span><strong>${escapeHtml(row.source_id || "—")}</strong></div>
          <div><span>Raised by</span><strong>${escapeHtml(row.raised_by_user_name || "—")}</strong></div>
          <div><span>Assigned to</span><strong>${escapeHtml(row.assigned_to_user_name || "—")}</strong></div>
          <div><span>Due date</span><strong>${escapeHtml(row.due_date || "—")}</strong></div>
          <div><span>Created</span><strong>${escapeHtml(row.created_at || "—")}</strong></div>
        </div>

        <div class="pr-empty-state__desc" style="margin-top:12px;">
          ${escapeHtml(row.description || "No description provided.")}
        </div>
      </div>
    </div>
  `;
}

async function loadEscalationsScreen(me, { force = false } = {}) {
  if (!me?.company_id) return;

  const companyId = me.company_id;
  const filters = { ...PR_ESCALATIONS_CACHE.filters };
  PR_ESCALATIONS_CACHE.loading = true;

  const tableWrap = document.getElementById("prEscalationsTableWrap");
  if (force && tableWrap) {
    tableWrap.innerHTML = renderEscalationsTableSkeleton();
  }

  try {
    const url = ENDPOINTS.escalationsList(companyId, {
      engagement_id: filters.engagement_id,
      customer_id: filters.customer_id,
      status: filters.status,
      severity: filters.severity,
      escalation_type: filters.escalation_type,
      source_type: filters.source_type,
      assigned_to_user_id: filters.assigned_to_user_id,
      q: filters.q,
      active_only: filters.active_only,
      limit: filters.limit,
      offset: filters.offset
    });

    const res = await apiFetch(url);
    PR_ESCALATIONS_CACHE.rows = res?.data?.rows || res?.rows || [];

    renderEscalationsTable(PR_ESCALATIONS_CACHE.rows);

    const selectedStillExists = PR_ESCALATIONS_CACHE.rows.some(
      (r) => Number(r.id) === Number(PR_ESCALATIONS_CACHE.selectedId)
    );

    if (!selectedStillExists) {
      PR_ESCALATIONS_CACHE.selectedId = PR_ESCALATIONS_CACHE.rows[0]?.id || null;
    }

    if (PR_ESCALATIONS_CACHE.selectedId) {
      await loadEscalationDetail(me, PR_ESCALATIONS_CACHE.selectedId);
    } else {
      PR_ESCALATIONS_CACHE.selectedRow = null;
      renderEscalationsDetail(null);
    }
  } catch (err) {
    console.error("loadEscalationsScreen failed", err);
    if (tableWrap) {
      tableWrap.innerHTML = `
        <div class="pr-table-state">
          <div class="pr-empty-state__title">Could not load escalations</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }
    renderEscalationsDetail(null);
  } finally {
    PR_ESCALATIONS_CACHE.loading = false;
  }
}

async function loadEscalationDetail(me, escalationId) {
  if (!me?.company_id || !escalationId) return;

  PR_ESCALATIONS_CACHE.selectedId = escalationId;
  renderEscalationsTable(PR_ESCALATIONS_CACHE.rows);

  const host = document.getElementById("prEscalationsDetailWrap");
  if (host) host.innerHTML = `<div class="pr-loading">Loading escalation detail…</div>`;

  try {
    const res = await apiFetch(ENDPOINTS.escalationsGet(me.company_id, escalationId));
    PR_ESCALATIONS_CACHE.selectedRow = res?.data?.row || res?.row || null;
    renderEscalationsDetail(PR_ESCALATIONS_CACHE.selectedRow);
  } catch (err) {
    console.error("loadEscalationDetail failed", err);
    if (host) {
      host.innerHTML = `
        <div class="pr-empty-state">
          <div class="pr-empty-state__title">Could not load escalation</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }
  }
}

async function saveEscalation(me) {
  const escalationId = document.getElementById("prEscalationFormId")?.value || "";
  const payload = {
    engagement_id: Number(document.getElementById("prEscalationEngagementId")?.value || 0),
    source_type: document.getElementById("prEscalationSourceType")?.value || "manual",
    source_id: document.getElementById("prEscalationSourceId")?.value ? Number(document.getElementById("prEscalationSourceId").value) : null,
    escalation_type: document.getElementById("prEscalationType")?.value || "other",
    severity: document.getElementById("prEscalationSeverity")?.value || "medium",
    status: document.getElementById("prEscalationStatus")?.value || "open",
    assigned_to_user_id: document.getElementById("prEscalationAssignedToUserId")?.value ? Number(document.getElementById("prEscalationAssignedToUserId").value) : null,
    due_date: document.getElementById("prEscalationDueDate")?.value || null,
    title: document.getElementById("prEscalationTitle")?.value?.trim() || "",
    description: document.getElementById("prEscalationDescription")?.value?.trim() || ""
  };

  if (!payload.engagement_id) {
    alert("Engagement ID is required.");
    return;
  }

  if (!payload.source_type || !payload.escalation_type) {
    alert("Source type and escalation type are required.");
    return;
  }

  if (escalationId) {
    await apiFetch(ENDPOINTS.escalationsUpdate(me.company_id, escalationId), {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    await apiFetch(ENDPOINTS.escalationsCreate(me.company_id), {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  closeEscalationModal();
  await loadEscalationsScreen(me, { force: true });
}

async function deactivateSelectedEscalation(me) {
  const id = PR_ESCALATIONS_CACHE.selectedId;
  if (!id) return;

  const ok = window.confirm("Deactivate this escalation?");
  if (!ok) return;

  await apiFetch(ENDPOINTS.escalationsDeactivate(me.company_id, id), {
    method: "POST"
  });

  PR_ESCALATIONS_CACHE.selectedId = null;
  PR_ESCALATIONS_CACHE.selectedRow = null;
  await loadEscalationsScreen(me, { force: true });
}

async function runEscalationsBackfill(me) {
  await apiFetch(ENDPOINTS.escalationsBackfillOverdueWP(me.company_id), {
    method: "POST"
  });
  await loadEscalationsScreen(me, { force: true });
}

function bindEscalationsEvents(me) {
  if (PR_ESCALATIONS_EVENTS_BOUND) return;
  PR_ESCALATIONS_EVENTS_BOUND = true;

  document.addEventListener("click", async (event) => {
    if (event.target.closest("#prEscalationsRefreshBtn")) {
      await loadEscalationsScreen(me, { force: true });
      return;
    }

    if (event.target.closest("#prEscalationsApplyBtn")) {
      syncEscalationsFiltersFromDom();
      await loadEscalationsScreen(me, { force: true });
      return;
    }

    if (event.target.closest("#prEscalationsResetBtn")) {
      PR_ESCALATIONS_CACHE.filters = {
        engagement_id: "",
        customer_id: "",
        status: "",
        severity: "",
        escalation_type: "",
        source_type: "",
        assigned_to_user_id: "",
        q: "",
        active_only: true,
        limit: 100,
        offset: 0
      };
      await renderEscalationCenterScreen(me);
      return;
    }

    if (event.target.closest("#prEscalationsBackfillBtn")) {
      await runEscalationsBackfill(me);
      return;
    }

    if (event.target.closest("#prEscalationsNewBtn")) {
      openEscalationModal("create");
      return;
    }

    if (event.target.closest("#prEscalationEditBtn")) {
      if (PR_ESCALATIONS_CACHE.selectedRow) {
        openEscalationModal("edit", PR_ESCALATIONS_CACHE.selectedRow);
      }
      return;
    }

    if (event.target.closest("#prEscalationDeactivateBtn")) {
      await deactivateSelectedEscalation(me);
      return;
    }

    if (event.target.closest("#prEscalationSaveBtn")) {
      await saveEscalation(me);
      return;
    }

    if (event.target.closest("[data-close-escalation-modal='1']")) {
      closeEscalationModal();
      return;
    }

    const row = event.target.closest(".pr-escalation-row");
    if (row) {
      const escalationId = Number(row.dataset.escalationId || 0);
      if (escalationId) {
        await loadEscalationDetail(me, escalationId);
      }
    }
  });

  document.addEventListener("keydown", async (event) => {
    const row = event.target.closest(".pr-escalation-row");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const escalationId = Number(row.dataset.escalationId || 0);
      if (escalationId) {
        await loadEscalationDetail(me, escalationId);
      }
      return;
    }

    if (event.target?.id === "prEscalationsSearch" && event.key === "Enter") {
      syncEscalationsFiltersFromDom();
      await loadEscalationsScreen(me, { force: true });
    }
  });

  document.addEventListener("change", (event) => {
    if (
      event.target?.id === "prEscalationsStatus" ||
      event.target?.id === "prEscalationsSeverity" ||
      event.target?.id === "prEscalationsType" ||
      event.target?.id === "prEscalationsSourceType" ||
      event.target?.id === "prEscalationsActiveOnly"
    ) {
      syncEscalationsFiltersFromDom();
    }
  });
}

async function loadEngagementEscalationsScreen(me, { force = false } = {}) {
  if (!me?.company_id) return;

  const engagementId =
    window.getPractitionerActiveEngagementId?.() ||
    Number(window.__PR_CONTEXT__?.engagementId || 0) ||
    Number(PR_SELECTED_ENGAGEMENT?.id || 0) ||
    0;

  const tableWrap = document.getElementById("prEngagementEscalationsTableWrap");
  const detailWrap = document.getElementById("prEngagementEscalationsDetailWrap");

  if (force && tableWrap) {
    tableWrap.innerHTML = renderEscalationsTableSkeleton();
  }

  if (!engagementId) {
    if (tableWrap) {
      tableWrap.innerHTML = `
        <div class="pr-table-state">
          <div class="pr-empty-state__title">No engagement selected</div>
          <div class="pr-empty-state__desc">Select an engagement first to view engagement escalations.</div>
        </div>
      `;
    }
    if (detailWrap) detailWrap.innerHTML = renderEscalationsEmptyDetail();
    return;
  }

  try {
    const res = await apiFetch(
      ENDPOINTS.escalationsList(me.company_id, {
        engagement_id: engagementId,
        status: PR_ESCALATIONS_CACHE.filters.status,
        severity: PR_ESCALATIONS_CACHE.filters.severity,
        q: PR_ESCALATIONS_CACHE.filters.q,
        active_only: PR_ESCALATIONS_CACHE.filters.active_only,
        limit: PR_ESCALATIONS_CACHE.filters.limit,
        offset: PR_ESCALATIONS_CACHE.filters.offset
      })
    );

    PR_ESCALATIONS_CACHE.rows = res?.data?.rows || res?.rows || [];

    renderEngagementEscalationsTable(PR_ESCALATIONS_CACHE.rows);

    const selectedStillExists = PR_ESCALATIONS_CACHE.rows.some(
      (r) => Number(r.id) === Number(PR_ESCALATIONS_CACHE.selectedId)
    );

    if (!selectedStillExists) {
      PR_ESCALATIONS_CACHE.selectedId = PR_ESCALATIONS_CACHE.rows[0]?.id || null;
    }

    if (PR_ESCALATIONS_CACHE.selectedId) {
      await loadEngagementEscalationDetail(me, PR_ESCALATIONS_CACHE.selectedId);
    } else {
      PR_ESCALATIONS_CACHE.selectedRow = null;
      if (detailWrap) detailWrap.innerHTML = renderEscalationsEmptyDetail();
    }
  } catch (err) {
    console.error("loadEngagementEscalationsScreen failed", err);
    if (tableWrap) {
      tableWrap.innerHTML = `
        <div class="pr-table-state">
          <div class="pr-empty-state__title">Could not load engagement escalations</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }
    if (detailWrap) detailWrap.innerHTML = renderEscalationsEmptyDetail();
  }
}

async function loadEngagementEscalationDetail(me, escalationId) {
  if (!me?.company_id || !escalationId) return;

  PR_ESCALATIONS_CACHE.selectedId = escalationId;
  renderEngagementEscalationsTable(PR_ESCALATIONS_CACHE.rows);

  const host = document.getElementById("prEngagementEscalationsDetailWrap");
  if (host) host.innerHTML = `<div class="pr-loading">Loading escalation detail…</div>`;

  try {
    const res = await apiFetch(ENDPOINTS.escalationsGet(me.company_id, escalationId));
    PR_ESCALATIONS_CACHE.selectedRow = res?.data?.row || res?.row || null;
    renderEngagementEscalationsDetail(PR_ESCALATIONS_CACHE.selectedRow);
  } catch (err) {
    console.error("loadEngagementEscalationDetail failed", err);
    if (host) {
      host.innerHTML = `
        <div class="pr-empty-state">
          <div class="pr-empty-state__title">Could not load escalation</div>
          <div class="pr-empty-state__desc">${escapeHtml(err.message || "Request failed")}</div>
        </div>
      `;
    }
  }
}

function renderEngagementEscalationsTable(rows = []) {
  const host = document.getElementById("prEngagementEscalationsTableWrap");
  if (!host) return;

  if (!rows.length) {
    host.innerHTML = `
      <div class="pr-table-state">
        <div class="pr-empty-state__title">No escalations found</div>
        <div class="pr-empty-state__desc">Raise a new escalation for this engagement when needed.</div>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="pr-table-scroll">
      <table class="pr-table pr-escalations-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Type</th>
            <th>Due date</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="pr-escalation-row ${Number(PR_ESCALATIONS_CACHE.selectedId) === Number(row.id) ? "is-selected" : ""}" data-engagement-escalation-id="${Number(row.id)}" tabindex="0">
              <td>
                <div class="pr-user-cell">
                  <div class="pr-user-cell__name">${escapeHtml(row.title || "Untitled escalation")}</div>
                  <div class="pr-user-cell__meta">${escapeHtml(row.source_type || "")}</div>
                </div>
              </td>
              <td><span class="pr-badge ${getEscalationSeverityClass(row.severity)}">${escapeHtml(row.severity || "—")}</span></td>
              <td><span class="pr-badge ${getEscalationStatusClass(row.status)}">${escapeHtml(row.status || "—")}</span></td>
              <td>${escapeHtml(row.escalation_type || "—")}</td>
              <td>${escapeHtml(row.due_date || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEngagementEscalationsDetail(row) {
  const host = document.getElementById("prEngagementEscalationsDetailWrap");
  if (!host) return;

  if (!row) {
    host.innerHTML = renderEscalationsEmptyDetail();
    return;
  }

  host.innerHTML = `
    <div class="pr-user-detail">
      <div class="pr-detail-card">
        <div class="pr-detail-card__top">
          <div>
            <div class="pr-detail-card__title">${escapeHtml(row.title || "Untitled escalation")}</div>
            <div class="pr-detail-card__meta">${escapeHtml(row.engagement_name || "—")}</div>
          </div>
          <div class="pr-filter-actions">
            <button class="btn btn-primary" type="button" id="prEngagementEscalationEditBtn">Edit</button>
          </div>
        </div>

        <div class="pr-detail-card__grid">
          <div><span>Severity</span><strong>${escapeHtml(row.severity || "—")}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(row.status || "—")}</strong></div>
          <div><span>Type</span><strong>${escapeHtml(row.escalation_type || "—")}</strong></div>
          <div><span>Source</span><strong>${escapeHtml(row.source_type || "—")}</strong></div>
          <div><span>Source ID</span><strong>${escapeHtml(row.source_id || "—")}</strong></div>
          <div><span>Due date</span><strong>${escapeHtml(row.due_date || "—")}</strong></div>
        </div>

        <div class="pr-empty-state__desc" style="margin-top:12px;">
          ${escapeHtml(row.description || "No description provided.")}
        </div>
      </div>
    </div>
  `;
}

function openEngagementEscalationModal(mode, row = null) {
  const modal = document.getElementById("prEngagementEscalationsModal");
  if (!modal) return;

  const engagementId =
    row?.engagement_id ||
    window.getPractitionerActiveEngagementId?.() ||
    Number(window.__PR_CONTEXT__?.engagementId || 0) ||
    Number(PR_SELECTED_ENGAGEMENT?.id || 0) ||
    "";

  document.getElementById("prEngagementEscalationsModalTitle").textContent =
    mode === "edit" ? "Edit Escalation" : "New Escalation";

  document.getElementById("prEngagementEscalationFormId").value = row?.id || "";
  document.getElementById("prEngagementEscalationEngagementId").value = engagementId;
  document.getElementById("prEngagementEscalationSourceType").value = row?.source_type || "manual";
  document.getElementById("prEngagementEscalationSourceId").value = row?.source_id || "";
  document.getElementById("prEngagementEscalationType").value = row?.escalation_type || "deadline_risk";
  document.getElementById("prEngagementEscalationSeverity").value = row?.severity || "medium";
  document.getElementById("prEngagementEscalationDueDate").value = row?.due_date || "";
  document.getElementById("prEngagementEscalationTitle").value = row?.title || "";
  document.getElementById("prEngagementEscalationDescription").value = row?.description || "";

  modal.classList.remove("hidden");
}

function closeEngagementEscalationModal() {
  const modal = document.getElementById("prEngagementEscalationsModal");
  if (modal) modal.classList.add("hidden");
}

async function saveEngagementEscalation(me) {
  const escalationId = document.getElementById("prEngagementEscalationFormId")?.value || "";
  const payload = {
    engagement_id: Number(document.getElementById("prEngagementEscalationEngagementId")?.value || 0),
    source_type: document.getElementById("prEngagementEscalationSourceType")?.value || "manual",
    source_id: document.getElementById("prEngagementEscalationSourceId")?.value
      ? Number(document.getElementById("prEngagementEscalationSourceId").value)
      : null,
    escalation_type: document.getElementById("prEngagementEscalationType")?.value || "other",
    severity: document.getElementById("prEngagementEscalationSeverity")?.value || "medium",
    title: document.getElementById("prEngagementEscalationTitle")?.value?.trim() || "",
    description: document.getElementById("prEngagementEscalationDescription")?.value?.trim() || "",
    due_date: document.getElementById("prEngagementEscalationDueDate")?.value || null
  };

  if (!payload.engagement_id) {
    alert("Engagement ID is required.");
    return;
  }

  if (!payload.source_type || !payload.escalation_type) {
    alert("Source type and escalation type are required.");
    return;
  }

  if (escalationId) {
    await apiFetch(ENDPOINTS.escalationsUpdate(me.company_id, escalationId), {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    await apiFetch(ENDPOINTS.escalationsCreate(me.company_id), {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  closeEngagementEscalationModal();
  await loadEngagementEscalationsScreen(me, { force: true });
}

function bindEngagementEscalationsEvents(me) {
  if (window.__PR_ENGAGEMENT_ESCALATIONS_EVENTS_BOUND__) return;
  window.__PR_ENGAGEMENT_ESCALATIONS_EVENTS_BOUND__ = true;

  document.addEventListener("click", async (event) => {
    if (event.target.closest("#prEngagementEscalationsRefreshBtn")) {
      await loadEngagementEscalationsScreen(me, { force: true });
      return;
    }

    if (event.target.closest("#prEngagementEscalationsApplyBtn")) {
      syncEngagementEscalationsFiltersFromDom();
      await loadEngagementEscalationsScreen(me, { force: true });
      return;
    }

    if (event.target.closest("#prEngagementEscalationsResetBtn")) {
      PR_ESCALATIONS_CACHE.filters.q = "";
      PR_ESCALATIONS_CACHE.filters.status = "";
      PR_ESCALATIONS_CACHE.filters.severity = "";
      PR_ESCALATIONS_CACHE.filters.active_only = true;
      PR_ESCALATIONS_CACHE.filters.offset = 0;
      await renderEngagementEscalationsScreen(me);
      return;
    }

    if (event.target.closest("#prEngagementEscalationsNewBtn")) {
      openEngagementEscalationModal("create");
      return;
    }

    if (event.target.closest("#prEngagementEscalationEditBtn")) {
      if (PR_ESCALATIONS_CACHE.selectedRow) {
        openEngagementEscalationModal("edit", PR_ESCALATIONS_CACHE.selectedRow);
      }
      return;
    }

    if (event.target.closest("#prEngagementEscalationSaveBtn")) {
      await saveEngagementEscalation(me);
      return;
    }

    if (event.target.closest("[data-close-engagement-escalation-modal='1']")) {
      closeEngagementEscalationModal();
      return;
    }

    const row = event.target.closest(".pr-escalation-row[data-engagement-escalation-id]");
    if (row) {
      const escalationId = Number(row.dataset.engagementEscalationId || 0);
      if (escalationId) {
        await loadEngagementEscalationDetail(me, escalationId);
      }
    }
  });

  document.addEventListener("keydown", async (event) => {
    const row = event.target.closest(".pr-escalation-row[data-engagement-escalation-id]");
    if (row && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const escalationId = Number(row.dataset.engagementEscalationId || 0);
      if (escalationId) {
        await loadEngagementEscalationDetail(me, escalationId);
      }
      return;
    }

    if (event.target?.id === "prEngagementEscalationsSearch" && event.key === "Enter") {
      syncEngagementEscalationsFiltersFromDom();
      await loadEngagementEscalationsScreen(me, { force: true });
    }
  });

  document.addEventListener("change", (event) => {
    if (
      event.target?.id === "prEngagementEscalationsStatus" ||
      event.target?.id === "prEngagementEscalationsSeverity" ||
      event.target?.id === "prEngagementEscalationsActiveOnly"
    ) {
      syncEngagementEscalationsFiltersFromDom();
    }
  });
}

function syncEngagementEscalationsFiltersFromDom() {
  PR_ESCALATIONS_CACHE.filters.q =
    document.getElementById("prEngagementEscalationsSearch")?.value?.trim() || "";
  PR_ESCALATIONS_CACHE.filters.status =
    document.getElementById("prEngagementEscalationsStatus")?.value || "";
  PR_ESCALATIONS_CACHE.filters.severity =
    document.getElementById("prEngagementEscalationsSeverity")?.value || "";
  PR_ESCALATIONS_CACHE.filters.active_only =
    !!document.getElementById("prEngagementEscalationsActiveOnly")?.checked;
  PR_ESCALATIONS_CACHE.filters.offset = 0;
}

function syncEscalationsFiltersFromDom() {
  PR_ESCALATIONS_CACHE.filters.q = document.getElementById("prEscalationsSearch")?.value?.trim() || "";
  PR_ESCALATIONS_CACHE.filters.status = document.getElementById("prEscalationsStatus")?.value || "";
  PR_ESCALATIONS_CACHE.filters.severity = document.getElementById("prEscalationsSeverity")?.value || "";
  PR_ESCALATIONS_CACHE.filters.escalation_type = document.getElementById("prEscalationsType")?.value || "";
  PR_ESCALATIONS_CACHE.filters.source_type = document.getElementById("prEscalationsSourceType")?.value || "";
  PR_ESCALATIONS_CACHE.filters.active_only = !!document.getElementById("prEscalationsActiveOnly")?.checked;
  PR_ESCALATIONS_CACHE.filters.offset = 0;
}

function getPractitionerCompanyId(me) {
  return (
    me?.company_id ||
    window.__PR_ME__?.company_id ||
    window.currentUser?.company_id ||
    JSON.parse(localStorage.getItem("fs_user") || "null")?.company_id ||
    ""
  );
}

function formatDateSafe(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function formatNumberSafe(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function formatPercentSafe(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(0) : "0"}%`;
}

function badgeClassForCapacityBand(value) {
  const v = String(value || "").toLowerCase();
  if (v === "overloaded") return "pr-badge is-danger";
  if (v === "available") return "pr-badge is-good";
  return "pr-badge is-warning";
}

function badgeClassForPressure(value) {
  const v = String(value || "").toLowerCase();
  if (v === "overdue" || v === "this_week") return "pr-badge is-danger";
  if (v === "this_month") return "pr-badge is-warning";
  return "pr-badge is-good";
}

function resourcePlanningSelectedRows(cache) {
  switch (cache.selectedTab) {
    case "coverage":
      return cache.coverageGaps || [];
    case "reallocation":
      return cache.reallocation || [];
    case "schedule":
      return cache.schedule || [];
    case "peaks":
    default:
      return cache.peaks || [];
  }
}

function getResourcePlanningRowKey(tab, row) {
  if (!row) return "";
  if (tab === "peaks" || tab === "coverage") {
    return `engagement:${row.engagement_id}`;
  }
  return `user:${row.user_id}`;
}

function syncResourcePlanningSelection() {
  const rows = resourcePlanningSelectedRows(PR_RESOURCE_PLANNING_CACHE);
  const selected =
    rows.find((row) => getResourcePlanningRowKey(PR_RESOURCE_PLANNING_CACHE.selectedTab, row) === PR_RESOURCE_PLANNING_CACHE.selectedKey) ||
    rows[0] ||
    null;

  PR_RESOURCE_PLANNING_CACHE.selectedRow = selected;
  PR_RESOURCE_PLANNING_CACHE.selectedKey = selected
    ? getResourcePlanningRowKey(PR_RESOURCE_PLANNING_CACHE.selectedTab, selected)
    : "";
}

async function loadResourcePlanningData(me, { silent = false } = {}) {
  const companyId = getPractitionerCompanyId(me);
  if (!companyId) throw new Error("Company context missing.");

  const filters = PR_RESOURCE_PLANNING_CACHE.filters;

  if (!silent) {
    PR_RESOURCE_PLANNING_CACHE.loading = true;
    renderResourcePlanningScreen(me);
  }

  try {
    const [summaryRes, peaksRes, coverageRes, reallocationRes, scheduleRes] = await Promise.all([
      apiFetch(
        ENDPOINTS.resourcePlanning.summary(companyId, {
          q: filters.q,
          role_on_engagement: filters.role_on_engagement,
          active_only: filters.active_only,
          horizon_days: filters.horizon_days
        })
      ),
      apiFetch(
        ENDPOINTS.resourcePlanning.peaks(companyId, {
          q: filters.q,
          role_on_engagement: filters.role_on_engagement,
          active_only: filters.active_only,
          horizon_days: filters.horizon_days,
          limit: filters.limit,
          offset: filters.offset
        })
      ),
      apiFetch(
        ENDPOINTS.resourcePlanning.coverageGaps(companyId, {
          q: filters.q,
          active_only: filters.active_only,
          horizon_days: filters.horizon_days,
          limit: filters.limit,
          offset: filters.offset
        })
      ),
      apiFetch(
        ENDPOINTS.resourcePlanning.reallocation(companyId, {
          q: filters.q,
          role_on_engagement: filters.role_on_engagement,
          active_only: filters.active_only,
          horizon_days: filters.horizon_days,
          limit: filters.limit,
          offset: filters.offset
        })
      ),
      apiFetch(
        ENDPOINTS.resourcePlanning.schedule(companyId, {
          q: filters.q,
          role_on_engagement: filters.role_on_engagement,
          active_only: filters.active_only,
          horizon_days: filters.horizon_days,
          only_available: filters.only_available,
          only_overloaded: filters.only_overloaded,
          limit: filters.limit,
          offset: filters.offset
        })
      )
    ]);

    PR_RESOURCE_PLANNING_CACHE.summary = summaryRes?.data || summaryRes || {};
    PR_RESOURCE_PLANNING_CACHE.peaks = peaksRes?.data || peaksRes || [];
    PR_RESOURCE_PLANNING_CACHE.coverageGaps = coverageRes?.data || coverageRes || [];
    PR_RESOURCE_PLANNING_CACHE.reallocation = reallocationRes?.data || reallocationRes || [];
    PR_RESOURCE_PLANNING_CACHE.schedule = scheduleRes?.data || scheduleRes || [];

    syncResourcePlanningSelection();
  } finally {
    PR_RESOURCE_PLANNING_CACHE.loading = false;
  }
}

function renderResourcePlanningTable(cache) {
  const rows = resourcePlanningSelectedRows(cache);

  if (!rows.length) {
    return `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">No results found</div>
        <div class="pr-empty-state__desc">Try adjusting the search, role, workload, or horizon filters.</div>
      </div>
    `;
  }

  if (cache.selectedTab === "peaks") {
    return `
      <div class="pr-resource-planning-table-wrap">
        <div class="pr-table-scroll">
          <table class="pr-resource-planning-table">
            <thead>
              <tr>
                <th>Engagement</th>
                <th>Customer</th>
                <th>Due date</th>
                <th>Stage</th>
                <th>Pressure</th>
                <th>Total alloc.</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const key = getResourcePlanningRowKey("peaks", row);
                const selected = key === cache.selectedKey ? "is-selected" : "";
                return `
                  <tr class="pr-resource-row ${selected}" data-rp-row="${escapeHtml(key)}">
                    <td>
                      <div class="pr-resource-name">
                        <div class="pr-resource-name__title">${escapeHtml(row.engagement_name || "Untitled engagement")}</div>
                        <div class="pr-resource-name__meta">${escapeHtml(row.engagement_code || "No code")} · ${escapeHtml(row.engagement_type || "—")}</div>
                      </div>
                    </td>
                    <td>${escapeHtml(row.customer_name || "—")}</td>
                    <td>${escapeHtml(formatDateSafe(row.due_date))}</td>
                    <td>${escapeHtml(row.workflow_stage || "—")}</td>
                    <td><span class="${badgeClassForPressure(row.pressure_window)}">${escapeHtml(row.pressure_window || "upcoming")}</span></td>
                    <td>${escapeHtml(formatPercentSafe(row.total_allocation_percent))}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (cache.selectedTab === "coverage") {
    return `
      <div class="pr-resource-planning-table-wrap">
        <div class="pr-table-scroll">
          <table class="pr-resource-planning-table">
            <thead>
              <tr>
                <th>Engagement</th>
                <th>Customer</th>
                <th>Due date</th>
                <th>Missing roles</th>
                <th>Alloc.</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const key = getResourcePlanningRowKey("coverage", row);
                const selected = key === cache.selectedKey ? "is-selected" : "";
                const missingRoles = Array.isArray(row.missing_roles) ? row.missing_roles : [];
                return `
                  <tr class="pr-resource-row ${selected}" data-rp-row="${escapeHtml(key)}">
                    <td>
                      <div class="pr-resource-name">
                        <div class="pr-resource-name__title">${escapeHtml(row.engagement_name || "Untitled engagement")}</div>
                        <div class="pr-resource-name__meta">${escapeHtml(row.engagement_code || "No code")} · ${escapeHtml(row.status || "—")}</div>
                      </div>
                    </td>
                    <td>${escapeHtml(row.customer_name || "—")}</td>
                    <td>${escapeHtml(formatDateSafe(row.due_date))}</td>
                    <td>
                      <div class="pr-missing-role-list">
                        ${missingRoles.length
                          ? missingRoles.map((role) => `<span class="pr-chip-soft">${escapeHtml(role)}</span>`).join("")
                          : `<span class="pr-chip-soft">none</span>`}
                      </div>
                    </td>
                    <td>${escapeHtml(formatPercentSafe(row.total_allocation_percent))}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (cache.selectedTab === "reallocation") {
    return `
      <div class="pr-resource-planning-table-wrap">
        <div class="pr-table-scroll">
          <table class="pr-resource-planning-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Email</th>
                <th>Engagements</th>
                <th>Total alloc.</th>
                <th>Band</th>
                <th>Adjustment</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const key = getResourcePlanningRowKey("reallocation", row);
                const selected = key === cache.selectedKey ? "is-selected" : "";
                return `
                  <tr class="pr-resource-row ${selected}" data-rp-row="${escapeHtml(key)}">
                    <td>
                      <div class="pr-resource-name">
                        <div class="pr-resource-name__title">${escapeHtml(row.user_name || "Unknown user")}</div>
                        <div class="pr-resource-name__meta">Due soon: ${escapeHtml(formatNumberSafe(row.engagements_due_soon))}</div>
                      </div>
                    </td>
                    <td>${escapeHtml(row.email || "—")}</td>
                    <td>${escapeHtml(formatNumberSafe(row.active_engagements))}</td>
                    <td>${escapeHtml(formatPercentSafe(row.total_allocation_percent))}</td>
                    <td><span class="${badgeClassForCapacityBand(row.capacity_band)}">${escapeHtml(row.capacity_band || "balanced")}</span></td>
                    <td>${escapeHtml(formatPercentSafe(row.adjustment_percent))}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  return `
    <div class="pr-resource-planning-table-wrap">
      <div class="pr-table-scroll">
        <table class="pr-resource-planning-table">
          <thead>
            <tr>
              <th>Team member</th>
              <th>Email</th>
              <th>Engagements</th>
              <th>Total alloc.</th>
              <th>Due soon</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const key = getResourcePlanningRowKey("schedule", row);
              const selected = key === cache.selectedKey ? "is-selected" : "";
              const band = row.is_overloaded ? "overloaded" : row.is_available ? "available" : "balanced";
              return `
                <tr class="pr-resource-row ${selected}" data-rp-row="${escapeHtml(key)}">
                  <td>
                    <div class="pr-resource-name">
                      <div class="pr-resource-name__title">${escapeHtml(row.user_name || "Unknown user")}</div>
                    </div>
                  </td>
                  <td>${escapeHtml(row.email || "—")}</td>
                  <td>${escapeHtml(formatNumberSafe(row.active_engagements))}</td>
                  <td>${escapeHtml(formatPercentSafe(row.total_allocation_percent))}</td>
                  <td>${escapeHtml(formatNumberSafe(row.engagements_due_soon))}</td>
                  <td><span class="${badgeClassForCapacityBand(band)}">${escapeHtml(band)}</span></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderResourcePlanningDetail(cache) {
  const row = cache.selectedRow;

  if (!row) {
    return `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">Nothing selected</div>
        <div class="pr-empty-state__desc">Pick a row to inspect workload, gaps, and upcoming pressure.</div>
      </div>
    `;
  }

  if (cache.selectedTab === "peaks" || cache.selectedTab === "coverage") {
    const missingRoles = Array.isArray(row.missing_roles) ? row.missing_roles : [];
    return `
      <div class="pr-user-detail">
        <div class="pr-side-card">
          <div class="pr-side-card__title">Engagement overview</div>
          <div class="pr-side-card__grid">
            <div class="pr-side-card__field">
              <span>Engagement</span>
              <strong>${escapeHtml(row.engagement_name || "—")}</strong>
            </div>
            <div class="pr-side-card__field">
              <span>Code</span>
              <strong>${escapeHtml(row.engagement_code || "—")}</strong>
            </div>
            <div class="pr-side-card__field">
              <span>Customer</span>
              <strong>${escapeHtml(row.customer_name || "—")}</strong>
            </div>
            <div class="pr-side-card__field">
              <span>Due date</span>
              <strong>${escapeHtml(formatDateSafe(row.due_date))}</strong>
            </div>
            <div class="pr-side-card__field">
              <span>Status</span>
              <strong>${escapeHtml(row.status || "—")}</strong>
            </div>
            <div class="pr-side-card__field">
              <span>Workflow stage</span>
              <strong>${escapeHtml(row.workflow_stage || "—")}</strong>
            </div>
          </div>
        </div>

        <div class="pr-user-detail__stats">
          <div class="pr-mini-stat">
            <span class="pr-mini-stat__label">Manager coverage</span>
            <strong>${formatNumberSafe(row.manager_count)}</strong>
          </div>
          <div class="pr-mini-stat">
            <span class="pr-mini-stat__label">Reviewer coverage</span>
            <strong>${formatNumberSafe(row.reviewer_count)}</strong>
          </div>
          <div class="pr-mini-stat">
            <span class="pr-mini-stat__label">Partner coverage</span>
            <strong>${formatNumberSafe(row.partner_count)}</strong>
          </div>
          <div class="pr-mini-stat">
            <span class="pr-mini-stat__label">Total allocation</span>
            <strong>${formatPercentSafe(row.total_allocation_percent)}</strong>
          </div>
        </div>

        <div class="pr-side-card">
          <div class="pr-side-card__title">Gap and pressure view</div>
          <div class="pr-list-compact">
            <div class="pr-list-compact__item">
              <div class="pr-list-compact__title">Pressure window</div>
              <div class="pr-list-compact__meta">
                ${escapeHtml(row.pressure_window || "No pressure label")}
              </div>
            </div>
            <div class="pr-list-compact__item">
              <div class="pr-list-compact__title">Missing roles</div>
              <div class="pr-list-compact__meta">
                ${
                  missingRoles.length
                    ? missingRoles.map((role) => escapeHtml(role)).join(", ")
                    : "No flagged role gaps on this row"
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="pr-user-detail">
      <div class="pr-side-card">
        <div class="pr-side-card__title">Resource overview</div>
        <div class="pr-side-card__grid">
          <div class="pr-side-card__field">
            <span>Name</span>
            <strong>${escapeHtml(row.user_name || "—")}</strong>
          </div>
          <div class="pr-side-card__field">
            <span>Email</span>
            <strong>${escapeHtml(row.email || "—")}</strong>
          </div>
          <div class="pr-side-card__field">
            <span>Active engagements</span>
            <strong>${formatNumberSafe(row.active_engagements)}</strong>
          </div>
          <div class="pr-side-card__field">
            <span>Due soon</span>
            <strong>${formatNumberSafe(row.engagements_due_soon)}</strong>
          </div>
          <div class="pr-side-card__field">
            <span>Total allocation</span>
            <strong>${formatPercentSafe(row.total_allocation_percent)}</strong>
          </div>
          <div class="pr-side-card__field">
            <span>Band</span>
            <strong>${
              escapeHtml(
                row.capacity_band ||
                (row.is_overloaded ? "overloaded" : row.is_available ? "available" : "balanced")
              )
            }</strong>
          </div>
        </div>
      </div>

      <div class="pr-user-detail__stats">
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Capacity adjustment</span>
          <strong>${formatPercentSafe(row.adjustment_percent)}</strong>
        </div>
        <div class="pr-mini-stat">
          <span class="pr-mini-stat__label">Load status</span>
          <strong>${
            row.is_overloaded ? "Overloaded" :
            row.is_available ? "Available" :
            row.capacity_band ? escapeHtml(row.capacity_band) :
            "Balanced"
          }</strong>
        </div>
      </div>

      <div class="pr-side-card">
        <div class="pr-side-card__title">Planning note</div>
        <div class="pr-list-compact">
          <div class="pr-list-compact__item">
            <div class="pr-list-compact__title">Reallocation guidance</div>
            <div class="pr-list-compact__meta">
              ${
                Number(row.total_allocation_percent || 0) > 100
                  ? "This person is above target capacity and may need workload moved off before upcoming deadlines."
                  : Number(row.total_allocation_percent || 0) < 70
                  ? "This person appears to have room for reassignment or peak-period support."
                  : "This person looks broadly balanced based on current allocation totals."
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderResourcePlanningScreen(me) {
  const host = document.getElementById("screen-resource-planning");
  if (!host) return;

  const cache = PR_RESOURCE_PLANNING_CACHE;
  const summary = cache.summary || {};

  host.innerHTML = `
    <div class="pr-screen pr-resource-planning-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Resource Planning</h1>
          <p class="pr-screen__subtitle">
            Forward-looking staffing, scheduling pressure, coverage gaps, and reallocation planning.
          </p>
        </div>
      </div>

      <section class="pr-panel pr-team-capacity-filters">
        <div class="pr-panel__head">
          <div>
            <h3>Planning filters</h3>
            <p>Refine by workload horizon, role, and availability pressure.</p>
          </div>
        </div>

        <div class="pr-filter-grid pr-filter-grid--resource-planning">
          <div class="pr-field">
            <label class="pr-field__label" for="rpSearchInput">Search</label>
            <input
              id="rpSearchInput"
              class="pr-input"
              type="text"
              placeholder="Search engagement, customer, code, or user"
              value="${escapeHtml(cache.filters.q)}"
            />
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="rpRoleFilter">Role</label>
            <select id="rpRoleFilter" class="pr-select">
              <option value="">All roles</option>
              <option value="manager" ${cache.filters.role_on_engagement === "manager" ? "selected" : ""}>Manager</option>
              <option value="reviewer" ${cache.filters.role_on_engagement === "reviewer" ? "selected" : ""}>Reviewer</option>
              <option value="partner" ${cache.filters.role_on_engagement === "partner" ? "selected" : ""}>Partner</option>
              <option value="qc" ${cache.filters.role_on_engagement === "qc" ? "selected" : ""}>QC</option>
              <option value="preparer" ${cache.filters.role_on_engagement === "preparer" ? "selected" : ""}>Preparer</option>
            </select>
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="rpHorizonFilter">Horizon</label>
            <select id="rpHorizonFilter" class="pr-select">
              <option value="30" ${String(cache.filters.horizon_days) === "30" ? "selected" : ""}>30 days</option>
              <option value="60" ${String(cache.filters.horizon_days) === "60" ? "selected" : ""}>60 days</option>
              <option value="90" ${String(cache.filters.horizon_days) === "90" ? "selected" : ""}>90 days</option>
              <option value="120" ${String(cache.filters.horizon_days) === "120" ? "selected" : ""}>120 days</option>
            </select>
          </div>

          <label class="pr-field pr-field--check">
            <input id="rpActiveOnly" type="checkbox" ${cache.filters.active_only ? "checked" : ""} />
            <span class="pr-field__label">Active only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input id="rpOnlyAvailable" type="checkbox" ${cache.filters.only_available ? "checked" : ""} />
            <span class="pr-field__label">Available only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input id="rpOnlyOverloaded" type="checkbox" ${cache.filters.only_overloaded ? "checked" : ""} />
            <span class="pr-field__label">Overloaded only</span>
          </label>

          <div class="pr-filter-actions">
            <button id="rpApplyFiltersBtn" class="btn btn-primary" type="button">Apply</button>
            <button id="rpResetFiltersBtn" class="btn btn-ghost" type="button">Reset</button>
          </div>
        </div>
      </section>

      <section class="pr-summary-grid pr-team-capacity-summary">
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Total engagements</div>
          <div class="pr-summary-card__value">${formatNumberSafe(summary.total_engagements)}</div>
          <div class="pr-summary-card__hint">In current planning scope</div>
        </div>

        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Upcoming peaks</div>
          <div class="pr-summary-card__value">${formatNumberSafe(summary.upcoming_peaks)}</div>
          <div class="pr-summary-card__hint">Deadlines approaching within horizon</div>
        </div>

        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Coverage gaps</div>
          <div class="pr-summary-card__value pr-text-warning">${formatNumberSafe(summary.coverage_gaps)}</div>
          <div class="pr-summary-card__hint">Manager/reviewer/partner gaps</div>
        </div>

        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Overloaded engagements</div>
          <div class="pr-summary-card__value pr-text-danger">${formatNumberSafe(summary.overloaded_engagements)}</div>
          <div class="pr-summary-card__hint">Allocation above expected level</div>
        </div>

        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Overloaded users</div>
          <div class="pr-summary-card__value pr-text-danger">${formatNumberSafe(summary.overloaded_users)}</div>
          <div class="pr-summary-card__hint">Potential reassignment targets</div>
        </div>

        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Available users</div>
          <div class="pr-summary-card__value pr-text-good">${formatNumberSafe(summary.available_users)}</div>
          <div class="pr-summary-card__hint">Capacity available for support</div>
        </div>
      </section>

      <section class="pr-resource-planning-layout">
        <div class="pr-panel pr-resource-planning-main">
          <div class="pr-panel__head">
            <div>
              <h3>Planning workspace</h3>
              <p>Switch between due-date pressure, coverage gaps, reallocation, and schedule view.</p>
            </div>
          </div>

          <div class="pr-resource-tabs">
            <button class="pr-resource-tab ${cache.selectedTab === "peaks" ? "is-active" : ""}" data-rp-tab="peaks" type="button">Upcoming peaks</button>
            <button class="pr-resource-tab ${cache.selectedTab === "coverage" ? "is-active" : ""}" data-rp-tab="coverage" type="button">Coverage gaps</button>
            <button class="pr-resource-tab ${cache.selectedTab === "reallocation" ? "is-active" : ""}" data-rp-tab="reallocation" type="button">Reallocation</button>
            <button class="pr-resource-tab ${cache.selectedTab === "schedule" ? "is-active" : ""}" data-rp-tab="schedule" type="button">Schedule view</button>
          </div>

          ${
            cache.loading
              ? `<div class="pr-loading">Loading resource planning data…</div>`
              : renderResourcePlanningTable(cache)
          }
        </div>

        <aside class="pr-panel pr-resource-planning-side">
          <div class="pr-panel__head">
            <div>
              <h3>Selection detail</h3>
              <p>Quick context for action and reassignment decisions.</p>
            </div>
          </div>

          ${
            cache.loading
              ? `<div class="pr-loading">Loading detail…</div>`
              : renderResourcePlanningDetail(cache)
          }
        </aside>
      </section>
    </div>
  `;

  bindResourcePlanningEvents(me);
}

function bindResourcePlanningEvents(me) {
  const host = document.getElementById("screen-resource-planning");
  if (!host) return;

  const searchInput = host.querySelector("#rpSearchInput");
  const roleFilter = host.querySelector("#rpRoleFilter");
  const horizonFilter = host.querySelector("#rpHorizonFilter");
  const activeOnly = host.querySelector("#rpActiveOnly");
  const onlyAvailable = host.querySelector("#rpOnlyAvailable");
  const onlyOverloaded = host.querySelector("#rpOnlyOverloaded");
  const applyBtn = host.querySelector("#rpApplyFiltersBtn");
  const resetBtn = host.querySelector("#rpResetFiltersBtn");

  host.querySelectorAll("[data-rp-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      PR_RESOURCE_PLANNING_CACHE.selectedTab = btn.getAttribute("data-rp-tab") || "peaks";
      syncResourcePlanningSelection();
      renderResourcePlanningScreen(me);
    });
  });

  host.querySelectorAll("[data-rp-row]").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      PR_RESOURCE_PLANNING_CACHE.selectedKey = rowEl.getAttribute("data-rp-row") || "";
      syncResourcePlanningSelection();
      renderResourcePlanningScreen(me);
    });
  });

  applyBtn?.addEventListener("click", async () => {
    PR_RESOURCE_PLANNING_CACHE.filters.q = searchInput?.value?.trim() || "";
    PR_RESOURCE_PLANNING_CACHE.filters.role_on_engagement = roleFilter?.value || "";
    PR_RESOURCE_PLANNING_CACHE.filters.horizon_days = Number(horizonFilter?.value || 60);
    PR_RESOURCE_PLANNING_CACHE.filters.active_only = !!activeOnly?.checked;
    PR_RESOURCE_PLANNING_CACHE.filters.only_available = !!onlyAvailable?.checked;
    PR_RESOURCE_PLANNING_CACHE.filters.only_overloaded = !!onlyOverloaded?.checked;
    PR_RESOURCE_PLANNING_CACHE.filters.offset = 0;

    await loadResourcePlanningData(me);
    renderResourcePlanningScreen(me);
  });

  resetBtn?.addEventListener("click", async () => {
    PR_RESOURCE_PLANNING_CACHE.filters = {
      q: "",
      role_on_engagement: "",
      active_only: true,
      only_available: false,
      only_overloaded: false,
      horizon_days: 60,
      limit: 100,
      offset: 0
    };

    await loadResourcePlanningData(me);
    renderResourcePlanningScreen(me);
  });

  searchInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyBtn?.click();
    }
  });
}

async function renderResourcePlanningScreen(me) {
  const host = document.getElementById("screen-resource-planning");
  if (!host) return;

  if (!PR_RESOURCE_PLANNING_CACHE.summary && !PR_RESOURCE_PLANNING_CACHE.loading) {
    await loadResourcePlanningData(me);
  }

  renderResourcePlanningScreenBody(me);
}

function renderResourcePlanningScreenBody(me) {
  const original = window.renderResourcePlanningScreen;
  if (typeof original === "function" && original !== renderResourcePlanningScreenBody) {
    // no-op guard if needed
  }
  renderResourcePlanningScreenContent(me);
}

function renderResourcePlanningScreenContent(me) {
  const host = document.getElementById("screen-resource-planning");
  if (!host) return;

  const cache = PR_RESOURCE_PLANNING_CACHE;
  const summary = cache.summary || {};

  host.innerHTML = `
    <div class="pr-screen pr-resource-planning-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Resource Planning</h1>
          <p class="pr-screen__subtitle">Forward-looking staffing, scheduling pressure, and workload balancing.</p>
        </div>
      </div>

      <section class="pr-panel">
        <div class="pr-panel__head">
          <div>
            <h3>Planning filters</h3>
            <p>Adjust scope and workload thresholds for resource review.</p>
          </div>
        </div>

        <div class="pr-filter-grid pr-filter-grid--resource-planning">
          <div class="pr-field">
            <label class="pr-field__label" for="rpSearchInput">Search</label>
            <input id="rpSearchInput" class="pr-input" type="text" placeholder="Search by engagement, customer, code, or team member" value="${escapeHtml(cache.filters.q)}" />
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="rpRoleFilter">Role</label>
            <select id="rpRoleFilter" class="pr-select">
              <option value="">All roles</option>
              <option value="manager" ${cache.filters.role_on_engagement === "manager" ? "selected" : ""}>Manager</option>
              <option value="reviewer" ${cache.filters.role_on_engagement === "reviewer" ? "selected" : ""}>Reviewer</option>
              <option value="partner" ${cache.filters.role_on_engagement === "partner" ? "selected" : ""}>Partner</option>
              <option value="qc" ${cache.filters.role_on_engagement === "qc" ? "selected" : ""}>QC</option>
              <option value="preparer" ${cache.filters.role_on_engagement === "preparer" ? "selected" : ""}>Preparer</option>
            </select>
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="rpHorizonFilter">Horizon</label>
            <select id="rpHorizonFilter" class="pr-select">
              <option value="30" ${String(cache.filters.horizon_days) === "30" ? "selected" : ""}>30 days</option>
              <option value="60" ${String(cache.filters.horizon_days) === "60" ? "selected" : ""}>60 days</option>
              <option value="90" ${String(cache.filters.horizon_days) === "90" ? "selected" : ""}>90 days</option>
              <option value="120" ${String(cache.filters.horizon_days) === "120" ? "selected" : ""}>120 days</option>
            </select>
          </div>

          <label class="pr-field pr-field--check">
            <input id="rpActiveOnly" type="checkbox" ${cache.filters.active_only ? "checked" : ""} />
            <span class="pr-field__label">Active only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input id="rpOnlyAvailable" type="checkbox" ${cache.filters.only_available ? "checked" : ""} />
            <span class="pr-field__label">Available only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input id="rpOnlyOverloaded" type="checkbox" ${cache.filters.only_overloaded ? "checked" : ""} />
            <span class="pr-field__label">Overloaded only</span>
          </label>

          <div class="pr-filter-actions">
            <button id="rpApplyFiltersBtn" class="btn btn-primary" type="button">Apply</button>
            <button id="rpResetFiltersBtn" class="btn btn-ghost" type="button">Reset</button>
          </div>
        </div>
      </section>

      <section class="pr-summary-grid">
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Total engagements</div>
          <div class="pr-summary-card__value">${formatNumberSafe(summary.total_engagements)}</div>
          <div class="pr-summary-card__hint">Planning scope</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Upcoming peaks</div>
          <div class="pr-summary-card__value">${formatNumberSafe(summary.upcoming_peaks)}</div>
          <div class="pr-summary-card__hint">Deadline pressure</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Coverage gaps</div>
          <div class="pr-summary-card__value pr-text-warning">${formatNumberSafe(summary.coverage_gaps)}</div>
          <div class="pr-summary-card__hint">Missing key roles</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Overloaded engagements</div>
          <div class="pr-summary-card__value pr-text-danger">${formatNumberSafe(summary.overloaded_engagements)}</div>
          <div class="pr-summary-card__hint">Above target allocation</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Overloaded users</div>
          <div class="pr-summary-card__value pr-text-danger">${formatNumberSafe(summary.overloaded_users)}</div>
          <div class="pr-summary-card__hint">High staff pressure</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Available users</div>
          <div class="pr-summary-card__value pr-text-good">${formatNumberSafe(summary.available_users)}</div>
          <div class="pr-summary-card__hint">Can absorb workload</div>
        </div>
      </section>

      <section class="pr-resource-planning-layout">
        <div class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Planning workspace</h3>
              <p>Select the working view below.</p>
            </div>
          </div>

          <div class="pr-resource-tabs">
            <button class="pr-resource-tab ${cache.selectedTab === "peaks" ? "is-active" : ""}" data-rp-tab="peaks" type="button">Upcoming peaks</button>
            <button class="pr-resource-tab ${cache.selectedTab === "coverage" ? "is-active" : ""}" data-rp-tab="coverage" type="button">Coverage gaps</button>
            <button class="pr-resource-tab ${cache.selectedTab === "reallocation" ? "is-active" : ""}" data-rp-tab="reallocation" type="button">Reallocation</button>
            <button class="pr-resource-tab ${cache.selectedTab === "schedule" ? "is-active" : ""}" data-rp-tab="schedule" type="button">Schedule view</button>
          </div>

          ${cache.loading ? `<div class="pr-loading">Loading resource planning data…</div>` : renderResourcePlanningTable(cache)}
        </div>

        <div class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Selected detail</h3>
              <p>Context and guidance for the current row.</p>
            </div>
          </div>

          ${cache.loading ? `<div class="pr-loading">Loading detail…</div>` : renderResourcePlanningDetail(cache)}
        </div>
      </section>
    </div>
  `;

  bindResourcePlanningEvents(me);
}

function getFinalDeliverablesReviewCompanyId(me) {
  return (
    me?.company_id ||
    window.__PR_ME__?.company_id ||
    window.currentUser?.company_id ||
    JSON.parse(localStorage.getItem("fs_user") || "null")?.company_id ||
    ""
  );
}

function formatSafeDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function formatSafeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function formatSafePercent(value) {
  const n = Number(value || 0);
  return `${Number.isFinite(n) ? n.toFixed(0) : "0"}%`;
}

function fdrBadgeClass(value) {
  const v = String(value || "").toLowerCase();
  if (v === "high") return "pr-badge is-danger";
  if (v === "medium") return "pr-badge is-warning";
  if (v === "low") return "pr-badge is-good";
  if (v === "completed" || v === "approved" || v === "signed_off") return "pr-badge is-good";
  if (v === "in_review") return "pr-badge is-warning";
  return "pr-badge";
}

async function loadFinalDeliverablesReviewData(me) {
  const companyId = getFinalDeliverablesReviewCompanyId(me);
  if (!companyId) throw new Error("Company context missing.");

  const filters = PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters;
  PR_FINAL_DELIVERABLES_REVIEW_CACHE.loading = true;
  PR_FINAL_DELIVERABLES_REVIEW_CACHE.error = "";
  renderFinalDeliverablesReviewScreenContent(me);

  try {
    const [summaryRes, listRes] = await Promise.all([
      apiFetch(ENDPOINTS.finalDeliverablesReview.summary(companyId, filters)),
      apiFetch(ENDPOINTS.finalDeliverablesReview.list(companyId, filters))
    ]);

    PR_FINAL_DELIVERABLES_REVIEW_CACHE.summary = summaryRes?.data || summaryRes || {};
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.rows = listRes?.data || listRes || [];
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.selectedRow =
      PR_FINAL_DELIVERABLES_REVIEW_CACHE.rows.find(
        (r) => r.engagement_id === PR_FINAL_DELIVERABLES_REVIEW_CACHE.selectedRow?.engagement_id
      ) || PR_FINAL_DELIVERABLES_REVIEW_CACHE.rows[0] || null;

    PR_FINAL_DELIVERABLES_REVIEW_CACHE.detail = null;

    if (PR_FINAL_DELIVERABLES_REVIEW_CACHE.selectedRow?.engagement_id) {
      await loadFinalDeliverablesReviewDetail(me, PR_FINAL_DELIVERABLES_REVIEW_CACHE.selectedRow.engagement_id, true);
    }
  } catch (err) {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.error =
      err?.message || "Failed to load final deliverables review.";
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.rows = [];
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.detail = null;
  } finally {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.loading = false;
    renderFinalDeliverablesReviewScreenContent(me);
  }
}

async function loadFinalDeliverablesReviewDetail(me, engagementId, silent = false) {
  const companyId = getFinalDeliverablesReviewCompanyId(me);
  if (!companyId || !engagementId) return;

  if (!silent) {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.detailLoading = true;
    renderFinalDeliverablesReviewScreenContent(me);
  }

  try {
    const res = await apiFetch(
      ENDPOINTS.finalDeliverablesReview.detail(companyId, engagementId)
    );
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.detail = res?.data || res || null;
  } catch (err) {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.detail = null;
  } finally {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.detailLoading = false;
  }
}

function renderFinalDeliverablesReviewTable(cache) {
  const rows = cache.rows || [];
  if (!rows.length) {
    return `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">No engagements found</div>
        <div class="pr-empty-state__desc">Try different status, risk, or search filters.</div>
      </div>
    `;
  }

  return `
    <div class="pr-fdr-table-wrap">
      <div class="pr-table-scroll">
        <table class="pr-fdr-table">
          <thead>
            <tr>
              <th>Engagement</th>
              <th>Risk</th>
              <th>Readiness</th>
              <th>Deliverables</th>
              <th>Sign-off</th>
              <th>Due date</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr
                class="pr-fdr-row ${cache.selectedRow?.engagement_id === row.engagement_id ? "is-selected" : ""}"
                data-fdr-engagement-id="${row.engagement_id}"
              >
                <td>
                  <div class="pr-fdr-name">
                    <div class="pr-fdr-name__title">${escapeHtml(row.engagement_name || "Untitled engagement")}</div>
                    <div class="pr-fdr-name__meta">
                      ${escapeHtml(row.engagement_code || "No code")} · ${escapeHtml(row.customer_name || "—")}
                    </div>
                  </div>
                </td>
                <td><span class="${fdrBadgeClass(row.risk_band)}">${escapeHtml(row.risk_band || "low")}</span></td>
                <td>${escapeHtml(formatSafePercent(row.readiness_percent))}</td>
                <td>${escapeHtml(formatSafeNumber(row.completed_deliverables))}/${escapeHtml(formatSafeNumber(row.total_deliverables))}</td>
                <td>${escapeHtml(formatSafeNumber(row.completed_signoff_steps))}/${escapeHtml(formatSafeNumber(row.total_signoff_steps))}</td>
                <td>${escapeHtml(formatSafeDate(row.due_date))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderFinalDeliverablesReviewDetail(cache) {
  const detail = cache.detail;
  const row = detail?.summary || cache.selectedRow;

  if (!row) {
    return `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">Nothing selected</div>
        <div class="pr-empty-state__desc">Choose an engagement to inspect final pack readiness.</div>
      </div>
    `;
  }

  const deliverables = detail?.deliverables || [];
  const signoffSteps = detail?.signoff_steps || [];
  const reportingItems = detail?.reporting_items || [];

  return `
    <div class="pr-fdr-stack">
      <div class="pr-fdr-block">
        <div class="pr-fdr-block__title">Readiness overview</div>
        <div class="pr-fdr-mini-grid">
          <div class="pr-fdr-field">
            <div class="pr-fdr-field__label">Customer</div>
            <div class="pr-fdr-field__value">${escapeHtml(row.customer_name || "—")}</div>
          </div>
          <div class="pr-fdr-field">
            <div class="pr-fdr-field__label">Risk band</div>
            <div class="pr-fdr-field__value">${escapeHtml(row.risk_band || "low")}</div>
          </div>
          <div class="pr-fdr-field">
            <div class="pr-fdr-field__label">Readiness</div>
            <div class="pr-fdr-field__value">${escapeHtml(formatSafePercent(row.readiness_percent))}</div>
          </div>
          <div class="pr-fdr-field">
            <div class="pr-fdr-field__label">Ready for sign-off</div>
            <div class="pr-fdr-field__value">${row.ready_for_signoff ? "Yes" : "No"}</div>
          </div>
          <div class="pr-fdr-field">
            <div class="pr-fdr-field__label">Overdue deliverables</div>
            <div class="pr-fdr-field__value">${escapeHtml(formatSafeNumber(row.overdue_deliverables))}</div>
          </div>
          <div class="pr-fdr-field">
            <div class="pr-fdr-field__label">Pending sign-off steps</div>
            <div class="pr-fdr-field__value">${escapeHtml(formatSafeNumber(row.pending_signoff_steps))}</div>
          </div>
        </div>
      </div>

      <div class="pr-fdr-block">
        <div class="pr-fdr-block__title">Deliverables</div>
        <div class="pr-fdr-list">
          ${
            deliverables.length
              ? deliverables.map((d) => `
                  <div class="pr-fdr-item">
                    <div class="pr-fdr-item__title">
                      ${escapeHtml(d.deliverable_name || "Deliverable")}
                      <span class="${fdrBadgeClass(d.status)}">${escapeHtml(d.status || "—")}</span>
                    </div>
                    <div class="pr-fdr-item__meta">
                      ${escapeHtml(d.deliverable_type || "—")} · due ${escapeHtml(formatSafeDate(d.due_date))} · docs ${escapeHtml(formatSafeNumber(d.document_count))}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No deliverables found.</div>`
          }
        </div>
      </div>

      <div class="pr-fdr-block">
        <div class="pr-fdr-block__title">Sign-off steps</div>
        <div class="pr-fdr-list">
          ${
            signoffSteps.length
              ? signoffSteps.map((s) => `
                  <div class="pr-fdr-item">
                    <div class="pr-fdr-item__title">
                      ${escapeHtml(s.step_name || "Step")}
                      <span class="${fdrBadgeClass(s.status)}">${escapeHtml(s.status || "—")}</span>
                    </div>
                    <div class="pr-fdr-item__meta">
                      due ${escapeHtml(formatSafeDate(s.due_date))} · completed ${escapeHtml(formatSafeDate(s.completed_at))}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No sign-off steps found.</div>`
          }
        </div>
      </div>

      <div class="pr-fdr-block">
        <div class="pr-fdr-block__title">Reporting pack items</div>
        <div class="pr-fdr-list">
          ${
            reportingItems.length
              ? reportingItems.map((r) => `
                  <div class="pr-fdr-item">
                    <div class="pr-fdr-item__title">
                      ${escapeHtml(r.item_name || "Reporting item")}
                      <span class="${fdrBadgeClass(r.status)}">${escapeHtml(r.status || "—")}</span>
                    </div>
                    <div class="pr-fdr-item__meta">
                      ${escapeHtml(r.item_type || "—")} · due ${escapeHtml(formatSafeDate(r.due_date))}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No reporting items found.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function bindFinalDeliverablesReviewEvents(me) {
  const host = document.getElementById("screen-final-deliverables-review");
  if (!host) return;

  host.querySelector("#fdrApplyBtn")?.addEventListener("click", async () => {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters.q =
      host.querySelector("#fdrSearchInput")?.value?.trim() || "";
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters.status =
      host.querySelector("#fdrStatusFilter")?.value || "";
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters.risk_band =
      host.querySelector("#fdrRiskFilter")?.value || "";
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters.ready_only =
      !!host.querySelector("#fdrReadyOnly")?.checked;
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters.blockers_only =
      !!host.querySelector("#fdrBlockersOnly")?.checked;
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters.offset = 0;

    await loadFinalDeliverablesReviewData(me);
  });

  host.querySelector("#fdrResetBtn")?.addEventListener("click", async () => {
    PR_FINAL_DELIVERABLES_REVIEW_CACHE.filters = {
      q: "",
      status: "",
      risk_band: "",
      ready_only: false,
      blockers_only: false,
      active_only: true,
      limit: 100,
      offset: 0
    };
    await loadFinalDeliverablesReviewData(me);
  });

  host.querySelectorAll("[data-fdr-engagement-id]").forEach((rowEl) => {
    rowEl.addEventListener("click", async () => {
      const engagementId = Number(rowEl.getAttribute("data-fdr-engagement-id"));
      PR_FINAL_DELIVERABLES_REVIEW_CACHE.selectedRow =
        PR_FINAL_DELIVERABLES_REVIEW_CACHE.rows.find((r) => r.engagement_id === engagementId) || null;
      PR_FINAL_DELIVERABLES_REVIEW_CACHE.detail = null;
      PR_FINAL_DELIVERABLES_REVIEW_CACHE.detailLoading = true;
      renderFinalDeliverablesReviewScreenContent(me);
      await loadFinalDeliverablesReviewDetail(me, engagementId);
      renderFinalDeliverablesReviewScreenContent(me);
    });
  });
}

async function renderFinalDeliverablesReviewScreen(me) {
  const host = document.getElementById("screen-final-deliverables-review");
  if (!host) return;

  if (!PR_FINAL_DELIVERABLES_REVIEW_CACHE.summary && !PR_FINAL_DELIVERABLES_REVIEW_CACHE.loading) {
    await loadFinalDeliverablesReviewData(me);
    return;
  }

  renderFinalDeliverablesReviewScreenContent(me);
}

function renderFinalDeliverablesReviewScreenContent(me) {
  const host = document.getElementById("screen-final-deliverables-review");
  if (!host) return;

  const cache = PR_FINAL_DELIVERABLES_REVIEW_CACHE;
  const summary = cache.summary || {};

  host.innerHTML = `
    <div class="pr-screen pr-fdr-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Final Deliverables Review</h1>
          <p class="pr-screen__subtitle">Final reporting pack review before sign-off and release.</p>
        </div>
      </div>

      <section class="pr-panel">
        <div class="pr-panel__head">
          <div>
            <h3>Review filters</h3>
            <p>Filter engagements by status, risk, and sign-off readiness.</p>
          </div>
        </div>

        <div class="pr-fdr-filter-grid">
          <div class="pr-field">
            <label class="pr-field__label" for="fdrSearchInput">Search</label>
            <input id="fdrSearchInput" class="pr-input" type="text" value="${escapeHtml(cache.filters.q)}" placeholder="Search engagement, code, customer" />
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="fdrStatusFilter">Status</label>
            <select id="fdrStatusFilter" class="pr-select">
              <option value="">All statuses</option>
              <option value="active" ${cache.filters.status === "active" ? "selected" : ""}>Active</option>
              <option value="completed" ${cache.filters.status === "completed" ? "selected" : ""}>Completed</option>
              <option value="archived" ${cache.filters.status === "archived" ? "selected" : ""}>Archived</option>
            </select>
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="fdrRiskFilter">Risk band</label>
            <select id="fdrRiskFilter" class="pr-select">
              <option value="">All risk bands</option>
              <option value="high" ${cache.filters.risk_band === "high" ? "selected" : ""}>High</option>
              <option value="medium" ${cache.filters.risk_band === "medium" ? "selected" : ""}>Medium</option>
              <option value="low" ${cache.filters.risk_band === "low" ? "selected" : ""}>Low</option>
            </select>
          </div>

          <label class="pr-field pr-field--check">
            <input id="fdrReadyOnly" type="checkbox" ${cache.filters.ready_only ? "checked" : ""} />
            <span class="pr-field__label">Ready only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input id="fdrBlockersOnly" type="checkbox" ${cache.filters.blockers_only ? "checked" : ""} />
            <span class="pr-field__label">Blockers only</span>
          </label>

          <div class="pr-filter-actions">
            <button id="fdrApplyBtn" class="btn btn-primary" type="button">Apply</button>
            <button id="fdrResetBtn" class="btn btn-ghost" type="button">Reset</button>
          </div>
        </div>
      </section>

      <section class="pr-summary-grid">
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Total engagements</div>
          <div class="pr-summary-card__value">${formatSafeNumber(summary.total_engagements)}</div>
          <div class="pr-summary-card__hint">In review scope</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Ready for sign-off</div>
          <div class="pr-summary-card__value pr-text-good">${formatSafeNumber(summary.ready_for_signoff)}</div>
          <div class="pr-summary-card__hint">No sign-off blockers</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">High risk</div>
          <div class="pr-summary-card__value pr-text-danger">${formatSafeNumber(summary.high_risk)}</div>
          <div class="pr-summary-card__hint">Needs partner attention</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Overdue items</div>
          <div class="pr-summary-card__value pr-text-warning">${formatSafeNumber(summary.overdue_items)}</div>
          <div class="pr-summary-card__hint">Late pack components</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Pending sign-offs</div>
          <div class="pr-summary-card__value">${formatSafeNumber(summary.pending_signoffs)}</div>
          <div class="pr-summary-card__hint">Incomplete sign-off chain</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Avg readiness</div>
          <div class="pr-summary-card__value">${formatSafePercent(summary.avg_readiness_percent)}</div>
          <div class="pr-summary-card__hint">Across listed engagements</div>
        </div>
      </section>

      <section class="pr-fdr-layout">
        <div class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Review queue</h3>
              <p>Engagement-level final pack readiness and sign-off exposure.</p>
            </div>
          </div>

          ${
            cache.loading
              ? `<div class="pr-loading">Loading final deliverables review…</div>`
              : cache.error
              ? `<div class="pr-empty-state"><div class="pr-empty-state__title">Could not load review queue</div><div class="pr-empty-state__desc">${escapeHtml(cache.error)}</div></div>`
              : renderFinalDeliverablesReviewTable(cache)
          }
        </div>

        <aside class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Selected detail</h3>
              <p>Deliverables, reporting items, and sign-off steps for the chosen engagement.</p>
            </div>
          </div>

          ${
            cache.detailLoading
              ? `<div class="pr-loading">Loading engagement detail…</div>`
              : renderFinalDeliverablesReviewDetail(cache)
          }
        </aside>
      </section>
    </div>
  `;

  bindFinalDeliverablesReviewEvents(me);
}

function getApprovalCenterCompanyId(me) {
  return (
    me?.company_id ||
    window.__PR_ME__?.company_id ||
    window.currentUser?.company_id ||
    JSON.parse(localStorage.getItem("fs_user") || "null")?.company_id ||
    ""
  );
}

function formatApprovalCenterDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function formatApprovalCenterNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function approvalCenterBadgeClass(value) {
  const v = String(value || "").toLowerCase();
  if (["high", "escalated", "returned"].includes(v)) return "pr-badge is-danger";
  if (["medium", "in_review", "awaiting_approval", "pending"].includes(v)) return "pr-badge is-warning";
  if (["approved", "released", "ready"].includes(v)) return "pr-badge is-good";
  return "pr-badge";
}

function resolveApprovalCenterReviewTarget(row) {
  const payload = row?.payload_json || {};
  return {
    screen:
      payload.redirect_screen ||
      payload.screen ||
      (row.module === "engagements" ? PR_NAV.finalDeliverablesReview : null),
    entityType: row.entity_type || "",
    entityId: row.entity_id || "",
    engagementId: row.engagement_id || payload.engagement_id || null,
    module: row.module || payload.module || "",
    payload
  };
}

async function loadApprovalCenterData(me) {
  const companyId = getApprovalCenterCompanyId(me);
  if (!companyId) throw new Error("Company context missing.");

  const filters = PR_APPROVAL_CENTER_CACHE.filters;
  PR_APPROVAL_CENTER_CACHE.loading = true;
  PR_APPROVAL_CENTER_CACHE.error = "";
  renderApprovalCenterScreenContent(me);

  try {
    const [summaryRes, listRes] = await Promise.all([
      apiFetch(ENDPOINTS.approvalCenter.summary(companyId, filters)),
      apiFetch(ENDPOINTS.approvalCenter.list(companyId, filters))
    ]);

    PR_APPROVAL_CENTER_CACHE.summary = summaryRes?.data || summaryRes || {};
    PR_APPROVAL_CENTER_CACHE.rows = listRes?.data || listRes || [];
    PR_APPROVAL_CENTER_CACHE.selectedRow =
      PR_APPROVAL_CENTER_CACHE.rows.find(
        (r) =>
          r.source_id === PR_APPROVAL_CENTER_CACHE.selectedRow?.source_id &&
          r.queue_type === PR_APPROVAL_CENTER_CACHE.selectedRow?.queue_type
      ) ||
      PR_APPROVAL_CENTER_CACHE.rows[0] ||
      null;

    PR_APPROVAL_CENTER_CACHE.detail = null;

    if (PR_APPROVAL_CENTER_CACHE.selectedRow?.source_id) {
      await loadApprovalCenterDetail(
        me,
        PR_APPROVAL_CENTER_CACHE.selectedRow.queue_type,
        PR_APPROVAL_CENTER_CACHE.selectedRow.source_id,
        true
      );
    }
  } catch (err) {
    PR_APPROVAL_CENTER_CACHE.error = err?.message || "Failed to load approval center.";
    PR_APPROVAL_CENTER_CACHE.rows = [];
    PR_APPROVAL_CENTER_CACHE.detail = null;
  } finally {
    PR_APPROVAL_CENTER_CACHE.loading = false;
    renderApprovalCenterScreenContent(me);
  }
}

async function loadApprovalCenterDetail(me, queueType, sourceId, silent = false) {
  const companyId = getApprovalCenterCompanyId(me);
  if (!companyId || !queueType || !sourceId) return;

  if (!silent) {
    PR_APPROVAL_CENTER_CACHE.detailLoading = true;
    renderApprovalCenterScreenContent(me);
  }

  try {
    const res = await apiFetch(
      ENDPOINTS.approvalCenter.detail(companyId, queueType, sourceId)
    );
    PR_APPROVAL_CENTER_CACHE.detail = res?.data || res || null;
  } catch (_) {
    PR_APPROVAL_CENTER_CACHE.detail = null;
  } finally {
    PR_APPROVAL_CENTER_CACHE.detailLoading = false;
  }
}

async function applyApprovalCenterAction(me, action) {
  const selected = PR_APPROVAL_CENTER_CACHE.selectedRow;
  if (!selected) return;

  const companyId = getApprovalCenterCompanyId(me);
  if (!companyId) return;

  let comment = "";
  let due_date = "";

  if (action === "return" || action === "escalate") {
    comment = window.prompt("Add a comment for this action:", "") || "";
  }

  if (action === "return") {
    due_date = window.prompt("Optional rework due date (YYYY-MM-DD):", "") || "";
  }

  await apiFetch(
    ENDPOINTS.approvalCenter.action(companyId, selected.queue_type, selected.source_id),
    {
      method: "POST",
      body: JSON.stringify({
        action,
        comment,
        due_date: due_date || null
      })
    }
  );

  await loadApprovalCenterData(me);
}

function renderApprovalCenterTable(cache) {
  const rows = cache.rows || [];
  if (!rows.length) {
    return `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">No approval items found</div>
        <div class="pr-empty-state__desc">Try different queue, status, or blocker filters.</div>
      </div>
    `;
  }

  return `
    <div class="pr-approval-center-table-wrap">
      <div class="pr-table-scroll">
        <table class="pr-approval-center-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Queue</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Ready</th>
              <th>Due date</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr
                class="pr-approval-center-row ${
                  cache.selectedRow?.source_id === row.source_id &&
                  cache.selectedRow?.queue_type === row.queue_type
                    ? "is-selected"
                    : ""
                }"
                data-approval-key="${escapeHtml(`${row.queue_type}:${row.source_id}`)}"
              >
                <td>
                  <div class="pr-approval-center-name">
                    <div class="pr-approval-center-name__title">${escapeHtml(row.title || row.engagement_name || "Approval item")}</div>
                    <div class="pr-approval-center-name__meta">
                      ${escapeHtml(row.engagement_code || "No code")} · ${escapeHtml(row.customer_name || "—")}
                    </div>
                  </div>
                </td>
                <td><span class="${approvalCenterBadgeClass(row.queue_type)}">${escapeHtml(row.queue_type || "review")}</span></td>
                <td><span class="${approvalCenterBadgeClass(row.status)}">${escapeHtml(row.status || "pending")}</span></td>
                <td><span class="${approvalCenterBadgeClass(row.risk_band)}">${escapeHtml(row.risk_band || "low")}</span></td>
                <td>${row.ready_for_release ? "Yes" : "No"}</td>
                <td>${escapeHtml(formatApprovalCenterDate(row.due_date || row.engagement_due_date))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderApprovalCenterDetail(cache) {
  const detail = cache.detail;
  const row = detail?.summary || cache.selectedRow;

  if (!row) {
    return `
      <div class="pr-empty-state">
        <div class="pr-empty-state__title">Nothing selected</div>
        <div class="pr-empty-state__desc">Choose an approval item to inspect release readiness.</div>
      </div>
    `;
  }

  const deliverables = detail?.deliverables || [];
  const signoffSteps = detail?.signoff_steps || [];
  const escalations = detail?.escalations || [];
  const decisions = detail?.decisions || [];

  return `
    <div class="pr-approval-center-stack">
      <div class="pr-approval-center-block">
        <div class="pr-approval-center-block__title">Approval overview</div>
        <div class="pr-approval-center-mini-grid">
          <div class="pr-approval-center-field">
            <div class="pr-approval-center-field__label">Customer</div>
            <div class="pr-approval-center-field__value">${escapeHtml(row.customer_name || "—")}</div>
          </div>
          <div class="pr-approval-center-field">
            <div class="pr-approval-center-field__label">Queue type</div>
            <div class="pr-approval-center-field__value">${escapeHtml(row.queue_type || "review")}</div>
          </div>
          <div class="pr-approval-center-field">
            <div class="pr-approval-center-field__label">Status</div>
            <div class="pr-approval-center-field__value">${escapeHtml(row.status || "pending")}</div>
          </div>
          <div class="pr-approval-center-field">
            <div class="pr-approval-center-field__label">Risk band</div>
            <div class="pr-approval-center-field__value">${escapeHtml(row.risk_band || "low")}</div>
          </div>
          <div class="pr-approval-center-field">
            <div class="pr-approval-center-field__label">Pending deliverables</div>
            <div class="pr-approval-center-field__value">${escapeHtml(formatApprovalCenterNumber(row.pending_deliverables))}</div>
          </div>
          <div class="pr-approval-center-field">
            <div class="pr-approval-center-field__label">Pending sign-off steps</div>
            <div class="pr-approval-center-field__value">${escapeHtml(formatApprovalCenterNumber(row.pending_signoff_steps))}</div>
          </div>
        </div>
      </div>

      <div class="pr-approval-center-block">
        <div class="pr-approval-center-block__title">Actions</div>
        <div class="pr-approval-center-actionbar">
          <button class="btn btn-primary" type="button" data-approval-review="true">Review</button>
          <button class="btn btn-ghost" type="button" data-approval-action="approve">Approve</button>
          <button class="btn btn-ghost" type="button" data-approval-action="return">Return for rework</button>
          <button class="btn btn-ghost" type="button" data-approval-action="escalate">Escalate</button>
          <button class="btn btn-ghost" type="button" data-approval-action="release">Release</button>
        </div>
      </div>

      <div class="pr-approval-center-block">
        <div class="pr-approval-center-block__title">Deliverables</div>
        <div class="pr-approval-center-list">
          ${
            deliverables.length
              ? deliverables.map((d) => `
                  <div class="pr-approval-center-item">
                    <div class="pr-approval-center-item__title">
                      ${escapeHtml(d.deliverable_name || "Deliverable")}
                      <span class="${approvalCenterBadgeClass(d.status)}">${escapeHtml(d.status || "—")}</span>
                    </div>
                    <div class="pr-approval-center-item__meta">
                      ${escapeHtml(d.deliverable_type || "—")} · due ${escapeHtml(formatApprovalCenterDate(d.due_date))}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No deliverables found.</div>`
          }
        </div>
      </div>

      <div class="pr-approval-center-block">
        <div class="pr-approval-center-block__title">Sign-off steps</div>
        <div class="pr-approval-center-list">
          ${
            signoffSteps.length
              ? signoffSteps.map((s) => `
                  <div class="pr-approval-center-item">
                    <div class="pr-approval-center-item__title">
                      ${escapeHtml(s.step_name || "Step")}
                      <span class="${approvalCenterBadgeClass(s.status)}">${escapeHtml(s.status || "—")}</span>
                    </div>
                    <div class="pr-approval-center-item__meta">
                      due ${escapeHtml(formatApprovalCenterDate(s.due_date))} · completed ${escapeHtml(formatApprovalCenterDate(s.completed_at))}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No sign-off steps found.</div>`
          }
        </div>
      </div>

      <div class="pr-approval-center-block">
        <div class="pr-approval-center-block__title">Escalations</div>
        <div class="pr-approval-center-list">
          ${
            escalations.length
              ? escalations.map((e) => `
                  <div class="pr-approval-center-item">
                    <div class="pr-approval-center-item__title">
                      ${escapeHtml(e.title || "Escalation")}
                      <span class="${approvalCenterBadgeClass(e.status)}">${escapeHtml(e.status || "—")}</span>
                    </div>
                    <div class="pr-approval-center-item__meta">
                      priority ${escapeHtml(e.priority || "—")} · due ${escapeHtml(formatApprovalCenterDate(e.due_date))}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No escalations found.</div>`
          }
        </div>
      </div>

      <div class="pr-approval-center-block">
        <div class="pr-approval-center-block__title">Decision history</div>
        <div class="pr-approval-center-list">
          ${
            decisions.length
              ? decisions.map((d) => `
                  <div class="pr-approval-center-item">
                    <div class="pr-approval-center-item__title">
                      ${escapeHtml(d.decision || "decision")}
                      <span class="${approvalCenterBadgeClass(d.decision)}">${escapeHtml(d.decision || "—")}</span>
                    </div>
                    <div class="pr-approval-center-item__meta">
                      actor ${escapeHtml(String(d.actor_user_id || "—"))} · ${escapeHtml(formatApprovalCenterDate(d.created_at))}
                      ${d.comment ? `· ${escapeHtml(d.comment)}` : ""}
                    </div>
                  </div>
                `).join("")
              : `<div class="pr-empty-state__desc">No decisions recorded yet.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function bindApprovalCenterEvents(me) {
  const host = document.getElementById("screen-approval-center");
  if (!host) return;

  host.querySelector("#approvalCenterApplyBtn")?.addEventListener("click", async () => {
    PR_APPROVAL_CENTER_CACHE.filters.q =
      host.querySelector("#approvalCenterSearchInput")?.value?.trim() || "";
PR_APPROVAL_CENTER_CACHE.filters.module =
  host.querySelector("#approvalCenterModuleFilter")?.value || "";
    PR_APPROVAL_CENTER_CACHE.filters.status =
      host.querySelector("#approvalCenterStatusFilter")?.value || "";
    PR_APPROVAL_CENTER_CACHE.filters.ready_only =
      !!host.querySelector("#approvalCenterReadyOnly")?.checked;
    PR_APPROVAL_CENTER_CACHE.filters.blockers_only =
      !!host.querySelector("#approvalCenterBlockersOnly")?.checked;
    PR_APPROVAL_CENTER_CACHE.filters.offset = 0;

    await loadApprovalCenterData(me);
  });

  host.querySelector("#approvalCenterResetBtn")?.addEventListener("click", async () => {
    PR_APPROVAL_CENTER_CACHE.filters = {
      q: "",
      module: "",
      status: "",
      ready_only: false,
      blockers_only: false,
      active_only: true,
      limit: 100,
      offset: 0
    };
    await loadApprovalCenterData(me);
  });

  host.querySelectorAll("[data-approval-key]").forEach((rowEl) => {
    rowEl.addEventListener("click", async () => {
      const [queueType, sourceIdRaw] = String(rowEl.getAttribute("data-approval-key") || "").split(":");
      const sourceId = Number(sourceIdRaw || 0);

      PR_APPROVAL_CENTER_CACHE.selectedRow =
        PR_APPROVAL_CENTER_CACHE.rows.find(
          (r) => r.queue_type === queueType && Number(r.source_id) === sourceId
        ) || null;

      PR_APPROVAL_CENTER_CACHE.detail = null;
      PR_APPROVAL_CENTER_CACHE.detailLoading = true;
      renderApprovalCenterScreenContent(me);
      await loadApprovalCenterDetail(me, queueType, sourceId);
      renderApprovalCenterScreenContent(me);
    });
  });

  host.querySelector('[data-approval-review="true"]')?.addEventListener("click", async () => {
    const row = PR_APPROVAL_CENTER_CACHE.selectedRow;
    if (!row) return;

    const target = resolveApprovalCenterReviewTarget(row);
    if (!target.screen) {
      window.alert("No review target is configured for this approval item.");
      return;
    }

    if (target.engagementId) {
      try {
        sessionStorage.setItem(
          "fs_approval_context",
          JSON.stringify({
            approval_request_id: row.source_id,
            queue_type: row.queue_type,
            engagement_id: target.engagementId,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            module: row.module,
            payload_json: row.payload_json || {}
          })
        );
      } catch (_) {}
    }

    await switchPractitionerScreen(target.screen);
  });

  host.querySelectorAll("[data-approval-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-approval-action");
      if (!action) return;
      await applyApprovalCenterAction(me, action);
    });
  });
}

async function renderApprovalCenterScreen(me) {
  const host = document.getElementById("screen-approval-center");
  if (!host) return;

  if (!PR_APPROVAL_CENTER_CACHE.summary && !PR_APPROVAL_CENTER_CACHE.loading) {
    await loadApprovalCenterData(me);
    return;
  }

  renderApprovalCenterScreenContent(me);
}

function renderApprovalCenterScreenContent(me) {
  const host = document.getElementById("screen-approval-center");
  if (!host) return;

  const cache = PR_APPROVAL_CENTER_CACHE;
  const summary = cache.summary || {};

  host.innerHTML = `
    <div class="pr-screen pr-approval-center-screen">
      <div class="pr-screen__hero">
        <div>
          <h1 class="pr-screen__title">Approval Center</h1>
          <p class="pr-screen__subtitle">Manager approvals, review decisions, rework routing, and release controls.</p>
        </div>
      </div>

      <section class="pr-panel">
        <div class="pr-panel__head">
          <div>
            <h3>Approval filters</h3>
            <p>Filter pending approvals by queue type, state, blockers, and release readiness.</p>
          </div>
        </div>

        <div class="pr-approval-center-filter-grid">
          <div class="pr-field">
            <label class="pr-field__label" for="approvalCenterSearchInput">Search</label>
            <input id="approvalCenterSearchInput" class="pr-input" type="text" value="${escapeHtml(cache.filters.q)}" placeholder="Search title, engagement, code, customer" />
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="approvalCenterModuleFilter">Module</label>
            <select id="approvalCenterModuleFilter" class="pr-select">
              <option value="">All modules</option>
              <option value="gl" ${cache.filters.module === "gl" ? "selected" : ""}>GL</option>
              <option value="ap" ${cache.filters.module === "ap" ? "selected" : ""}>AP</option>
              <option value="ar" ${cache.filters.module === "ar" ? "selected" : ""}>AR</option>
              <option value="control_room" ${cache.filters.module === "control_room" ? "selected" : ""}>Control Room</option>
              <option value="engagements" ${cache.filters.module === "engagements" ? "selected" : ""}>Engagements</option>
            </select>
          </div>

          <div class="pr-field">
            <label class="pr-field__label" for="approvalCenterStatusFilter">Status</label>
            <select id="approvalCenterStatusFilter" class="pr-select">
              <option value="">All statuses</option>
              <option value="pending" ${cache.filters.status === "pending" ? "selected" : ""}>Pending</option>
              <option value="in_review" ${cache.filters.status === "in_review" ? "selected" : ""}>In review</option>
              <option value="awaiting_approval" ${cache.filters.status === "awaiting_approval" ? "selected" : ""}>Awaiting approval</option>
              <option value="returned" ${cache.filters.status === "returned" ? "selected" : ""}>Returned</option>
              <option value="approved" ${cache.filters.status === "approved" ? "selected" : ""}>Approved</option>
              <option value="released" ${cache.filters.status === "released" ? "selected" : ""}>Released</option>
            </select>
          </div>

          <label class="pr-field pr-field--check">
            <input id="approvalCenterReadyOnly" type="checkbox" ${cache.filters.ready_only ? "checked" : ""} />
            <span class="pr-field__label">Ready only</span>
          </label>

          <label class="pr-field pr-field--check">
            <input id="approvalCenterBlockersOnly" type="checkbox" ${cache.filters.blockers_only ? "checked" : ""} />
            <span class="pr-field__label">Blockers only</span>
          </label>

          <div class="pr-filter-actions">
            <button id="approvalCenterApplyBtn" class="btn btn-primary" type="button">Apply</button>
            <button id="approvalCenterResetBtn" class="btn btn-ghost" type="button">Reset</button>
          </div>
        </div>
      </section>

      <section class="pr-summary-grid">
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Total items</div>
          <div class="pr-summary-card__value">${formatApprovalCenterNumber(summary.total_items)}</div>
          <div class="pr-summary-card__hint">Approval queue scope</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Pending approvals</div>
          <div class="pr-summary-card__value">${formatApprovalCenterNumber(summary.pending_approvals)}</div>
          <div class="pr-summary-card__hint">Awaiting manager decision</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Ready for release</div>
          <div class="pr-summary-card__value pr-text-good">${formatApprovalCenterNumber(summary.ready_for_release)}</div>
          <div class="pr-summary-card__hint">No approval blockers</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">High risk</div>
          <div class="pr-summary-card__value pr-text-danger">${formatApprovalCenterNumber(summary.high_risk)}</div>
          <div class="pr-summary-card__hint">Needs escalation attention</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Returned for rework</div>
          <div class="pr-summary-card__value pr-text-warning">${formatApprovalCenterNumber(summary.returned_for_rework)}</div>
          <div class="pr-summary-card__hint">Sent back with comments</div>
        </div>
        <div class="pr-summary-card">
          <div class="pr-summary-card__label">Escalated items</div>
          <div class="pr-summary-card__value pr-text-danger">${formatApprovalCenterNumber(summary.escalated_items)}</div>
          <div class="pr-summary-card__hint">Open escalations present</div>
        </div>
      </section>

      <section class="pr-approval-center-layout">
        <div class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Approval queue</h3>
              <p>Cross-engagement items awaiting approval, return, escalation, or release action.</p>
            </div>
          </div>

          ${
            cache.loading
              ? `<div class="pr-loading">Loading approval center…</div>`
              : cache.error
              ? `<div class="pr-empty-state"><div class="pr-empty-state__title">Could not load approval queue</div><div class="pr-empty-state__desc">${escapeHtml(cache.error)}</div></div>`
              : renderApprovalCenterTable(cache)
          }
        </div>

        <aside class="pr-panel">
          <div class="pr-panel__head">
            <div>
              <h3>Selected detail</h3>
              <p>Release readiness, blockers, deliverables, sign-off steps, and escalation context.</p>
            </div>
          </div>

          ${
            cache.detailLoading
              ? `<div class="pr-loading">Loading approval detail…</div>`
              : renderApprovalCenterDetail(cache)
          }
        </aside>
      </section>
    </div>
  `;

  bindApprovalCenterEvents(me);
}

async function renderEngagementAcceptanceScreen(me) {
  const host = document.getElementById("screen-engagement-acceptance");
  if (!host) return;

  host.innerHTML = `
    <div class="screen-shell partner-workspace-screen acceptance-screen">
      <div class="screen-header">
        <h1>Engagement Acceptance</h1>
        <p>Acceptance, continuation, and approval decisions for client engagements.</p>
      </div>

      <section class="panel filter-panel">
        <div class="panel-header">
          <h3>Acceptance filters</h3>
          <p>Filter engagement acceptance records by type, status, risk, and approval readiness.</p>
        </div>

        <div class="form-row">
          <div class="field grow">
            <label for="eaSearchInput">Search</label>
            <input
              id="eaSearchInput"
              type="text"
              placeholder="Search engagement, code, customer"
            />
          </div>

          <div class="field">
            <label for="eaTypeFilter">Type</label>
            <select id="eaTypeFilter">
              <option value="">All types</option>
              <option value="acceptance">Acceptance</option>
              <option value="continuation">Continuation</option>
            </select>
          </div>

          <div class="field">
            <label for="eaStatusFilter">Status</label>
            <select id="eaStatusFilter">
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="returned">Returned</option>
            </select>
          </div>

          <div class="field">
            <label for="eaRiskFilter">Risk band</label>
            <select id="eaRiskFilter">
              <option value="">All risk bands</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div class="field checkbox-field">
            <label for="eaReadyOnly">
              <input id="eaReadyOnly" type="checkbox" />
              <span>Ready only</span>
            </label>
          </div>

          <div class="filter-actions">
            <button id="eaApplyFiltersBtn" class="btn btn-primary" type="button">Apply</button>
            <button id="eaResetFiltersBtn" class="btn btn-secondary" type="button">Reset</button>
          </div>
        </div>
      </section>

      <section class="stats-row" id="eaStatsRow">
        <div class="stat-card">
          <div class="stat-label">TOTAL ITEMS</div>
          <div class="stat-value" id="eaStatTotal">0</div>
          <div class="stat-subtext">Acceptance records in scope</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">READY FOR REVIEW</div>
          <div class="stat-value" id="eaStatReady">0</div>
          <div class="stat-subtext">Submitted and reviewable</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">HIGH RISK</div>
          <div class="stat-value" id="eaStatHighRisk">0</div>
          <div class="stat-subtext">Needs partner attention</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">APPROVED</div>
          <div class="stat-value" id="eaStatApproved">0</div>
          <div class="stat-subtext">Approved records</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">DECLINED</div>
          <div class="stat-value" id="eaStatDeclined">0</div>
          <div class="stat-subtext">Declined records</div>
        </div>

        <div class="stat-card">
          <div class="stat-label">PENDING</div>
          <div class="stat-value" id="eaStatPending">0</div>
          <div class="stat-subtext">Awaiting decision</div>
        </div>
      </section>

      <div class="split-layout">
        <section class="panel queue-panel">
          <div class="panel-header">
            <h3>Acceptance queue</h3>
            <p>Engagement-level acceptance and continuation records awaiting review or action.</p>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Partner</th>
                  <th>Decision</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody id="eaTableBody">
                <tr>
                  <td colspan="7" class="muted">Loading records...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside class="panel detail-panel">
          <div class="panel-header">
            <h3>Selected detail</h3>
            <p>Acceptance checks, notes, and approval actions for the chosen engagement.</p>
          </div>

          <div id="eaDetailHost" class="detail-body">
            <div class="empty-state">Select a record to view details.</div>
          </div>
        </aside>
      </div>
    </div>
  `;

  await loadEngagementAcceptanceRows(me);
  bindEngagementAcceptanceScreen(me);
}

async function loadEngagementAcceptanceRows(me) {
  const companyId = me?.company_id || window.currentUser?.company_id;
  if (!companyId) return;

  const filters = PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters || {};
  const tbody = document.getElementById("eaTableBody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Loading...</td></tr>`;
  }

  try {
    const res = await apiFetch(
      ENDPOINTS.engagementAcceptance.list(companyId, filters)
    );

    const rows =
      Array.isArray(res) ? res :
      Array.isArray(res?.rows) ? res.rows :
      Array.isArray(res?.items) ? res.items :
      [];

    PR_ENGAGEMENT_ACCEPTANCE_CACHE.rows = rows;
    renderEngagementAcceptanceRows();

    const selectedId = PR_ENGAGEMENT_ACCEPTANCE_CACHE.selectedRow?.id;
    if (selectedId && rows.some((r) => Number(r.id) === Number(selectedId))) {
      markSelectedAcceptanceRow(selectedId);
    }
  } catch (err) {
    console.error("loadEngagementAcceptanceRows failed", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-danger">${escapeHtml(err.message || "Failed to load items")}</td></tr>`;
    }
    renderEngagementAcceptanceStats([]);
  }
}

function renderEngagementAcceptanceStats(rows) {
  const total = rows.length;
  const ready = rows.filter(r => ["submitted", "under_review"].includes((r.status || "").toLowerCase())).length;
  const highRisk = rows.filter(r => ["high", "critical"].includes((r.risk_level || "").toLowerCase())).length;
  const approved = rows.filter(r => (r.status || "").toLowerCase() === "approved").length;
  const declined = rows.filter(r => (r.status || "").toLowerCase() === "declined").length;
  const pending = rows.filter(r => ["draft", "submitted", "under_review", "returned"].includes((r.status || "").toLowerCase())).length;

  setText("eaStatTotal", total);
  setText("eaStatReady", ready);
  setText("eaStatHighRisk", highRisk);
  setText("eaStatApproved", approved);
  setText("eaStatDeclined", declined);
  setText("eaStatPending", pending);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "");
}

function renderEngagementAcceptanceRows() {
  const tbody = document.getElementById("eaTableBody");
  if (!tbody) return;

  const rows = PR_ENGAGEMENT_ACCEPTANCE_CACHE.rows || [];
  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="muted">No engagement acceptance records found.</td>
      </tr>
    `;
    renderEngagementAcceptanceStats([]);
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr class="clickable-row" data-ea-id="${row.id}">
      <td>
        <div class="row-title">${escapeHtml(row.engagement_name || "")}</div>
        <div class="row-subtitle">
          ${escapeHtml(row.engagement_code || "")}
          ${row.customer_name ? ` - ${escapeHtml(row.customer_name)}` : ""}
        </div>
      </td>
      <td>${escapeHtml(titleize(row.acceptance_type || ""))}</td>
      <td>${escapeHtml(titleize((row.status || "").replaceAll("_", " ")))}</td>
      <td>${escapeHtml(titleize(row.risk_level || ""))}</td>
      <td>${escapeHtml(row.assigned_partner_user_name || "-")}</td>
      <td>${escapeHtml(titleize((row.decision || "-").replaceAll("_", " ")))}</td>
      <td>${formatShortDate(row.decision_date || row.updated_at)}</td>
    </tr>
  `).join("");

  renderEngagementAcceptanceStats(rows);
}

async function openEngagementAcceptanceDetail(me, acceptanceId) {
  const companyId = me?.company_id || window.currentUser?.company_id;
  if (!companyId || !acceptanceId) return;

  const detailHost = document.getElementById("eaDetailHost");
  if (detailHost) {
    detailHost.innerHTML = `<div class="empty-state">Loading detail...</div>`;
  }

  try {
    const res = await apiFetch(
      ENDPOINTS.engagementAcceptance.get(companyId, acceptanceId)
    );

    const row = res?.row || res || null;
    if (!row) {
      throw new Error("Acceptance detail not found.");
    }

    PR_ENGAGEMENT_ACCEPTANCE_CACHE.selectedRow = row;
    PR_ENGAGEMENT_ACCEPTANCE_CACHE.detail = row;

    markSelectedAcceptanceRow(acceptanceId);
    renderEngagementAcceptanceDetail(row);
  } catch (err) {
    console.error("openEngagementAcceptanceDetail failed", err);
    if (detailHost) {
      detailHost.innerHTML = `<div class="text-danger">${escapeHtml(err.message || "Failed to load detail")}</div>`;
    }
  }
}

function renderEngagementAcceptanceDetail(row) {
  const host = document.getElementById("eaDetailHost");
  if (!host) return;

  const status = String(row.status || "").toLowerCase();
  const canSubmit = status === "draft" || status === "returned";
  const canDecide = status === "submitted" || status === "under_review";

  host.innerHTML = `
    <div class="detail-grid">
      <div class="detail-card">
        <div class="detail-label">Customer</div>
        <div class="detail-value">${escapeHtml(row.customer_name || "-")}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">Type</div>
        <div class="detail-value">${escapeHtml(titleize(row.acceptance_type || "-"))}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">Risk band</div>
        <div class="detail-value">${escapeHtml(titleize(row.risk_level || "-"))}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">Status</div>
        <div class="detail-value">${escapeHtml(titleize((row.status || "-").replaceAll("_", " ")))}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">Assigned partner</div>
        <div class="detail-value">${escapeHtml(row.assigned_partner_user_name || "-")}</div>
      </div>

      <div class="detail-card">
        <div class="detail-label">Decision date</div>
        <div class="detail-value">${formatShortDate(row.decision_date) || "-"}</div>
      </div>
    </div>

    <div class="detail-section">
      <h4>Checks</h4>
      <ul class="simple-list">
        <li>Independence cleared: <strong>${row.independence_cleared ? "Yes" : "No"}</strong></li>
        <li>Conflicts checked: <strong>${row.conflicts_checked ? "Yes" : "No"}</strong></li>
        <li>Competence confirmed: <strong>${row.competence_confirmed ? "Yes" : "No"}</strong></li>
        <li>Capacity confirmed: <strong>${row.capacity_confirmed ? "Yes" : "No"}</strong></li>
      </ul>
    </div>

    <div class="detail-section">
      <h4>Client risk notes</h4>
      <p>${escapeHtml(row.client_risk_notes || "No notes recorded.")}</p>
    </div>

    <div class="detail-section">
      <h4>Service complexity notes</h4>
      <p>${escapeHtml(row.service_complexity_notes || "No notes recorded.")}</p>
    </div>

    <div class="detail-section">
      <h4>Preconditions notes</h4>
      <p>${escapeHtml(row.preconditions_notes || "No notes recorded.")}</p>
    </div>

    <div class="detail-section">
      <h4>Decision notes</h4>
      <p>${escapeHtml(row.decision_notes || "No notes recorded.")}</p>
    </div>

    <div class="detail-actions">
      ${canSubmit ? `<button class="btn btn-secondary" data-ea-action="submit" data-ea-id="${row.id}">Submit</button>` : ""}
      ${canDecide ? `<button class="btn btn-success" data-ea-action="approve" data-ea-id="${row.id}">Approve</button>` : ""}
      ${canDecide ? `<button class="btn btn-warning" data-ea-action="return" data-ea-id="${row.id}">Return</button>` : ""}
      ${canDecide ? `<button class="btn btn-danger" data-ea-action="decline" data-ea-id="${row.id}">Decline</button>` : ""}
    </div>
  `;
}

function markSelectedAcceptanceRow(id) {
  document.querySelectorAll("#eaTableBody tr[data-ea-id]").forEach((tr) => {
    tr.classList.toggle(
      "is-selected",
      Number(tr.getAttribute("data-ea-id")) === Number(id)
    );
  });
}

function bindEngagementAcceptanceScreen(me) {
  const applyBtn = document.getElementById("eaApplyFiltersBtn");
  const resetBtn = document.getElementById("eaResetFiltersBtn");
  const tbody = document.getElementById("eaTableBody");

  if (applyBtn) {
    applyBtn.onclick = async () => {
      PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters.q =
        document.getElementById("eaSearchInput")?.value?.trim() || "";
      PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters.acceptance_type =
        document.getElementById("eaTypeFilter")?.value || "";
      PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters.status =
        document.getElementById("eaStatusFilter")?.value || "";
      PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters.risk_level =
        document.getElementById("eaRiskFilter")?.value || "";
      PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters.ready_only =
        !!document.getElementById("eaReadyOnly")?.checked;

      await loadEngagementAcceptanceRows(me);
    };
  }

  if (resetBtn) {
    resetBtn.onclick = async () => {
      const search = document.getElementById("eaSearchInput");
      const type = document.getElementById("eaTypeFilter");
      const status = document.getElementById("eaStatusFilter");
      const risk = document.getElementById("eaRiskFilter");
      const ready = document.getElementById("eaReadyOnly");

      if (search) search.value = "";
      if (type) type.value = "";
      if (status) status.value = "";
      if (risk) risk.value = "";
      if (ready) ready.checked = false;

      PR_ENGAGEMENT_ACCEPTANCE_CACHE.filters = {
        q: "",
        acceptance_type: "",
        status: "",
        risk_level: "",
        ready_only: false,
        active_only: true,
        limit: 100,
        offset: 0
      };

      await loadEngagementAcceptanceRows(me);
    };
  }

  if (tbody) {
    tbody.onclick = async (event) => {
      const row = event.target.closest("[data-ea-id]");
      if (!row) return;

      const id = Number(row.getAttribute("data-ea-id"));
      if (!id) return;

      await openEngagementAcceptanceDetail(me, id);
    };
  }

  const detailHost = document.getElementById("eaDetailHost");
  if (detailHost) {
    detailHost.onclick = async (event) => {
      const btn = event.target.closest("[data-ea-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-ea-action");
      const id = Number(btn.getAttribute("data-ea-id"));
      if (!id || !action) return;

      await applyEngagementAcceptanceDecision(me, id, action);
    };
  }
}

async function applyEngagementAcceptanceDecision(me, acceptanceId, action) {
  const companyId = me?.company_id || window.currentUser?.company_id;
  if (!companyId || !acceptanceId) return;

  const decisionNotes = window.prompt(`Add ${action} note (optional):`, "") || "";

  try {
    await apiFetch(
      ENDPOINTS.engagementAcceptance.decision(companyId, acceptanceId),
      {
        method: "POST",
        body: JSON.stringify({
          action,
          decision_notes: decisionNotes
        })
      }
    );

    await loadEngagementAcceptanceRows(me);
    await openEngagementAcceptanceDetail(me, acceptanceId);
  } catch (err) {
    console.error("applyEngagementAcceptanceDecision failed", err);
    window.alert(err.message || `Failed to ${action} item`);
  }
}


function renderRiskIndependenceScreen(me) {
  renderPartnerStubScreen(PR_NAV.riskIndependence, {
    title: "Risk & Independence",
    subtitle: "Ethics, independence, and engagement risk oversight controls.",
    items: [
      { label: "Independence checks", desc: "Track independence confirmations and unresolved conflicts." },
      { label: "Engagement risk rating", desc: "Store and review high-risk engagements requiring special oversight." },
      { label: "QC / ethics flags", desc: "Surface matters needing partner or quality control intervention." },
      { label: "Approval conditions", desc: "Record conditions that must be satisfied before work proceeds." }
    ]
  });
}

function renderOverrideLogScreen(me) {
  renderPartnerStubScreen(PR_NAV.overrideLog, {
    title: "Override Log",
    subtitle: "Partner overrides, exceptions, disputes, and final documented resolutions.",
    items: [
      { label: "Override register", desc: "Track final partner decisions that differ from normal workflow outcomes." },
      { label: "Exception documentation", desc: "Record why exceptions were accepted and by whom." },
      { label: "Dispute resolution", desc: "Log resolved disagreements between preparers, reviewers, and approvers." },
      { label: "Audit trail", desc: "Keep a durable record of sensitive approval decisions and their rationale." }
    ]
  });
}

function renderManagerStubScreen(screen, config = {}) {
  const root = document.getElementById(`screen-${screen}`);
  if (!root) return;

  const title = config.title || "Management Screen";
  const subtitle = config.subtitle || "Management workspace.";
  const bullets = Array.isArray(config.items) ? config.items : [];

  root.innerHTML = `
    <div class="card p-6">
      <div class="panel-title">${title}</div>
      <div class="panel-subtitle mt-1">${subtitle}</div>

      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div class="text-sm font-semibold text-slate-800">Intended purpose</div>
        <div class="mt-3 grid gap-3">
          ${bullets.map((item) => `
            <div class="rounded-xl border border-slate-200 bg-white p-3">
              <div class="text-sm font-semibold text-slate-800">${item.label || "Feature"}</div>
              <div class="mt-1 text-sm text-slate-600">${item.desc || ""}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderPartnerStubScreen(screen, config = {}) {
  const root = document.getElementById(`screen-${screen}`);
  if (!root) return;

  const title = config.title || "Partner Screen";
  const subtitle = config.subtitle || "Partner oversight workspace.";
  const bullets = Array.isArray(config.items) ? config.items : [];

  root.innerHTML = `
    <div class="card p-6">
      <div class="panel-title">${title}</div>
      <div class="panel-subtitle mt-1">${subtitle}</div>

      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div class="text-sm font-semibold text-slate-800">Planned controls</div>
        <div class="mt-3 grid gap-3">
          ${bullets.map((item) => `
            <div class="rounded-xl border border-slate-200 bg-white p-3">
              <div class="text-sm font-semibold text-slate-800">${item.label || "Control"}</div>
              <div class="mt-1 text-sm text-slate-600">${item.desc || ""}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

async function loadEngagementWorkflowSnapshot() {
  const companyId =
    window.__PR_CONTEXT__?.companyId ||
    window.__PR_ACTIVE_COMPANY_ID__ ||
    window.__COMPANY_ID__ ||
    getCurrentCompanyId?.() ||
    null;

  const customerId =
    window.__PR_CONTEXT__?.customerId ||
    window.__PR_ACTIVE_CUSTOMER_ID__ ||
    null;

  const engagementId =
    window.__PR_CONTEXT__?.engagementId ||
    window.__PR_ACTIVE_ENGAGEMENT_ID__ ||
    null;

  if (!companyId || !engagementId) {
    return {
      companyId: null,
      customerId: null,
      engagementId: null,
      deliverables: [],
      workingPapers: [],
      reviewQueue: [],
      signoffSteps: [],
      readiness: null
    };
  }

  const [deliverablesJson, workingPapersJson, reviewQueueJson, signoffJson] = await Promise.all([
    apiFetch(
      ENDPOINTS.engagementOps.deliverablesList(companyId, engagementId, {
        limit: 500,
        offset: 0,
        active_only: true
      })
    ),
    apiFetch(
      ENDPOINTS.workingPapers.list(companyId, {
        customer_id: customerId || "",
        engagement_id: engagementId,
        limit: 500,
        offset: 0
      })
    ),
    apiFetch(
      ENDPOINTS.reviewQueue.list(companyId, engagementId, {
        limit: 500,
        offset: 0
      })
    ),
    apiFetch(
      ENDPOINTS.engagementOps.signoffStepsList(companyId, engagementId, {
        limit: 500,
        offset: 0,
        active_only: true
      })
    )
  ]);

  const deliverables = deliverablesJson?.rows || [];
  const workingPapers = workingPapersJson?.rows || [];
  const reviewQueue = reviewQueueJson?.rows || [];
  const signoffSteps = signoffJson?.rows || [];

  return {
    companyId,
    customerId,
    engagementId,
    deliverables,
    workingPapers,
    reviewQueue,
    signoffSteps,
    readiness: evaluateEngagementWorkflowReadiness({
      deliverables,
      workingPapers,
      reviewQueue,
      signoffSteps
    })
  };
}

function evaluateEngagementWorkflowReadiness({
  deliverables = [],
  workingPapers = [],
  reviewQueue = [],
  signoffSteps = []
} = {}) {
  const norm = (v) => String(v || "").trim().toLowerCase();

  const deliverablesOutstanding = deliverables.filter((d) =>
    !["received", "completed", "waived"].includes(norm(d.status))
  );

  const deliverablesOverdue = deliverables.filter((d) => {
    if (!d?.due_date) return false;
    const due = new Date(d.due_date);
    if (Number.isNaN(due.getTime())) return false;
    return due < new Date() && !["received", "completed", "waived"].includes(norm(d.status));
  });

  const workingPapersBlocked = workingPapers.filter((w) =>
    norm(w.status) === "blocked"
  );

  const workingPapersPendingReview = workingPapers.filter((w) =>
    ["prepared", "in_review", "returned"].includes(norm(w.status))
  );

  const unresolvedReviewItems = reviewQueue.filter((q) =>
    !["approved", "completed", "waived", "cleared", "posted", "reviewed"].includes(norm(q.status))
  );

  const blockedReviewItems = reviewQueue.filter((q) =>
    norm(q.status) === "blocked" || !!q.is_blocked
  );

  const pendingSignoffSteps = signoffSteps.filter((s) =>
    !["completed", "waived"].includes(norm(s.status))
  );

  const blockers = [];

  if (deliverablesOutstanding.length) {
    blockers.push({
      code: "OUTSTANDING_DELIVERABLES",
      label: "Outstanding deliverables",
      count: deliverablesOutstanding.length
    });
  }

  if (deliverablesOverdue.length) {
    blockers.push({
      code: "OVERDUE_DELIVERABLES",
      label: "Overdue deliverables",
      count: deliverablesOverdue.length
    });
  }

  if (workingPapersBlocked.length) {
    blockers.push({
      code: "BLOCKED_WORKING_PAPERS",
      label: "Blocked working papers",
      count: workingPapersBlocked.length
    });
  }

  if (workingPapersPendingReview.length) {
    blockers.push({
      code: "PENDING_WP_REVIEW",
      label: "Working papers pending review",
      count: workingPapersPendingReview.length
    });
  }

  if (blockedReviewItems.length) {
    blockers.push({
      code: "BLOCKED_REVIEW_ITEMS",
      label: "Blocked review items",
      count: blockedReviewItems.length
    });
  }

  return {
    isReadyForPartnerSignoff: blockers.length === 0,
    blockers,
    counts: {
      deliverablesTotal: deliverables.length,
      outstandingDeliverables: deliverablesOutstanding.length,
      overdueDeliverables: deliverablesOverdue.length,
      workingPapersTotal: workingPapers.length,
      blockedWorkingPapers: workingPapersBlocked.length,
      pendingWorkingPaperReview: workingPapersPendingReview.length,
      reviewQueueTotal: reviewQueue.length,
      unresolvedReviewItems: unresolvedReviewItems.length,
      blockedReviewItems: blockedReviewItems.length,
      signoffStepsTotal: signoffSteps.length,
      pendingSignoffSteps: pendingSignoffSteps.length
    }
  };
}

async function createWorkingPaperFromDeliverable(deliverableRow) {
  const companyId =
    window.__PR_CONTEXT__?.companyId ||
    window.__PR_ACTIVE_COMPANY_ID__ ||
    window.__COMPANY_ID__ ||
    getCurrentCompanyId?.() ||
    null;

  const engagementId =
    window.__PR_CONTEXT__?.engagementId ||
    window.__PR_ACTIVE_ENGAGEMENT_ID__ ||
    null;

  if (!companyId || !engagementId || !deliverableRow?.id) {
    throw new Error("Missing deliverable or engagement context.");
  }

  const payload = {
    engagement_id: Number(engagementId),
    paper_name: `${deliverableRow.deliverable_name || "Deliverable"} Workpaper`,
    paper_section: guessWorkingPaperSectionFromDeliverable(deliverableRow),
    paper_type: "working_paper",
    status: "not_started",
    priority: String(deliverableRow.priority || "normal").toLowerCase(),
    linked_deliverable_id: Number(deliverableRow.id),
    notes: `Created from deliverable: ${deliverableRow.deliverable_name || "N/A"}`
  };

  const json = await apiFetch(ENDPOINTS.workingPapers.create(companyId), {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const row = json?.row || null;
  if (!row?.id) {
    throw new Error("Working paper was not created.");
  }

  return row;
}

function guessWorkingPaperSectionFromDeliverable(deliverableRow) {
  const name = String(deliverableRow?.deliverable_name || "").toLowerCase();
  const type = String(deliverableRow?.deliverable_type || "").toLowerCase();

  if (name.includes("bank") || name.includes("cash")) return "cash";
  if (name.includes("receivable")) return "receivables";
  if (name.includes("payable")) return "payables";
  if (name.includes("tax")) return "tax";
  if (name.includes("ppe") || name.includes("asset")) return "ppe";
  if (name.includes("payroll")) return "payroll";
  if (name.includes("revenue") || name.includes("sales")) return "revenue";
  if (name.includes("expense")) return "expenses";
  if (name.includes("fs") || name.includes("financial statements")) return "fs";
  if (type.includes("working_paper")) return "other";
  return "other";
}

async function sendWorkingPaperToReview(workingPaperId) {
  const companyId = getPractitionerActiveCompanyId();
  if (!companyId || !workingPaperId) {
    throw new Error("Missing working paper context.");
  }

  await apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, workingPaperId), {
    method: "POST",
    body: JSON.stringify({
      status: "in_review"
    })
  });

  return true;
}

async function markWorkingPaperPrepared(workingPaperId) {
  const companyId =
    window.__PR_CONTEXT__?.companyId ||
    window.__PR_ACTIVE_COMPANY_ID__ ||
    window.__COMPANY_ID__ ||
    getCurrentCompanyId?.() ||
    null;

  if (!companyId || !workingPaperId) {
    throw new Error("Missing working paper context.");
  }

  await apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, workingPaperId), {
    method: "POST",
    body: JSON.stringify({
      status: "prepared",
      prepared_at: new Date().toISOString()
    })
  });

  return true;
}

async function sendWorkingPaperToReview(workingPaperId) {
  const companyId =
    window.__PR_CONTEXT__?.companyId ||
    window.__PR_ACTIVE_COMPANY_ID__ ||
    window.__COMPANY_ID__ ||
    getCurrentCompanyId?.() ||
    null;

  if (!companyId || !workingPaperId) {
    throw new Error("Missing working paper context.");
  }

  await apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, workingPaperId), {
    method: "POST",
    body: JSON.stringify({
      status: "in_review"
    })
  });

  return true;
}

async function resolveReviewQueueAction(row, action) {
  const companyId =
    window.__PR_CONTEXT__?.companyId ||
    window.__PR_ACTIVE_COMPANY_ID__ ||
    window.__COMPANY_ID__ ||
    getCurrentCompanyId?.() ||
    null;

  const engagementId =
    window.__PR_CONTEXT__?.engagementId ||
    window.__PR_ACTIVE_ENGAGEMENT_ID__ ||
    null;

  if (!companyId || !engagementId || !row?.queue_type || !row?.source_id) {
    throw new Error("Missing review queue item context.");
  }

  const queueType = String(row.queue_type || "").toLowerCase();
  const sourceId = row.source_id;

  if (queueType === "deliverable") {
    if (action === "approve") {
      return apiFetch(ENDPOINTS.engagementOps.deliverablesSetStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({ status: "completed" })
      });
    }

    if (action === "return") {
      return apiFetch(ENDPOINTS.engagementOps.deliverablesSetStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({ status: "outstanding" })
      });
    }

    if (action === "block") {
      return apiFetch(ENDPOINTS.engagementOps.deliverablesSetStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({ status: "outstanding" })
      });
    }
  }

  if (queueType === "working_paper") {
    if (action === "approve") {
      return apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({
          status: "reviewed",
          reviewed_at: new Date().toISOString()
        })
      });
    }

    if (action === "clear") {
      return apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({
          status: "cleared",
          cleared_at: new Date().toISOString()
        })
      });
    }

    if (action === "return") {
      return apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({ status: "returned" })
      });
    }

    if (action === "block") {
      return apiFetch(ENDPOINTS.workingPapers.setStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({ status: "blocked" })
      });
    }
  }

  if (queueType === "signoff") {
    if (action === "complete") {
      return apiFetch(ENDPOINTS.engagementOps.signoffStepsSetStatus(companyId, sourceId), {
        method: "POST",
        body: JSON.stringify({
          status: "completed",
          completed_at: new Date().toISOString()
        })
      });
    }
  }

  throw new Error(`Unsupported action '${action}' for queue type '${queueType}'.`);
}

function renderEngagementReadinessCard(readiness) {
  if (!readiness) {
    return `
      <div class="card p-5">
        <div class="panel-title">Engagement Readiness</div>
        <div class="panel-subtitle mt-1">Unable to evaluate readiness.</div>
      </div>
    `;
  }

  const blockers = readiness.blockers || [];
  const isReady = !!readiness.isReadyForPartnerSignoff;

  return `
    <div class="card p-5">
      <div class="panel-title">Engagement Readiness</div>
      <div class="panel-subtitle mt-1">
        ${isReady
          ? "All workflow gates passed. Ready for partner sign-off."
          : "Sign-off is blocked until workflow issues are resolved."}
      </div>

      <div class="mt-4">
        <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
          isReady
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-amber-50 text-amber-700 border border-amber-200"
        }">
          ${isReady ? "Ready for Sign-Off" : "Not Ready"}
        </span>
      </div>

      <div class="mt-4 grid gap-2">
        ${
          blockers.length
            ? blockers.map((b) => `
              <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span class="font-semibold">${b.label}</span>
                <span class="ml-2 text-slate-500">${b.count}</span>
              </div>
            `).join("")
            : `
              <div class="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                No blocking issues detected.
              </div>
            `
        }
      </div>
    </div>
  `;
}

async function openWorkingPapersForLinkedDeliverable(deliverableId, me) {
  window.__PR_WORKING_PAPERS_STATE__ = window.__PR_WORKING_PAPERS_STATE__ || {};
  window.__PR_WORKING_PAPERS_STATE__.filters = window.__PR_WORKING_PAPERS_STATE__.filters || {};

  window.__PR_WORKING_PAPERS_STATE__.filters.q = String(deliverableId || "");
  window.__PR_WORKING_PAPERS_STATE__.filters.offset = 0;

  await switchPractitionerScreen(PR_NAV.workingPapers, me);
}

async function openDeliverablesForWorkingPaper(workingPaperRow, me) {
  const linkedId = workingPaperRow?.linked_deliverable_id;

  await switchPractitionerScreen(PR_NAV.deliverablesRegister, me);

  if (linkedId && window.__PR_DELIVERABLES_REGISTER_STATE__) {
    window.__PR_DELIVERABLES_REGISTER_STATE__.selectedId = linkedId;

    // force re-render after screen loads
    setTimeout(() => {
      if (window.renderDeliverablesRegisterScreen) {
        window.renderDeliverablesRegisterScreen(me);
      }
    }, 50);
  }
}

async function renderWorkflowReadinessInto(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  try {
    const snapshot = await loadEngagementWorkflowSnapshot();
    el.innerHTML = renderEngagementReadinessCard(snapshot?.readiness);
  } catch (err) {
    el.innerHTML = `
      <div class="card p-5">
        <div class="panel-title">Engagement Readiness</div>
        <div class="panel-subtitle mt-1">${String(err?.message || "Failed to load readiness.")}</div>
      </div>
    `;
  }
}

async function refreshEngagementWorkflowScreens(me) {
  const currentScreen =
    resolvePractitionerScreenName(
      String(window.location.hash || "").replace(/^#screen=/, "").replace(/^#/, "")
    ) || PR_NAV.dashboard;

  switch (currentScreen) {
    case PR_NAV.workingPapers:
      await renderWorkingPapersScreen?.(me);
      break;
    case PR_NAV.reviewQueue:
      await renderReviewQueueScreen?.(me);
      break;
    case PR_NAV.deliverablesRegister:
      await renderDeliverablesRegisterScreen?.(me);
      break;
    case PR_NAV.partnerSignoff:
      await renderPartnerSignoffScreen?.(me);
      break;
    default:
      break;
  }
}

async function renderDeliverablesRegisterScreen(me) {
  const container = document.getElementById("pr-main-content");
  if (!container) return;

  container.innerHTML = `<div class="p-6">Loading deliverables...</div>`;

  try {
    const snapshot = await loadEngagementWorkflowSnapshot();
    const rows = snapshot.deliverables || [];

    window.__PR_DELIVERABLES_STATE__ = { rows };

    container.innerHTML = `
      <div class="p-6 space-y-6">
        ${renderEngagementReadinessCard(snapshot.readiness)}

        <div class="card p-5">
          <div class="panel-title">Deliverables Register</div>

          <div class="mt-4 grid gap-3">
            ${
              rows.length
                ? rows.map((d) => `
                  <div class="border rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div class="font-semibold">${d.deliverable_name || "Unnamed"}</div>
                      <div class="text-sm text-slate-500">
                        Status: ${d.status || "N/A"} • Priority: ${d.priority || "normal"}
                      </div>
                    </div>

                    <div class="flex gap-2">
                      <button
                        class="px-3 py-1 text-xs bg-blue-50 border rounded"
                        data-deliv-create-wp="${d.id}"
                      >
                        Create WP
                      </button>
                    </div>
                  </div>
                `).join("")
                : `<div class="text-slate-500 text-sm">No deliverables found.</div>`
            }
          </div>
        </div>
      </div>
    `;

    // 🔗 bind buttons
    document.querySelectorAll("[data-deliv-create-wp]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-deliv-create-wp");
        const row = rows.find(r => String(r.id) === String(id));
        if (!row) return;

        try {
          const wp = await createWorkingPaperFromDeliverable(row);
          alert(`Working paper created`);
          await switchPractitionerScreen(PR_NAV.workingPapers, me);
        } catch (err) {
          alert(err.message);
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="p-6 text-red-600">${err.message}</div>`;
  }
}

async function renderEngagementWorkingPapersSnapshot(me) {
  const container = document.getElementById("pr-main-content");
  if (!container) return;

  container.innerHTML = `<div class="p-6">Loading working papers...</div>`;

  try {
    const snapshot = await loadEngagementWorkflowSnapshot();
    const rows = snapshot.workingPapers || [];

    container.innerHTML = `
      <div class="p-6 space-y-6">
        ${renderEngagementReadinessCard(snapshot.readiness)}

        <div class="card p-5">
          <div class="panel-title">Working Papers</div>

          <div class="mt-4 grid gap-3">
            ${
              rows.length
                ? rows.map((w) => `
                  <div class="border rounded-xl p-4 flex justify-between">
                    <div>
                      <div class="font-semibold">${w.paper_name || "Workpaper"}</div>
                      <div class="text-sm text-slate-500">
                        Status: ${w.status || "N/A"}
                      </div>
                    </div>

                    <div class="flex gap-2">
                      <button data-wp-mark-prepared="${w.id}" class="px-2 py-1 text-xs border rounded">
                        Prepare
                      </button>
                      <button data-wp-send-review="${w.id}" class="px-2 py-1 text-xs border rounded bg-amber-50">
                        Send to Review
                      </button>
                    </div>
                  </div>
                `).join("")
                : `<div class="text-sm text-slate-500">No working papers.</div>`
            }
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll("[data-wp-mark-prepared]").forEach(btn => {
      btn.onclick = async () => {
        await markWorkingPaperPrepared(btn.dataset.wpMarkPrepared);
        renderEngagementWorkingPapersSnapshot(me);
      };
    });

    document.querySelectorAll("[data-wp-send-review]").forEach(btn => {
      btn.onclick = async () => {
        await sendWorkingPaperToReview(btn.dataset.wpSendReview);
        renderEngagementWorkingPapersSnapshot(me);
      };
    });

  } catch (err) {
    container.innerHTML = `<div class="p-6 text-red-600">${err.message}</div>`;
  }
}

async function renderReviewQueueScreen(me) {
  const container = document.getElementById("pr-main-content");
  if (!container) return;

  container.innerHTML = `<div class="p-6">Loading review queue...</div>`;

  try {
    const snapshot = await loadEngagementWorkflowSnapshot();
    const rows = snapshot.reviewQueue || [];

    window.__PR_REVIEW_QUEUE_STATE__ = { rows };

    container.innerHTML = `
      <div class="p-6 space-y-6">
        ${renderEngagementReadinessCard(snapshot.readiness)}

        <div class="card p-5">
          <div class="panel-title">Review Queue</div>

          <div class="mt-4 grid gap-3">
            ${
              rows.length
                ? rows.map((r) => `
                  <div class="border rounded-xl p-4 flex justify-between">
                    <div>
                      <div class="font-semibold">${r.queue_type}</div>
                      <div class="text-sm text-slate-500">Status: ${r.status}</div>
                    </div>

                    <div class="flex gap-2">
                      <button data-rq-action="approve" data-rq-id="${r.source_id}" data-rq-type="${r.queue_type}" class="px-2 py-1 text-xs border rounded bg-green-50">Approve</button>
                      <button data-rq-action="return" data-rq-id="${r.source_id}" data-rq-type="${r.queue_type}" class="px-2 py-1 text-xs border rounded bg-red-50">Return</button>
                      <button data-rq-action="block" data-rq-id="${r.source_id}" data-rq-type="${r.queue_type}" class="px-2 py-1 text-xs border rounded">Block</button>
                    </div>
                  </div>
                `).join("")
                : `<div class="text-sm text-slate-500">No review items.</div>`
            }
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll("[data-rq-action]").forEach(btn => {
      btn.onclick = async () => {
        const action = btn.dataset.rqAction;
        const id = btn.dataset.rqId;
        const type = btn.dataset.rqType;

        const row = rows.find(r =>
          String(r.source_id) === String(id) &&
          String(r.queue_type) === String(type)
        );
        if (!row) return;

        await resolveReviewQueueAction(row, action);
        renderReviewQueueScreen(me);
      };
    });

  } catch (err) {
    container.innerHTML = `<div class="p-6 text-red-600">${err.message}</div>`;
  }
}

async function renderPartnerSignoffScreen(me) {
  const container = document.getElementById("pr-main-content");
  if (!container) return;

  container.innerHTML = `<div class="p-6">Loading sign-off...</div>`;

  try {
    const snapshot = await loadEngagementWorkflowSnapshot();
    const readiness = snapshot.readiness;

    const isReady = readiness?.isReadyForPartnerSignoff;

    container.innerHTML = `
      <div class="p-6 space-y-6">

        ${renderEngagementReadinessCard(readiness)}

        <div class="card p-5">
          <div class="panel-title">Partner Sign-Off</div>

          ${
            !isReady
              ? `
              <div class="mt-4 text-amber-600 text-sm">
                Cannot sign off. Resolve blockers first.
              </div>
              `
              : `
              <div class="mt-4">
                <button id="finalSignoffBtn" class="px-4 py-2 bg-green-600 text-white rounded">
                  Final Sign-Off
                </button>
              </div>
              `
          }
        </div>
      </div>
    `;

    if (isReady) {
      document.getElementById("finalSignoffBtn").onclick = () => {
        alert("✅ Engagement Signed Off");
      };
    }

  } catch (err) {
    container.innerHTML = `<div class="p-6 text-red-600">${err.message}</div>`;
  }
}

function drBuildToolbarHtml() {
  const f = window.__PR_DELIVERABLES_REGISTER_STATE__.filters || {};

  return `
    <div class="card p-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="panel-title">Deliverables Register</div>
          <div class="panel-subtitle mt-1">
            Full lifecycle register for all engagement deliverables, assignments, due dates, review status, and linked working paper actions.
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <input
            id="drSearchInput"
            type="text"
            value="${drEsc(f.q || "")}"
            placeholder="Search deliverables..."
            class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button id="drSearchBtn" class="badge badge-slate">Search</button>
          <button id="drRefreshBtn" class="badge badge-slate">Refresh</button>
          <button id="drAddBtn" class="badge badge-brand">Add Deliverable</button>
        </div>
      </div>
    </div>
  `;
}

function drBuildKpisHtml(summary) {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      <div class="card p-4">
        <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Total Deliverables</div>
        <div class="mt-2 metric-number">${summary.total || 0}</div>
        <div class="mt-1 text-sm text-slate-600">All active deliverables in scope</div>
      </div>

      <div class="card p-4">
        <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Open</div>
        <div class="mt-2 metric-number">${summary.open || 0}</div>
        <div class="mt-1 text-sm text-slate-600">Still in progress or awaiting action</div>
      </div>

      <div class="card p-4">
        <div class="text-xs uppercase tracking-[0.08em] text-slate-500">In Review</div>
        <div class="mt-2 metric-number">${summary.inReview || 0}</div>
        <div class="mt-1 text-sm text-slate-600">Prepared and under review</div>
      </div>

      <div class="card p-4">
        <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Overdue</div>
        <div class="mt-2 metric-number">${summary.overdue || 0}</div>
        <div class="mt-1 text-sm text-slate-600">Past due and not yet closed</div>
      </div>

      <div class="card p-4">
        <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Completed</div>
        <div class="mt-2 metric-number">${summary.completed || 0}</div>
        <div class="mt-1 text-sm text-slate-600">Closed or submitted items</div>
      </div>
    </div>
  `;
}

function drBuildRegisterHtml() {
  const state = window.__PR_DELIVERABLES_REGISTER_STATE__;
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const f = state.filters || {};

  const rowHtml = rows.length
    ? rows.map((row) => {
        const isSelected = String(state.selectedId) === String(row.id);

        return `
          <tr class="${isSelected ? "is-selected" : ""}" data-dr-row-id="${drEsc(row.id)}">
            <td>
              <div class="font-semibold">${drEsc(row.deliverable_name || "Unnamed Deliverable")}</div>
              <div class="text-xs text-slate-500">${drEsc(row.deliverable_code || "No code")}</div>
            </td>
            <td>${drEsc(drPretty(row.deliverable_type || "general"))}</td>
            <td>${drEsc(row.assigned_user_name || "—")}</td>
            <td>${drEsc(row.reviewer_user_name || "—")}</td>
            <td>${drEsc(drDate(row.due_date))}</td>
            <td><span class="wp-badge ${drStatusClass(row.status)}">${drEsc(drPretty(row.status || "not_started"))}</span></td>
            <td><span class="wp-badge ${drPriorityClass(row.priority)}">${drEsc(drPretty(row.priority || "normal"))}</span></td>
            <td>
              <div class="flex gap-2 flex-wrap">
                <button
                  class="px-3 py-1 text-xs bg-blue-50 border rounded"
                  data-dr-open="${drEsc(row.id)}"
                >
                  Details
                </button>

                <button
                  class="px-3 py-1 text-xs bg-indigo-50 border rounded"
                  data-dr-open-wps="${drEsc(row.id)}"
                >
                  Working Papers
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("")
    : `
      <tr>
        <td colspan="8">
          <div class="py-8 text-center text-sm text-slate-500">No deliverables found for the current engagement and filters.</div>
        </td>
      </tr>
    `;

  return `
    <div class="card p-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="panel-title">Register</div>
          <div class="panel-subtitle mt-1">Track ownership, due dates, status progression, and working paper creation.</div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <select id="drTypeFilter" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All types</option>
            <option value="report" ${f.deliverable_type === "report" ? "selected" : ""}>Report</option>
            <option value="schedule" ${f.deliverable_type === "schedule" ? "selected" : ""}>Schedule</option>
            <option value="fs" ${f.deliverable_type === "fs" ? "selected" : ""}>FS</option>
            <option value="tax" ${f.deliverable_type === "tax" ? "selected" : ""}>Tax</option>
            <option value="support" ${f.deliverable_type === "support" ? "selected" : ""}>Support</option>
          </select>

          <select id="drStatusFilter" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All statuses</option>
            <option value="not_started" ${f.status === "not_started" ? "selected" : ""}>Not started</option>
            <option value="in_progress" ${f.status === "in_progress" ? "selected" : ""}>In progress</option>
            <option value="prepared" ${f.status === "prepared" ? "selected" : ""}>Prepared</option>
            <option value="in_review" ${f.status === "in_review" ? "selected" : ""}>In review</option>
            <option value="completed" ${f.status === "completed" ? "selected" : ""}>Completed</option>
            <option value="blocked" ${f.status === "blocked" ? "selected" : ""}>Blocked</option>
          </select>

          <select id="drPriorityFilter" class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All priorities</option>
            <option value="urgent" ${f.priority === "urgent" ? "selected" : ""}>Urgent</option>
            <option value="high" ${f.priority === "high" ? "selected" : ""}>High</option>
            <option value="normal" ${f.priority === "normal" ? "selected" : ""}>Normal</option>
            <option value="low" ${f.priority === "low" ? "selected" : ""}>Low</option>
          </select>
        </div>
      </div>

      <div class="mt-4 overflow-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Deliverable</th>
              <th>Type</th>
              <th>Assigned To</th>
              <th>Reviewer</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

function drBuildDetailHtml() {
  const row = drGetSelectedRow();

  if (!row) {
    return `
      <div class="card p-6">
        <div class="panel-title">Selected Deliverable</div>
        <div class="panel-subtitle mt-1">Select a deliverable from the register to view details.</div>
        <div class="mt-6 text-sm text-slate-500">No deliverable selected.</div>
      </div>
    `;
  }

  return `
    <div class="card p-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="panel-title">${drEsc(row.deliverable_name || "Unnamed Deliverable")}</div>
          <div class="panel-subtitle mt-1">
            ${drEsc(row.deliverable_code || "No code")} • ${drEsc(drPretty(row.deliverable_type || "general"))}
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <button class="badge badge-slate" data-dr-mark-status="prepared">Mark prepared</button>
          <button class="badge badge-slate" data-dr-mark-status="in_review">Send to review</button>
          <button class="badge badge-brand" data-dr-create-wp-selected="${drEsc(row.id)}">Create WP</button>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Status</div>
          <div class="mt-2"><span class="wp-badge ${drStatusClass(row.status)}">${drEsc(drPretty(row.status || "not_started"))}</span></div>
        </div>

        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Priority</div>
          <div class="mt-2"><span class="wp-badge ${drPriorityClass(row.priority)}">${drEsc(drPretty(row.priority || "normal"))}</span></div>
        </div>

        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Due Date</div>
          <div class="mt-2 text-sm text-slate-700">${drEsc(drDate(row.due_date))}</div>
        </div>

        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Assigned To</div>
          <div class="mt-2 text-sm text-slate-700">${drEsc(row.assigned_user_name || "—")}</div>
        </div>

        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Reviewer</div>
          <div class="mt-2 text-sm text-slate-700">${drEsc(row.reviewer_user_name || "—")}</div>
        </div>

        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Requested From</div>
          <div class="mt-2 text-sm text-slate-700">${drEsc(row.requested_from_name || row.requested_from || "—")}</div>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Description</div>
          <div class="mt-2 text-sm text-slate-700 whitespace-pre-wrap">${drEsc(row.description || "No description captured.")}</div>
        </div>

        <div class="card-soft p-4">
          <div class="text-xs uppercase tracking-[0.08em] text-slate-500">Notes</div>
          <div class="mt-2 text-sm text-slate-700 whitespace-pre-wrap">${drEsc(row.notes || "No notes captured.")}</div>
        </div>
      </div>
    </div>
  `;
}

function drRenderShell() {
  const mount = document.getElementById("deliverablesRegisterMount");
  if (!mount) return;

  const state = window.__PR_DELIVERABLES_REGISTER_STATE__;

  mount.innerHTML = `
    ${drBuildToolbarHtml()}
    ${drBuildKpisHtml(state.summary)}
    <div class="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
      <div>${drBuildRegisterHtml()}</div>
      <div>${drBuildDetailHtml()}</div>
    </div>
  `;

  drBindEvents();
}

async function renderDeliverablesRegisterScreen(me) {
  const mount = document.getElementById("deliverablesRegisterMount");
  if (!mount) return;

  const engagementId = getPractitionerActiveEngagementId?.();
  if (!engagementId) {
    mount.innerHTML = `
      <div class="card p-6">
        <div class="panel-title">Deliverables Register</div>
        <div class="panel-subtitle mt-1">Select an engagement first to open the deliverables register.</div>
      </div>
    `;
    return;
  }

  mount.innerHTML = `
    <div class="card p-6">
      <div class="text-sm text-slate-500">Loading deliverables register...</div>
    </div>
  `;

  try {
    const state = window.__PR_DELIVERABLES_REGISTER_STATE__;
    const rows = await drLoadRows();

    state.rows = Array.isArray(rows) ? rows : [];
    state.summary = drBuildSummary(state.rows);

    if (!state.selectedId && state.rows.length) {
      state.selectedId = state.rows[0].id;
    } else if (state.selectedId && !state.rows.find((r) => String(r.id) === String(state.selectedId))) {
      state.selectedId = state.rows[0]?.id || null;
    }

    drRenderShell();
  } catch (err) {
    mount.innerHTML = `
      <div class="card p-6">
        <div class="text-sm text-red-600">${drEsc(err?.message || "Failed to load deliverables register.")}</div>
      </div>
    `;
  }
}

function drBindEvents() {
  const state = window.__PR_DELIVERABLES_REGISTER_STATE__;

  document.getElementById("drSearchBtn")?.addEventListener("click", async () => {
    state.filters.q = document.getElementById("drSearchInput")?.value?.trim() || "";
    state.filters.offset = 0;
    await renderDeliverablesRegisterScreen(window.__PR_ME__);
  });

  document.getElementById("drSearchInput")?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.filters.q = e.currentTarget.value.trim() || "";
      state.filters.offset = 0;
      await renderDeliverablesRegisterScreen(window.__PR_ME__);
    }
  });

  document.getElementById("drRefreshBtn")?.addEventListener("click", async () => {
    await renderDeliverablesRegisterScreen(window.__PR_ME__);
  });

  document.getElementById("drTypeFilter")?.addEventListener("change", async (e) => {
    state.filters.deliverable_type = e.target.value || "";
    state.filters.offset = 0;
    await renderDeliverablesRegisterScreen(window.__PR_ME__);
  });

  document.getElementById("drStatusFilter")?.addEventListener("change", async (e) => {
    state.filters.status = e.target.value || "";
    state.filters.offset = 0;
    await renderDeliverablesRegisterScreen(window.__PR_ME__);
  });

  document.getElementById("drPriorityFilter")?.addEventListener("change", async (e) => {
    state.filters.priority = e.target.value || "";
    state.filters.offset = 0;
    await renderDeliverablesRegisterScreen(window.__PR_ME__);
  });

  document.querySelectorAll("[data-dr-row-id]").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedId = el.getAttribute("data-dr-row-id");
      drRenderShell();
    });
  });

  document.querySelectorAll("[data-dr-open]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selectedId = btn.getAttribute("data-dr-open");
      drRenderShell();
    });
  });

  document.querySelectorAll("[data-dr-open-wps]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation(); // 🔥 prevents row click conflict

      const id = btn.getAttribute("data-dr-open-wps");
      await openWorkingPapersForLinkedDeliverable(id, window.__PR_ME__);
    });
  });

  document.querySelectorAll("[data-dr-create-wp]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-dr-create-wp");
      const row = state.rows.find((r) => String(r.id) === String(id));
      if (!row) return;

      try {
        await createWorkingPaperFromDeliverable(row);
        alert("Working paper created.");
        await switchPractitionerScreen(PR_NAV.workingPapers, window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to create working paper.");
      }
    });
  });

  document.querySelectorAll("[data-dr-create-wp-selected]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-dr-create-wp-selected");
      const row = state.rows.find((r) => String(r.id) === String(id));
      if (!row) return;

      try {
        await createWorkingPaperFromDeliverable(row);
        alert("Working paper created.");
        await switchPractitionerScreen(PR_NAV.workingPapers, window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to create working paper.");
      }
    });
  });

  document.querySelectorAll("[data-dr-mark-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextStatus = btn.getAttribute("data-dr-mark-status");
      const row = drGetSelectedRow();
      if (!row?.id || !nextStatus) return;

      try {
        const companyId = getPractitionerActiveCompanyId?.();
        const engagementId = getPractitionerActiveEngagementId?.();
        if (!companyId || !engagementId) return;

        await apiFetch(
          ENDPOINTS.engagementOps.deliverablesSetStatus(companyId, row.id),
          {
            method: "POST",
            body: JSON.stringify({ status: nextStatus })
          }
        );

        await renderDeliverablesRegisterScreen(window.__PR_ME__);
      } catch (err) {
        alert(err?.message || "Failed to update deliverable status.");
      }
    });
  });

  document.getElementById("drAddBtn")?.addEventListener("click", () => {
    alert("Wire this button to your add-deliverable modal.");
  });
}

window.renderEngagementAuditTrailScreen ||= function renderEngagementAuditTrailScreen(me) {
  renderAuditTrailWorkspace({
    rootId: "screen-engagement-audit-trail",
    title: "Engagement Audit Trail",
    subtitle: "Audit history for engagement workflow actions, status changes, assignments, and engagement-level updates.",
    defaultFilters: {
      module: "engagements",
      entity_type: "",
    },
    scope: "engagement",
  });
};

window.renderPracticeAuditTrailScreen ||= function renderPracticeAuditTrailScreen(me) {
  renderAuditTrailWorkspace({
    rootId: "screen-practice-audit-trail",
    title: "Practice Audit Trail",
    subtitle: "Cross-engagement audit history, workflow overrides, review actions, and practice-level control activity.",
    defaultFilters: {
      module: "",
      entity_type: "",
    },
    scope: "practice",
  });
};

function renderAuditTrailWorkspace({
  rootId,
  title,
  subtitle,
  defaultFilters = {},
  scope = "practice",
}) {
  const root = document.getElementById(rootId);
  if (!root) return;

  const me =
    window.__PR_ME__ ||
    window.currentUser ||
    (() => {
      try {
        return JSON.parse(localStorage.getItem("fs_user") || "null") || {};
      } catch (_) {
        return {};
      }
    })();

  const companyId =
    window.getActiveCompanyId?.() ||
    me?.company_id ||
    me?.companyId ||
    "";

  const currentEngagementId =
    window.getActiveEngagementId?.() ||
    window.__ENGAGEMENT_ID__ ||
    "";

  const currentUserId =
    window.getCurrentUser?.()?.id ||
    me?.id ||
    "";

  const apiFetchFn =
    typeof apiFetch === "function" ? apiFetch : window.apiFetch || null;

  const endpoints =
    typeof ENDPOINTS !== "undefined" ? ENDPOINTS : (window.ENDPOINTS || window.endpoints || {});

  if (!apiFetchFn) {
    root.innerHTML = `
      <div class="audit-screen-shell">
        <div class="audit-card">
          <div class="audit-title">${escapeHtml(title)}</div>
          <div class="audit-subtitle">${escapeHtml(subtitle)}</div>
          <div class="audit-empty">apiFetch is not available.</div>
        </div>
      </div>
    `;
    return;
  }

  if (!companyId) {
    root.innerHTML = `
      <div class="audit-screen-shell">
        <div class="audit-card">
          <div class="audit-title">${escapeHtml(title)}</div>
          <div class="audit-subtitle">${escapeHtml(subtitle)}</div>
          <div class="audit-empty">Company context is not available.</div>
        </div>
      </div>
    `;
    return;
  }

  if (!endpoints?.audit?.list) {
    root.innerHTML = `
      <div class="audit-screen-shell">
        <div class="audit-card">
          <div class="audit-title">${escapeHtml(title)}</div>
          <div class="audit-subtitle">${escapeHtml(subtitle)}</div>
          <div class="audit-empty">Audit endpoint is not registered.</div>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <style>
      .audit-screen-shell {
        padding: 20px;
      }
      .audit-card {
        background: #ffffff;
        border: 1px solid #d7e4ea;
        border-radius: 24px;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
        padding: 20px;
      }
      .audit-header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 16px;
        margin-bottom: 18px;
      }
      .audit-title {
        font-size: 1.35rem;
        font-weight: 700;
        color: #123040;
      }
      .audit-subtitle {
        margin-top: 6px;
        color: #5c7481;
        font-size: 0.95rem;
      }
      .audit-toolbar {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .audit-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .audit-field label {
        font-size: 0.78rem;
        font-weight: 600;
        color: #4b6472;
      }
      .audit-input,
      .audit-select {
        min-height: 40px;
        border: 1px solid #d7e4ea;
        border-radius: 12px;
        background: #fff;
        padding: 0 12px;
        color: #123040;
        outline: none;
      }
      .audit-input:focus,
      .audit-select:focus {
        border-color: #0f766e;
        box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
      }
      .audit-actions {
        display: flex;
        gap: 10px;
        align-items: end;
      }
      .audit-btn {
        min-height: 40px;
        border: 1px solid #d7e4ea;
        background: #fff;
        color: #123040;
        border-radius: 12px;
        padding: 0 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .audit-btn-primary {
        background: #0f766e;
        border-color: #0f766e;
        color: #fff;
      }
      .audit-btn:hover {
        background: #f8fbfd;
      }
      .audit-btn-primary:hover {
        background: #0b5f59;
      }
      .audit-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin: 14px 0 10px;
        color: #55707f;
        font-size: 0.85rem;
      }
      .audit-table-wrap {
        overflow: auto;
        border: 1px solid #d7e4ea;
        border-radius: 16px;
        background: #fff;
      }
      .audit-table {
        width: 100%;
        border-collapse: collapse;
      }
      .audit-table th,
      .audit-table td {
        padding: 12px 14px;
        text-align: left;
        border-bottom: 1px solid #e6eef2;
        vertical-align: top;
      }
      .audit-table th {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #5d7786;
        background: #f8fbfd;
      }
      .audit-table td {
        color: #123040;
        font-size: 0.9rem;
      }
      .audit-empty,
      .audit-loading {
        padding: 18px 8px;
        text-align: center;
        color: #607987;
      }
      .audit-pill {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: #e8f6f4;
        color: #0f766e;
        font-size: 0.75rem;
        font-weight: 700;
      }
      .audit-pill-muted {
        background: #eef4f7;
        color: #4d6573;
      }
      .audit-code {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 8px;
        background: #f4f7f9;
        color: #375160;
        font-size: 0.78rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .audit-row-actions {
        display: flex;
        gap: 8px;
      }
      .audit-link-btn {
        border: 0;
        background: transparent;
        color: #0f766e;
        font-weight: 700;
        cursor: pointer;
        padding: 0;
      }
      .audit-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
      }
      .audit-footer-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .hidden {
        display: none !important;
      }
      .audit-drawer {
        margin-top: 18px;
        border: 1px solid #d7e4ea;
        border-radius: 18px;
        overflow: hidden;
        background: #fbfdfe;
      }
      .audit-drawer-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid #e6eef2;
      }
      .audit-drawer-title {
        font-weight: 700;
        color: #123040;
      }
      .audit-drawer-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .audit-json-panel {
        padding: 14px 16px;
        border-right: 1px solid #e6eef2;
      }
      .audit-json-panel:last-child {
        border-right: 0;
      }
      .audit-json-title {
        font-size: 0.82rem;
        font-weight: 700;
        color: #48616f;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .audit-json-pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.82rem;
        line-height: 1.45;
        color: #123040;
        background: #fff;
        border: 1px solid #e2ebf0;
        border-radius: 14px;
        padding: 12px;
        max-height: 340px;
        overflow: auto;
      }
      @media (max-width: 1200px) {
        .audit-toolbar {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 760px) {
        .audit-toolbar {
          grid-template-columns: 1fr;
        }
        .audit-drawer-grid {
          grid-template-columns: 1fr;
        }
        .audit-json-panel {
          border-right: 0;
          border-bottom: 1px solid #e6eef2;
        }
        .audit-json-panel:last-child {
          border-bottom: 0;
        }
      }
    </style>

    <div class="audit-screen-shell">
      <div class="audit-card">
        <div class="audit-header">
          <div>
            <div class="audit-title">${escapeHtml(title)}</div>
            <div class="audit-subtitle">${escapeHtml(subtitle)}</div>
          </div>
        </div>

        <div class="audit-toolbar">
          <div class="audit-field">
            <label>Module</label>
            <select class="audit-select" data-role="module">
              <option value="">All modules</option>
              <option value="engagements">Engagements</option>
              <option value="review_queue">Review Queue</option>
              <option value="action_center">Action Center</option>
              <option value="ppe">PPE</option>
              <option value="leases">Leases</option>
              <option value="journals">Journals</option>
            </select>
          </div>

          <div class="audit-field">
            <label>Severity</label>
            <select class="audit-select" data-role="severity">
              <option value="">All severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div class="audit-field">
            <label>Entity type</label>
            <input class="audit-input" data-role="entity_type" placeholder="e.g. engagement" />
          </div>

          <div class="audit-field">
            <label>Entity ID</label>
            <input class="audit-input" data-role="entity_id" placeholder="Filter by entity id" />
          </div>

          <div class="audit-field">
            <label>Actor user ID</label>
            <input class="audit-input" data-role="actor_user_id" placeholder="Filter by user id" />
          </div>

          <div class="audit-field">
            <label>Scope</label>
            <select class="audit-select" data-role="scope">
              <option value="practice">Practice</option>
              <option value="engagement">Engagement</option>
              <option value="mine">Mine</option>
            </select>
          </div>

          <div class="audit-field">
            <label>From</label>
            <input class="audit-input" data-role="from" type="date" />
          </div>

          <div class="audit-field">
            <label>To</label>
            <input class="audit-input" data-role="to" type="date" />
          </div>

          <div class="audit-field" style="grid-column: span 2;">
            <label>Search text</label>
            <input class="audit-input" data-role="search_text" placeholder="Search message, ref, action" />
          </div>

          <div class="audit-actions" style="grid-column: span 2;">
            <button class="audit-btn audit-btn-primary" data-role="apply">Apply</button>
            <button class="audit-btn" data-role="reset">Reset</button>
          </div>
        </div>

        <div class="audit-meta">
          <div data-role="summary">Loading audit entries…</div>
          <div data-role="page-info"></div>
        </div>

        <div class="audit-table-wrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Module</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th>Message</th>
                <th>Severity</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-role="rows"></tbody>
          </table>
        </div>

        <div class="audit-footer">
          <div data-role="offset-label">Offset 0</div>
          <div class="audit-footer-actions">
            <button class="audit-btn" data-role="prev">Prev</button>
            <button class="audit-btn" data-role="next">Next</button>
          </div>
        </div>

        <div class="audit-drawer hidden" data-role="drawer">
          <div class="audit-drawer-head">
            <div class="audit-drawer-title" data-role="drawer-title">Audit Entry</div>
            <button class="audit-btn" data-role="close-drawer">Close</button>
          </div>
          <div class="audit-drawer-grid">
            <div class="audit-json-panel">
              <div class="audit-json-title">Before</div>
              <pre class="audit-json-pre" data-role="before-json">{}</pre>
            </div>
            <div class="audit-json-panel">
              <div class="audit-json-title">After</div>
              <pre class="audit-json-pre" data-role="after-json">{}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const els = {
    module: root.querySelector('[data-role="module"]'),
    severity: root.querySelector('[data-role="severity"]'),
    entityType: root.querySelector('[data-role="entity_type"]'),
    entityId: root.querySelector('[data-role="entity_id"]'),
    actorUserId: root.querySelector('[data-role="actor_user_id"]'),
    from: root.querySelector('[data-role="from"]'),
    to: root.querySelector('[data-role="to"]'),
    searchText: root.querySelector('[data-role="search_text"]'),
    scope: root.querySelector('[data-role="scope"]'),
    apply: root.querySelector('[data-role="apply"]'),
    reset: root.querySelector('[data-role="reset"]'),
    rows: root.querySelector('[data-role="rows"]'),
    summary: root.querySelector('[data-role="summary"]'),
    pageInfo: root.querySelector('[data-role="page-info"]'),
    prev: root.querySelector('[data-role="prev"]'),
    next: root.querySelector('[data-role="next"]'),
    offsetLabel: root.querySelector('[data-role="offset-label"]'),
    drawer: root.querySelector('[data-role="drawer"]'),
    drawerTitle: root.querySelector('[data-role="drawer-title"]'),
    beforeJson: root.querySelector('[data-role="before-json"]'),
    afterJson: root.querySelector('[data-role="after-json"]'),
    closeDrawer: root.querySelector('[data-role="close-drawer"]'),
  };

  const state = {
    limit: 25,
    offset: 0,
    rows: [],
    selected: null,
  };

  els.module.value = defaultFilters.module || "";
  els.entityType.value = defaultFilters.entity_type || "";
  els.scope.value = scope === "engagement" ? "engagement" : "practice";

  async function loadAuditRows() {
    els.rows.innerHTML = `<tr><td colspan="8" class="audit-loading">Loading audit trail.</td></tr>`;

    const scopeValue = els.scope.value || "practice";
    const moduleValue = (els.module.value || "").trim();
    const severityValue = (els.severity.value || "").trim();
    const entityTypeValue = (els.entityType.value || "").trim();
    const entityIdValue = (els.entityId.value || "").trim();
    const actorUserIdValue = (els.actorUserId.value || "").trim();
    const fromValue = (els.from.value || "").trim();
    const toValue = (els.to.value || "").trim();
    const searchTextValue = (els.searchText.value || "").trim();

    const query = {
      limit: state.limit,
      offset: state.offset,
      module: moduleValue,
      severity: severityValue,
      entity_type: entityTypeValue,
      entity_id: entityIdValue,
      actor_user_id: actorUserIdValue,
      from: fromValue,
      to: toValue,
    };

    if (scopeValue === "mine" && currentUserId) {
      query.actor_user_id = String(currentUserId);
    }

    if (scopeValue === "engagement" && currentEngagementId) {
      if (!query.module) query.module = "engagements";
    }

    try {
      const url = endpoints.audit.list(companyId, query);
      const data = await apiFetchFn(url);

      if (data?.ok === false) {
        throw new Error(data?.error || data?.message || "Failed to load audit trail.");
      }

      let rows = Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];

      if (searchTextValue) {
        const needle = searchTextValue.toLowerCase();
        rows = rows.filter((r) => {
          const msg = String(r.message || "").toLowerCase();
          const ref = String(r.entity_ref || "").toLowerCase();
          const action = String(r.action || "").toLowerCase();
          return msg.includes(needle) || ref.includes(needle) || action.includes(needle);
        });
      }

      if (scopeValue === "engagement" && currentEngagementId) {
        rows = rows.filter((r) => {
          const before = JSON.stringify(r.before_json || {});
          const after = JSON.stringify(r.after_json || {});
          const idText = String(currentEngagementId);
          return (
            String(r.entity_id || "") === idText ||
            String(r.entity_ref || "").includes(idText) ||
            before.includes(idText) ||
            after.includes(idText)
          );
        });
      }

      state.rows = rows;
      renderRows();
    } catch (err) {
      els.rows.innerHTML = `<tr><td colspan="8" class="audit-empty">${escapeHtml(err.message || "Failed to load audit trail.")}</td></tr>`;
      els.summary.textContent = "Could not load audit trail.";
      els.pageInfo.textContent = "";
      els.offsetLabel.textContent = "";
    }
  }

  function renderRows() {
    const rows = state.rows || [];

    if (!rows.length) {
      els.rows.innerHTML = `<tr><td colspan="8" class="audit-empty">No audit entries found for the selected filters.</td></tr>`;
      els.summary.textContent = "0 audit entries";
      els.pageInfo.textContent = "";
      els.offsetLabel.textContent = `Offset ${state.offset}`;
      return;
    }

    els.rows.innerHTML = rows.map((row, idx) => {
      const displayEntity = [
        row.entity_type ? `<div><span class="audit-pill audit-pill-muted">${escapeHtml(row.entity_type)}</span></div>` : "",
        row.entity_id ? `<div class="mt-1"><span class="audit-code">${escapeHtml(String(row.entity_id))}</span></div>` : "",
        row.entity_ref ? `<div class="mt-1" style="color:#48616f;">${escapeHtml(String(row.entity_ref))}</div>` : "",
      ].join("");

      return `
        <tr>
          <td>${escapeHtml(formatAuditDate(row.created_at || row.createdAt || row.timestamp))}</td>
          <td>${row.module ? `<span class="audit-pill">${escapeHtml(String(row.module))}</span>` : "-"}</td>
          <td><strong>${escapeHtml(String(row.action || "-"))}</strong></td>
          <td>${displayEntity || "-"}</td>
          <td>${escapeHtml(String(row.actor_user_id || row.actorUserId || "-"))}</td>
          <td>${escapeHtml(String(row.message || "-"))}</td>
          <td>${row.severity ? `<span class="audit-pill audit-pill-muted">${escapeHtml(String(row.severity))}</span>` : "-"}</td>
          <td>
            <div class="audit-row-actions">
              <button class="audit-link-btn" data-inspect-index="${idx}">View</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    els.summary.textContent = `${rows.length} audit entr${rows.length === 1 ? "y" : "ies"} loaded`;
    els.pageInfo.textContent = `Showing ${state.offset + 1} - ${state.offset + rows.length}`;
    els.offsetLabel.textContent = `Offset ${state.offset}`;

    els.rows.querySelectorAll("[data-inspect-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-inspect-index"));
        openDrawer(state.rows[idx]);
      });
    });
  }

  function openDrawer(row) {
    if (!row) return;
    els.drawer.classList.remove("hidden");
    els.drawerTitle.textContent = `${row.action || "Audit Entry"} • ${row.entity_ref || row.entity_id || ""}`.trim();
    els.beforeJson.textContent = safePrettyJson(row.before_json || {});
    els.afterJson.textContent = safePrettyJson(row.after_json || {});
  }

  function resetFilters() {
    state.offset = 0;
    els.module.value = defaultFilters.module || "";
    els.severity.value = "";
    els.entityType.value = defaultFilters.entity_type || "";
    els.entityId.value = "";
    els.actorUserId.value = "";
    els.from.value = "";
    els.to.value = "";
    els.searchText.value = "";
    els.scope.value = scope === "engagement" ? "engagement" : "practice";
    els.drawer.classList.add("hidden");
    loadAuditRows();
  }

  els.apply.addEventListener("click", () => {
    state.offset = 0;
    loadAuditRows();
  });

  els.reset.addEventListener("click", resetFilters);

  els.prev.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    loadAuditRows();
  });

  els.next.addEventListener("click", () => {
    if ((state.rows || []).length < state.limit) return;
    state.offset += state.limit;
    loadAuditRows();
  });

  els.closeDrawer.addEventListener("click", () => {
    els.drawer.classList.add("hidden");
  });

  loadAuditRows();
}

function formatAuditDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function safePrettyJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "{}");
  }
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

  const isDelegated =
    !!me?.is_delegated_company_access ||
    String(me?.access_scope || "").toLowerCase() === "delegated_workspace";

  if (isDelegated) {
    if (window.__STOP_REDIRECTS__) {
      console.warn("[REDIRECT BLOCKED] delegated workspace -> dashboard.html");
    } else {
      window.location.replace("dashboard.html");
    }
    return;
  }

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

  const persistedEngagementId = window.getPractitionerActiveEngagementId?.();
  if (persistedEngagementId) {
    window.__PR_CONTEXT__ = {
      ...(window.__PR_CONTEXT__ || {}),
      engagementId: persistedEngagementId
    };
  }
  window.restorePractitionerActiveEngagement?.();
  restorePractitionerReturnContext();

  const firstScreen = resolvePractitionerScreenName(getHashScreen() || PR_NAV.dashboard);
  switchPractitionerScreen(firstScreen, me, { updateHash: false });

  initPractitionerDashboardModeSwitcher(companies, me, "practitioner");
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

  const isDelegated =
    !!me?.is_delegated_company_access ||
    String(me?.access_scope || "").toLowerCase() === "delegated_workspace";

  if (isDelegated) {
    window.currentUser = me;
    localStorage.setItem("fs_user", JSON.stringify(me || {}));

    if (window.__STOP_REDIRECTS__) {
      console.warn("[REDIRECT BLOCKED] initPractitioner delegated -> dashboard.html");
    } else {
      window.location.replace("dashboard.html");
    }
    return;
  
  }

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

















