
"""
FinSage — Phase 4: subscription daily job + nudges
"""

import os
import logging
from datetime import datetime

from flask import Blueprint, jsonify, request

from BackEnd.Services.billing_service import (
    BillingService,
    trial_nudge_key,
    grace_nudge_key,
)

log = logging.getLogger("finsage.billing.jobs")

subscription_jobs_bp = Blueprint("subscription_jobs", __name__)

# Populated by register_subscription_jobs before the endpoint is called.
_job_config = {
    "db_service": None,
    "entitlement_service": None,
    "mailer": None,
    "token": None,
}


# ------------------------------------------------------------------
# Core daily pass
# ------------------------------------------------------------------

def run_daily(db_service, entitlement_service=None, mailer=None,
              today=None, send_nudges=True):
    """Run subscription lifecycle, renewals, and optional nudges."""
    today = today or datetime.utcnow()
    billing = BillingService(
        db_service,
        entitlement_service=entitlement_service,
        mailer=mailer,
    )
    summary = {
        "ran_at": today.isoformat(),
        "transitions": [],
        "renewals": [],
        "nudges": [],
    }

    summary["transitions"] += billing.expire_trials(today=today)
    summary["transitions"] += billing.apply_scheduled_changes(today=today)
    summary["renewals"] = billing.run_renewals(today=today)

    if send_nudges:
        summary["nudges"] = _send_nudges(billing, db_service, today)

    log.info(
        "subscription daily job done: %s",
        {k: len(v) for k, v in summary.items() if isinstance(v, list)},
    )
    return summary


def _send_nudges(billing, db_service, today):
    sent = []
    conn = db_service.get_conn()

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id, s.company_id, s.status, s.trial_ends_at,
                       s.metadata, u.email
                FROM public.company_subscriptions s
                LEFT JOIN LATERAL (
                    SELECT email FROM public.users
                    WHERE company_id = s.company_id
                      AND role = 'owner'
                    ORDER BY id LIMIT 1
                ) u ON TRUE
                WHERE s.status IN ('trialing', 'grace')
                """
            )
            rows = cur.fetchall()

            for (sub_id, company_id, status, trial_end, meta,
                 owner_email) in rows:
                meta = dict(meta or {})

                if status == "trialing":
                    key = trial_nudge_key(trial_end, today)
                else:
                    grace_end = meta.get("grace_ends_at")
                    grace_end = (
                        datetime.fromisoformat(grace_end)
                        if grace_end else None
                    )
                    key = grace_nudge_key(grace_end, today)

                if not key:
                    continue

                ref = f"{company_id}:{key}:{today.date().isoformat()}"

                cur.execute(
                    """
                    SELECT 1 FROM public.subscription_events
                    WHERE event_type = 'nudge' AND event_reference = %s
                    LIMIT 1
                    """,
                    (ref,),
                )
                if cur.fetchone():
                    continue

                cur.execute(
                    """
                    INSERT INTO public.subscription_events (
                        subscription_id, company_id, event_type,
                        event_status, event_reference, description
                    )
                    VALUES (%s, %s, 'nudge', 'succeeded', %s, %s)
                    """,
                    (sub_id, company_id, ref, f"sent {key}"),
                )

                billing._send(company_id, key, to_email=owner_email)
                sent.append({"company_id": company_id, "nudge": key})

    finally:
        conn.close()

    return sent


# ------------------------------------------------------------------
# HTTP routes: declared once, before blueprint registration
# ------------------------------------------------------------------

@subscription_jobs_bp.route(
    "/api/internal/cron/subscription-daily",
    methods=["POST", "GET"],
)
def subscription_daily():
    token = _job_config["token"]
    provided = (
        request.headers.get("X-Job-Token")
        or request.args.get("token")
        or ""
    )

    if not token or provided != token:
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    try:
        summary = run_daily(
            _job_config["db_service"],
            entitlement_service=_job_config["entitlement_service"],
            mailer=_job_config["mailer"],
        )
        return jsonify({"ok": True, "summary": summary}), 200
    except Exception:
        log.exception("subscription daily job failed")
        return jsonify({"ok": False, "error": "job_failed"}), 500


def register_subscription_jobs(app, db_service, entitlement_service=None,
                               mailer=None):
    """Configure dependencies and register the pre-declared blueprint."""
    _job_config.update({
        "db_service": db_service,
        "entitlement_service": entitlement_service,
        "mailer": mailer,
        "token": os.getenv("SUBSCRIPTION_JOBS_TOKEN"),
    })

    # Avoid registering the same blueprint twice on this app.
    if not app.extensions.get("subscription_jobs_registered"):
        app.register_blueprint(subscription_jobs_bp)
        app.extensions["subscription_jobs_registered"] = True

    log.info(
        "subscription jobs endpoint registered (token %s)",
        "set" if _job_config["token"] else "MISSING — endpoint refuses all calls",
    )
    return subscription_jobs_bp


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument("--daily", action="store_true")
    parser.add_argument(
        "--no-nudges",
        action="store_true",
        help="transitions/renewals only",
    )
    args = parser.parse_args()

    if not args.daily:
        print("usage: ... --daily [--no-nudges]")
        sys.exit(2)

    from BackEnd.Services.db_service import db_service

    summary = run_daily(
        db_service,
        send_nudges=not args.no_nudges,
    )
    print(summary)
