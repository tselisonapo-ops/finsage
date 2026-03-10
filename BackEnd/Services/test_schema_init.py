import os
from BackEnd.Services.db_service import DatabaseService

def test_schema_initialization():
    try:
        # Get DSN from environment variable
        dsn = os.getenv('MASTER_DB_DSN')
        if not dsn:
            raise RuntimeError("MASTER_DB_DSN environment variable not set")
        
        print(f"Connecting to: {dsn[:50]}...")
        db = DatabaseService(dsn)
        
        print("Testing schema initialization for company 1...")
        db.initialize_company_schema(1)
        
        print("✅ Schema initialized successfully!")
        
        # Verify tables exist
        tables = db.fetch_all('''
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'company_1'
            ORDER BY table_name
        ''')
        
        print(f"\n📊 Tables created: {len(tables)}")
        if tables and isinstance(tables, list) and len(tables) > 0:
            # Check if it's a list of tuples or dicts
            if isinstance(tables[0], (tuple, list)):
                for row in tables:
                    print(f"  - {row[0]}")
            else:
                for row in tables:
                    print(f"  - {row}")
        
        # Verify COA has subcategory
        coa_cols = db.fetch_all('''
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_schema = 'company_1' 
            AND table_name = 'coa'
            ORDER BY ordinal_position
        ''')
        
        print(f"\n📋 COA columns: {len(coa_cols) if coa_cols else 0}")
        
        # Handle different return types
        column_names = []
        if coa_cols and isinstance(coa_cols, list) and len(coa_cols) > 0:
            if isinstance(coa_cols[0], (tuple, list)):
                for col_name, col_type in coa_cols:
                    print(f"  - {col_name}: {col_type}")
                    column_names.append(col_name)
            elif isinstance(coa_cols[0], dict):
                for col_info in coa_cols:
                    col_name = col_info.get('column_name')
                    col_type = col_info.get('data_type')
                    print(f"  - {col_name}: {col_type}")
                    column_names.append(col_name)
        
        # Check for subcategory specifically
        has_subcategory = 'subcategory' in column_names
        if has_subcategory:
            print("\n✅ subcategory column EXISTS!")
            return True
        else:
            print("\n❌ subcategory column MISSING!")
            return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_schema_initialization()
    exit(0 if success else 1)
