import os, sys, traceback

def main():
    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service
    from BackEnd.Services.routes.vendor_routes import post_bill_with_asset_awareness

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID")

    schema = db_service.company_schema(company_id)

    vendor = db_service.fetch_one(f"""
        SELECT id FROM {schema}.vendors
        WHERE company_id=%s AND LOWER(name)=LOWER(%s)
        LIMIT 1
    """, (company_id, "Alliance Insurance Company"))

    if not vendor:
        raise RuntimeError("Create Alliance vendor first")

    number = "ALLIANCE-INS-2024-11-BAL"

    existing = db_service.fetch_one(f"""
        SELECT id FROM {schema}.bills
        WHERE company_id=%s AND number=%s
        LIMIT 1
    """, (company_id, number))

    if existing:
        print(f"Skipping existing bill_id={existing['id']}")
        return

    header = {
        "vendor_id": int(vendor["id"]),
        "bill_date": "2024-11-06",
        "due_date": "2024-11-06",
        "currency": "LSL",
        "number": number,
        "status": "approved",
        "notes": "Alliance GE insurance prepaid balance from November 2024 reconstruction.",
    }

    lines = [{
        "description": "Alliance GE prepaid insurance balance",
        "account_code": "BS_CA_1400",
        "quantity": 1,
        "unit_price": 1505.29,
        "net_amount": 1505.29,
        "vat_rate": 0,
        "vat_amount": 0,
        "total_amount": 1505.29,
    }]

    bill_id = db_service.insert_bill_with_lines(company_id, header, lines)
    result = post_bill_with_asset_awareness(company_id, bill_id, payload={})

    print(f"Created and posted Alliance bill_id={bill_id}")
    print(result)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise