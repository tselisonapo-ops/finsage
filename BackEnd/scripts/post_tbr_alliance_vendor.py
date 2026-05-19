import os, sys, traceback

def main():
    ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)

    from BackEnd.Services.db_service import db_service

    company_id = int(os.getenv("COMPANY_ID", "0"))
    if not company_id:
        raise RuntimeError("Set COMPANY_ID")

    schema = db_service.company_schema(company_id)

    existing = db_service.fetch_one(f"""
        SELECT id FROM {schema}.vendors
        WHERE company_id=%s AND LOWER(name)=LOWER(%s)
        LIMIT 1
    """, (company_id, "Alliance Insurance Company"))

    if existing:
        print(f"Vendor already exists vendor_id={existing['id']}")
        return

    vendor_id = db_service.insert_vendor(company_id, {
        "name": "Alliance Insurance Company",
        "email": "Talk2Us@alliance.co.ls",
        "phone": "+26622215600",
        "country": "LS",
        "remit_address": "Alliance House, 4 Bowker Road, Maseru, Lesotho",
        "payment_terms": "Due on receipt",
        "vendor_status": "approved",
        "compliance_status": "verified",
        "compliance_required": False,
        "notes": "Insurance vendor created during TBR Deliveries reconstruction.",
        "is_active": True,
    })

    print(f"Created Alliance vendor_id={vendor_id}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAILED:", e)
        traceback.print_exc()
        raise