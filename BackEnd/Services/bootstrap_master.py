from BackEnd.Services.api_server import app, db_service

print("[BOOTSTRAP] Starting master + company schema initialization")

with app.app_context():
    # 1. Create core public/master tables
    db_service.init_master_schema()

    # 2. Create other shared public support tables
    db_service.initialize_public_schema()

    # 3. Provision existing tenant schemas
    company_ids = db_service.list_company_ids()
    print("[BOOTSTRAP] Companies found:", company_ids)

    for cid in company_ids:
        print(f"[BOOTSTRAP] Initializing company schema for {cid}")
        db_service.initialize_company_schema(int(cid))

print("[BOOTSTRAP] Done")