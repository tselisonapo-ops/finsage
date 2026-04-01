from __future__ import annotations

ACCOUNTING_RULES = {
    "journal": {
        "must_balance": True,
        "must_have_at_least_two_lines": True,
        "must_have_source_or_reference": True,
        "allowed_statuses": {"draft", "posted", "reversed"},
    },
    "posting": {
        "posted_record_must_have_journal": True,
        "posted_journal_must_have_posted_at": True,
    },
    "smoke_expectations": {
        "max_http_status_for_success": 299,
        "no_server_errors": True,
        "response_time_warn_ms": 3000,
    },
}