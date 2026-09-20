import sqlite3
import psycopg2
import sys

def migrate():
    print("Starting migration from SQLite (bua_students.db) to PostgreSQL (bua_db)...")
    
    # Connect to SQLite
    sconn = sqlite3.connect(r"d:\BUA\id site\dev\student_v2\dotnet_react\backend\bua_students.db")
    sconn.row_factory = sqlite3.Row
    scur = sconn.cursor()

    # Connect to PostgreSQL
    pconn = psycopg2.connect(
        host="localhost",
        port=5432,
        dbname="bua_db",
        user="bua_user",
        password="bua_password"
    )
    pcur = pconn.cursor()

    # 1. Prepare Schema in PostgreSQL matching EF Core Model
    print("1. Ensuring schema and columns in PostgreSQL...")

    # Drop existing tables if needed or recreate them clean so they match EF Core exactly
    pcur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student',
        college VARCHAR(100),
        student_id VARCHAR(30),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        verify_token VARCHAR(100),
        reset_token VARCHAR(100),
        reset_expires TIMESTAMP WITH TIME ZONE,
        last_login TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Ensure all user columns exist
    user_cols = [
        ("last_login", "TIMESTAMP WITH TIME ZONE"),
        ("is_active", "BOOLEAN NOT NULL DEFAULT TRUE"),
        ("email_verified", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("verify_token", "VARCHAR(100)"),
        ("reset_token", "VARCHAR(100)"),
        ("reset_expires", "TIMESTAMP WITH TIME ZONE")
    ]
    for col, col_type in user_cols:
        pcur.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {col_type};")

    pcur.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(30) NOT NULL UNIQUE,
        full_name VARCHAR(150) NOT NULL,
        year VARCHAR(10) NOT NULL,
        college VARCHAR(100) NOT NULL,
        section VARCHAR(100),
        national_id VARCHAR(30),
        mobile VARCHAR(30),
        email VARCHAR(150),
        image_path VARCHAR(255) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        registered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Ensure all student columns exist
    student_cols = [
        ("section", "VARCHAR(100)"),
        ("national_id", "VARCHAR(30)"),
        ("mobile", "VARCHAR(30)"),
        ("user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("registered_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL")
    ]
    for col, col_type in student_cols:
        pcur.execute(f"ALTER TABLE students ADD COLUMN IF NOT EXISTS {col} {col_type};")

    pcur.execute("""
    CREATE TABLE IF NOT EXISTS student_id_history (
        id SERIAL PRIMARY KEY,
        old_student_id VARCHAR(30) NOT NULL,
        new_student_id VARCHAR(30) NOT NULL,
        changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    """)

    # Check if student_id_history had old schema without id
    try:
        pcur.execute("ALTER TABLE student_id_history ADD COLUMN IF NOT EXISTS id SERIAL;")
        pcur.execute("ALTER TABLE student_id_history ADD COLUMN IF NOT EXISTS changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;")
        pcur.execute("ALTER TABLE student_id_history ADD COLUMN IF NOT EXISTS changed_by INTEGER;")
    except Exception as e:
        print(f"Note on student_id_history schema: {e}")
        pconn.rollback()

    pcur.execute("""
    CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        target VARCHAR(100),
        detail TEXT,
        ip VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Create necessary indexes
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_students_student_id ON students(student_id);")
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_students_national_id ON students(national_id);")
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_students_college ON students(college);")
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_students_year ON students(year);")
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);")
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_users_student_id ON users(student_id);")
    pcur.execute("CREATE INDEX IF NOT EXISTS ix_audit_log_created_at ON audit_log(created_at);")

    pconn.commit()

    # 2. Migrate Users
    print("2. Migrating Users...")
    scur.execute("SELECT * FROM users")
    sqlite_users = scur.fetchall()
    
    # We will upsert or insert SQLite users
    user_inserted = 0
    user_updated = 0
    for u in sqlite_users:
        pcur.execute("SELECT id FROM users WHERE email = %s", (u["email"],))
        existing = pcur.fetchone()
        if existing:
            pcur.execute("""
                UPDATE users SET 
                    password_hash = %s,
                    full_name = %s,
                    role = %s,
                    college = %s,
                    student_id = %s,
                    is_active = %s,
                    email_verified = %s
                WHERE email = %s
            """, (
                u["password_hash"], u["full_name"], u["role"], u["college"],
                u["student_id"], bool(u["is_active"]), bool(u["email_verified"]),
                u["email"]
            ))
            user_updated += 1
        else:
            pcur.execute("""
                INSERT INTO users (id, email, password_hash, full_name, role, college, student_id, is_active, email_verified, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
            """, (
                u["id"], u["email"], u["password_hash"], u["full_name"], u["role"],
                u["college"], u["student_id"], bool(u["is_active"]), bool(u["email_verified"]),
                u["created_at"]
            ))
            user_inserted += 1

    pconn.commit()
    print(f"Users migrated: {user_inserted} inserted, {user_updated} updated.")

    # Reset users sequence
    pcur.execute("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));")
    pconn.commit()

    # 3. Migrate Students
    print("3. Migrating Students (4,526 rows)...")
    scur.execute("SELECT * FROM students")
    sqlite_students = scur.fetchall()
    print(f"Found {len(sqlite_students)} students in SQLite.")

    # Clean existing test students in Postgres to avoid orphan duplicates
    pcur.execute("TRUNCATE TABLE students RESTART IDENTITY CASCADE;")
    pconn.commit()

    batch = []
    for s in sqlite_students:
        batch.append((
            s["id"], s["student_id"], s["full_name"], s["year"], s["college"],
            s["section"], s["national_id"], s["mobile"], s["email"],
            s["image_path"], s["user_id"], s["registered_by"],
            s["created_at"], s["updated_at"]
        ))
        if len(batch) >= 1000:
            psycopg2.extras.execute_values(
                pcur,
                """
                INSERT INTO students (id, student_id, full_name, year, college, section, national_id, mobile, email, image_path, user_id, registered_by, created_at, updated_at)
                VALUES %s
                """,
                batch
            )
            batch = []
    if batch:
        psycopg2.extras.execute_values(
            pcur,
            """
            INSERT INTO students (id, student_id, full_name, year, college, section, national_id, mobile, email, image_path, user_id, registered_by, created_at, updated_at)
            VALUES %s
            """,
            batch
        )

    pconn.commit()

    # Reset students sequence
    pcur.execute("SELECT setval('students_id_seq', (SELECT COALESCE(MAX(id), 1) FROM students));")
    pconn.commit()

    # Check student count
    pcur.execute("SELECT COUNT(*) FROM students;")
    pg_students_count = pcur.fetchone()[0]
    print(f"Postgres students count after migration: {pg_students_count}")

    # 4. Migrate Audit Logs
    print("4. Migrating Audit Logs...")
    try:
        scur.execute("SELECT * FROM audit_log")
        sqlite_audit = scur.fetchall()
        pcur.execute("SELECT id FROM users;")
        valid_user_ids = set(r[0] for r in pcur.fetchall())
        pcur.execute("TRUNCATE TABLE audit_log RESTART IDENTITY;")
        for a in sqlite_audit:
            uid = a["user_id"] if a["user_id"] in valid_user_ids else None
            pcur.execute("""
                INSERT INTO audit_log (id, user_id, action, target, detail, ip, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                a["id"], uid, a["action"], a["target"], a["detail"], a["ip"], a["created_at"]
            ))
        pcur.execute("SELECT setval('audit_log_id_seq', (SELECT COALESCE(MAX(id), 1) FROM audit_log));")
        pconn.commit()
        print(f"Audit logs migrated: {len(sqlite_audit)} rows.")
    except Exception as e:
        print(f"Note on audit_log migration: {e}")
        pconn.rollback()

    pconn.close()
    sconn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    import psycopg2.extras
    migrate()
