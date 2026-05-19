import os
import requests

API_BASE = os.getenv("API_BASE", "https://finspheresolutions.com")
COMPANY_ID = int(os.getenv("COMPANY_ID", "16"))

EMAIL = os.getenv("FINSAGE_EMAIL")
PASSWORD = os.getenv("FINSAGE_PASSWORD")

if not EMAIL or not PASSWORD:
    raise RuntimeError("Set FINSAGE_EMAIL and FINSAGE_PASSWORD")

# Adjust this path if your login route differs
login_res = requests.post(
    f"{API_BASE}/api/auth/signin",
    json={"username": EMAIL, "password": PASSWORD},
    timeout=30,
)
login_res.raise_for_status()

token = (
    login_res.json().get("token")
    or login_res.json().get("access_token")
    or login_res.json().get("data", {}).get("token")
)

if not token:
    raise RuntimeError(f"No token returned from login: {login_res.text}")

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}

# 1. Find scooter asset
assets_res = requests.get(
    f"{API_BASE}/api/companies/{COMPANY_ID}/assets",
    headers=headers,
    params={"q": "TBR-SCOOTER-001"},
    timeout=30,
)
assets_res.raise_for_status()

assets = assets_res.json().get("data") or []
scooter = next(
    (a for a in assets if a.get("asset_code") == "TBR-SCOOTER-001"),
    None,
)

if not scooter:
    raise RuntimeError("TBR-SCOOTER-001 asset not found")

asset_id = int(scooter["id"])

# 2. Check/create disposal draft
ref = "DISP-TBR-SCOOTER-001-2024-10"

disp_res = requests.get(
    f"{API_BASE}/api/companies/{COMPANY_ID}/disposals",
    headers=headers,
    params={"asset_id": asset_id},
    timeout=30,
)
disp_res.raise_for_status()

existing = next(
    (d for d in (disp_res.json().get("data") or []) if d.get("reference") == ref),
    None,
)

if existing:
    disp_id = int(existing["id"])
    print(f"Using existing disposal draft disp_id={disp_id}")
else:
    create_res = requests.post(
        f"{API_BASE}/api/companies/{COMPANY_ID}/disposals",
        headers=headers,
        json={
            "asset_id": asset_id,
            "disposal_date": "2024-10-16",
            "proceeds": 4000.00,
            "reference": ref,
            "notes": "Scooter sold for cash in October 2024.",
            "status": "draft",
            "bank_account_code": "BS_CA_1010",
        },
        timeout=30,
    )
    create_res.raise_for_status()
    disp_id = int(create_res.json()["id"])
    print(f"Created disposal draft disp_id={disp_id}")

# 3. Post disposal using authenticated user/session
post_res = requests.post(
    f"{API_BASE}/api/companies/{COMPANY_ID}/disposals/{disp_id}/post",
    headers=headers,
    timeout=30,
)

print(post_res.status_code)
print(post_res.text)
post_res.raise_for_status()