"""
Post draft GRN asset acquisitions for company_7 (opening drafts).

Run:
  source .venv/bin/activate
  python BackEnd/scripts/post_asset_acquisitions_company7.py

Assumes:
- get_conn(company_id) returns a connection scoped to that company's DB
- post_acquisition(cur, company_id, acquisition_id) posts and returns journal_id
"""

import sys
import psycopg2.extras

from BackEnd.Services.assets.ppe_db import get_conn
from BackEnd.Services.assets.posting import post_acquisition  # your existing posting logic

COMPANY_ID = 7

# ✅ Hard target your opening drafts (recommended)
ONLY_IDS = [10, 11, 12, 13, 14, 15]

DRY_RUN = False  # True = preview only, no posting


def fetch_target_acqs(cur):
    params = {"ids": ONLY_IDS}

    cur.execute(
        f"""
        SELECT
          aa.id,
          aa.asset_id,
          aa.acquisition_date,
          aa.amount,
          aa.status,
          aa.funding_source,
          aa.credit_account_code,
          aa.grn_no,
          aa.reference,
          aa.posted_journal_id,
          aa.posted_at,

          a.asset_name,
          a.asset_account_code
        FROM company_{COMPANY_ID}.asset_acquisitions aa
        JOIN company_{COMPANY_ID}.assets a ON a.id = aa.asset_id
        WHERE lower(aa.status) = 'draft'
          AND aa.id = ANY(%(ids)s)
          AND aa.posted_journal_id IS NULL
          AND aa.posted_at IS NULL

          -- ✅ GRN / AP-first path
          AND lower(COALESCE(aa.funding_source,'')) IN ('grn','ap')
          AND NULLIF(TRIM(COALESCE(aa.credit_account_code,'')), '') IS NOT NULL

          -- ✅ must have asset GL
          AND NULLIF(TRIM(COALESCE(a.asset_account_code,'')), '') IS NOT NULL

          -- ✅ must have a GRN reference if funding_source = grn (you already set OPEN-GRN-x)
          AND (
                lower(COALESCE(aa.funding_source,'')) <> 'grn'
                OR NULLIF(TRIM(COALESCE(aa.grn_no,'')), '') IS NOT NULL
              )
        ORDER BY aa.amount DESC, aa.id DESC
        """,
        params,
    )
    return cur.fetchall()


def main():
    with get_conn(COMPANY_ID) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            rows = fetch_target_acqs(cur)

            if not rows:
                print("No draft GRN/AP acquisitions found to post.")
                return 0

            print(f"Found {len(rows)} acquisitions to post:")
            for r in rows:
                print(
                    f"  - acq_id={r['id']} asset_id={r['asset_id']} "
                    f"date={r['acquisition_date']} amount={r['amount']} "
                    f"funding={r['funding_source']} credit={r['credit_account_code']} "
                    f"grn={r.get('grn_no')} asset_gl={r['asset_account_code']} ref={r.get('reference')}"
                )

            if DRY_RUN:
                print("\nDRY_RUN=True -> not posting.")
                return 0

            ok_count = 0
            for r in rows:
                acq_id = int(r["id"])
                print(f"\nPosting acquisition {acq_id}...")

                posted_journal_id = post_acquisition(cur, COMPANY_ID, acq_id)

                if not posted_journal_id:
                    raise Exception(f"Posting did not return journal id for acq_id={acq_id}")

                # ✅ Integrity check: journal_lines exist
                cur.execute(
                    f"SELECT COUNT(*) AS cnt FROM company_{COMPANY_ID}.journal_lines WHERE journal_id = %s",
                    (posted_journal_id,),
                )
                cnt = int(cur.fetchone()["cnt"])
                if cnt <= 0:
                    raise Exception(
                        f"Posted journal {posted_journal_id} has ZERO journal lines (acq_id={acq_id})."
                    )

                print(f"✅ Posted acq_id={acq_id} -> journal_id={posted_journal_id} journal_lines={cnt}")
                ok_count += 1

            conn.commit()
            print(f"\nDONE. Posted {ok_count}/{len(rows)} acquisitions.")
            return 0


if __name__ == "__main__":
    sys.exit(main())
