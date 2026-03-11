from BackEnd.Services.api_server import app, db_service

print("[BOOTSTRAP] Starting master + company schema initialization")

with app.app_context():
    # 1️⃣ ensure master/public tables exist
    db_service.init_master_schema()

    # 2️⃣ provision tenant schema for existing companies
    company_ids = db_service.list_company_ids()

    print("[BOOTSTRAP] Companies found:", company_ids)

    for cid in company_ids:
        print(f"[BOOTSTRAP] Initializing company schema for {cid}")
        db_service.initialize_company_schema(int(cid))

print("[BOOTSTRAP] Done")