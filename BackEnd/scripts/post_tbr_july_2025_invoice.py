import os, sys, traceback

def main():
    print("=== Posting TBR July 2025 AR invoice ===")
    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.routes.invoice_routes import build_invoice_journal_lines

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID before running this script")

    schema = db_service.company_schema(company_id)
    customer_id = 1
    invoice_number = "TBR-GALITOS-2025-07"
    amount = 12770.00

    existing = db_service.fetch_one(f"""
        SELECT id FROM {schema}.invoices
        WHERE company_id=%s AND LOWER(TRIM(number))=LOWER(TRIM(%s))
        LIMIT 1
    """, (company_id, invoice_number))
    if existing:
        print(f"Skipping existing invoice invoice_id={existing['id']}")
        return

    header = {
        "customer_id": customer_id,
        "invoice_date": "2025-07-31",
        "due_date": "2025-08-01",
        "currency": "LSL",
        "number": invoice_number,
        "notes": "Delivery services rendered to GALITO'S STATION for July 2025",
        "status": "approved",
    }

    lines = [{
        "item_name": "Delivery Services",
        "item_type": "gl",
        "description": "Last-mile delivery services for July 2025",
        "account_code": "4100",
        "quantity": 1,
        "unit_price": amount,
        "discount_amount": 0,
        "vat_rate": 0,
        "net_amount": amount,
        "vat_amount": 0,
        "total_amount": amount,
    }]

    invoice_id = db_service.insert_invoice_with_lines(company_id, header, lines)
    inv = db_service.get_invoice_with_lines(company_id, invoice_id)
    payload = build_invoice_journal_lines(inv, company_id)

    journal_id = db_service.post_invoice_to_gl(
        company_id, invoice_id, payload["lines"],
        ar_account=payload.get("ar_account"),
        enforce_credit=False,
        require_approved=False,
    )

    print(f"Created invoice_id={invoice_id}")
    print(f"Posted invoice to GL journal_id={journal_id}")
    print("=== done ===")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise