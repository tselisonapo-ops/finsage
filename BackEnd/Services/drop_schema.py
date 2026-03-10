import psycopg2

conn = psycopg2.connect(
    dbname="ifrs_master",
    user="postgres",
    password="postgres",  # or your password
    host="localhost",
    port="5432"
)

cur = conn.cursor()
cur.execute("DROP SCHEMA IF EXISTS company_1 CASCADE;")
conn.commit()
cur.close()
conn.close()

print("✅ Schema company_1 dropped successfully!")
