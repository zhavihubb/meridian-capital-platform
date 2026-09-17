#!/usr/bin/env bash
set -u
cd /workspace/eurofiducia-uk
OUT=/tmp/e2e2_out.txt
: > "$OUT"
pkill -f wrangler 2>/dev/null; pkill -f workerd 2>/dev/null; sleep 2
npx wrangler pages dev dist --d1=DB --persist-to=.wrangler/state --port 8788 > /tmp/wrangler.log 2>&1 &
WPID=$!
for i in $(seq 1 40); do curl -s http://localhost:8788/api/health >/dev/null 2>&1 && break; sleep 1; done
B=http://localhost:8788
AT=$(curl -s -X POST $B/api/login -H 'Content-Type: application/json' -d '{"email":"admin@meridianncapital.com","password":"admin123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
{
echo "=== rules/send ==="; curl -s -X POST $B/api/admin/rules/send -H "Authorization: Bearer $AT"
echo; echo "=== static index.html (HTTP status + title) ==="; curl -s -o /tmp/idx.html -w "status=%{http_code} bytes=%{size_download}\n" $B/
grep -o "<title>[^<]*</title>" /tmp/idx.html | head -1
echo "=== static login.html ==="; curl -s -o /dev/null -w "status=%{http_code}\n" $B/login.html
echo "=== static admin dashboard ==="; curl -s -o /dev/null -w "status=%{http_code}\n" $B/admin/dashboard.html
echo "=== static css ==="; curl -s -o /dev/null -w "status=%{http_code}\n" $B/assets/css/style.css
echo "=== static js api ==="; curl -s -o /dev/null -w "status=%{http_code}\n" $B/assets/js/api.js
echo "=== 404 api ==="; curl -s -o /dev/null -w "status=%{http_code}\n" $B/api/nonexistent
echo "=== DONE ==="
} >> "$OUT" 2>&1
kill $WPID 2>/dev/null; pkill -f workerd 2>/dev/null
echo "E2E2_COMPLETE" >> "$OUT"
