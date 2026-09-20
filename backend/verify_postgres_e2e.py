import urllib.request
import urllib.parse
import json
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def test_api():
    print("Testing backend health...")
    req = urllib.request.Request("http://localhost:5000/health")
    with urllib.request.urlopen(req) as resp:
        print("Health status:", resp.status, resp.read().decode())

    print("\nTesting SuperAdmin Login against PostgreSQL...")
    login_data = json.dumps({"username": "admin@bua.edu.eg", "password": "bua_password"}).encode()
    # If bua_password or Admin@123456
    for pw in ["Admin@123456", "bua_password", "admin123"]:
        try:
            req = urllib.request.Request(
                "http://localhost:5000/api/auth/login",
                data=json.dumps({"username": "admin@bua.edu.eg", "password": pw}).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                cookies = resp.headers.get("Set-Cookie", "")
                print(f"Login success with pw '{pw}'! Role: {data.get('user', {}).get('role')}")
                print(f"Cookie set: {'bua_access_token' in cookies}")
                token = data.get("token")
                break
        except urllib.error.HTTPError as e:
            print(f"PW '{pw}' failed: {e.code}")

    if not token:
        print("SuperAdmin login failed!")
        return

    print("\nTesting Students count via API (PostgreSQL)...")
    req = urllib.request.Request(
        "http://localhost:5000/api/students?page=1&pageSize=5",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"Total students returned from PostgreSQL: {data.get('total')}")
        print("First student sample:", data.get("data", [])[0] if data.get("data") else None)

    print("\nTesting Student Login with National ID against PostgreSQL...")
    # Find a student with national_id from Postgres
    import psycopg2
    pconn = psycopg2.connect(host="localhost", port=5432, dbname="bua_db", user="bua_user", password="bua_password")
    pcur = pconn.cursor()
    pcur.execute("SELECT student_id, national_id, full_name, college FROM students WHERE national_id IS NOT NULL AND LENGTH(national_id) = 14 LIMIT 1;")
    st = pcur.fetchone()
    print("Test student:", st)
    if st:
        sid, nid, name, college = st
        req = urllib.request.Request(
            "http://localhost:5000/api/auth/student-login",
            data=json.dumps({"email": f"{sid}@bua.edu.eg", "nationalId": nid}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            st_data = json.loads(resp.read().decode())
            st_cookies = resp.headers.get("Set-Cookie", "")
            print("Student login response:", st_data.get("success"), st_data.get("user", {}).get("fullName"))
            print(f"Student Cookie set: {'bua_access_token' in st_cookies}")
            st_token = st_data.get("token")

        print("\nTesting Student Card Retrieval (PostgreSQL)...")
        req = urllib.request.Request(
            f"http://localhost:5000/api/students/card/{sid}",
            headers={"Authorization": f"Bearer {st_token}"}
        )
        with urllib.request.urlopen(req) as resp:
            card_data = json.loads(resp.read().decode())
            print("Card data success:", card_data.get("success"), card_data.get("student", {}).get("fullName"))

    print("\nTesting Logout Endpoint (Cookie clearance)...")
    req = urllib.request.Request(
        "http://localhost:5000/api/auth/logout",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        logout_data = json.loads(resp.read().decode())
        logout_cookies = resp.headers.get("Set-Cookie", "")
        print("Logout response:", logout_data)
        print("Logout cookie cleared:", "bua_access_token=;" in logout_cookies or "expires=" in logout_cookies.lower())

if __name__ == "__main__":
    test_api()
