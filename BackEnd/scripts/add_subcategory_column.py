import os
import sys

from BackEnd.Services.db_service import DatabaseService

dsn = os.getenv("MASTER_DB_DSN") or os.getenv("DATABASE_URL")
if not dsn:
    print("❌ MASTER_DB_DSN or DATABASE_URL is not set")
    sys.exit(1)

db = DatabaseService(dsn)

print("🔧 Adding subcategory column to company_1.coa table...\n")

try:
    db.execute_sql("""
        ALTER TABLE company_1.coa 
        ADD COLUMN IF NOT EXISTS subcategory TEXT NULL;
    """)
    print("✅ Column added successfully (or already exists)\n")

    rows = db.fetch_all("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'company_1'
          AND table_name   = 'coa'
          AND column_name  = 'subcategory'
        ORDER BY ordinal_position;
    """)

    if rows:
        print("✅ Verification: Column exists in database")
        for r in rows:
            print(f"   Column: {r.get('column_name')}, Type: {r.get('data_type')}")
    else:
        print("❌ Warning: Column verification failed")

except Exception as e:
    import traceback
    print(f"❌ Error: {e}")
    traceback.print_exc()
    sys.exit(1)

print("\nDone.")
