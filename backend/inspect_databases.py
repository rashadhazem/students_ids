import sqlite3
import psycopg2

print("=== SQLite ===")
sconn = sqlite3.connect(r"d:\BUA\id site\dev\student_v2\dotnet_react\backend\bua_students.db")
scur = sconn.cursor()
scur.execute("SELECT name FROM sqlite_master WHERE type='table';")
sqlite_tables = [r[0] for r in scur.fetchall()]
print("Tables:", sqlite_tables)
for tbl in sqlite_tables:
    scur.execute(f"SELECT COUNT(*) FROM {tbl}")
    print(f"  {tbl}: {scur.fetchone()[0]} rows")
    scur.execute(f"PRAGMA table_info({tbl})")
    cols = [c[1] for c in scur.fetchall()]
    print(f"    cols: {cols}")

print("\n=== Postgres ===")
pconn = psycopg2.connect(host="localhost", port=5432, dbname="bua_db", user="bua_user", password="bua_password")
pcur = pconn.cursor()
pcur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
pg_tables = [r[0] for r in pcur.fetchall()]
print("Tables:", pg_tables)
for tbl in pg_tables:
    pcur.execute(f'SELECT COUNT(*) FROM "{tbl}"')
    print(f"  {tbl}: {pcur.fetchone()[0]} rows")
    pcur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{tbl}'")
    cols = [c[0] for c in pcur.fetchall()]
    print(f"    cols: {cols}")
