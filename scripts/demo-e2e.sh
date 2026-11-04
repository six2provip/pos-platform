#!/usr/bin/env bash
set -euo pipefail

BUSINESS_URL="${BUSINESS_URL:-http://127.0.0.1:18000}"
CONTROL_URL="${CONTROL_URL:-http://127.0.0.1:18001}"

echo "=================================================================="
echo "1. KIỂM TRA HEALTH CHECK (Business API: $BUSINESS_URL | Control Plane: $CONTROL_URL)"
echo "=================================================================="
curl -fsS "$BUSINESS_URL/health/live" | python3 -m json.tool
curl -fsS "$CONTROL_URL/health/live" | python3 -m json.tool

echo ""
echo "=================================================================="
echo "2. KHỞI TẠO ORGANIZATION 'DEMO' & CỬA HÀNG 'DEMO-S1' (NẾU CHƯA CÓ)"
echo "=================================================================="
curl -sS -X POST "$BUSINESS_URL/api/v1/organization/provision" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "DEMO",
    "name": "Demo Coffee & Retail VN",
    "admin_email": "admin@demo.vn",
    "admin_password": "Admin@123456",
    "admin_display_name": "Demo Owner",
    "initial_store_code": "DEMO-S1",
    "initial_store_name": "Demo Flagship Store Q1"
  }' | python3 -m json.tool || true

echo ""
echo "=================================================================="
echo "3. ĐĂNG NHẬP OWNER ('admin@demo.vn' / 'Admin@123456')"
echo "=================================================================="
LOGIN_RESP=$(curl -fsS -X POST "$BUSINESS_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_code": "DEMO",
    "identifier": "admin@demo.vn",
    "password": "Admin@123456"
  }')
echo "$LOGIN_RESP" | python3 -m json.tool

ACCESS_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['access_token'])")
STORE_ID=$(echo "$LOGIN_RESP" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['available_stores'][0]['id'])")

echo ""
echo "=================================================================="
echo "4. KIỂM TRA SYSTEM CAPABILITIES & DANH SÁCH PHƯƠNG THỨC THANH TOÁN"
echo "=================================================================="
curl -fsS "$BUSINESS_URL/api/v1/system/capabilities" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | python3 -m json.tool

echo ""
echo "=================================================================="
echo "5. ĐĂNG NHẬP SUPER-ADMIN TRÊN CLOUD CONTROL PLANE ($CONTROL_URL)"
echo "=================================================================="
CP_LOGIN=$(curl -fsS -X POST "$CONTROL_URL/control/admin/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@pos-platform.local",
    "password": "SuperAdmin@123456"
  }')
echo "$CP_LOGIN" | python3 -m json.tool

