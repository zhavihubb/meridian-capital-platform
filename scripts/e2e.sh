#!/usr/bin/env bash
# End-to-end API test against the local wrangler pages dev server.
set -u
cd /workspace/eurofiducia-uk
OUT=/tmp/e2e_out.txt
: > "$OUT"

pkill -f wrangler 2>/dev/null; pkill -f workerd 2>/dev/null; sleep 2
npx wrangler pages dev dist --d1=DB --persist-to=.wrangler/state --port 8788 > /tmp/wrangler.log 2>&1 &
WPID=$!

for i in $(seq 1 40); do
  if curl -s http://localhost:8788/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done

B=http://localhost:8788
jq_tok() { node -pe "JSON.parse(require('fs').readFileSync(0)).token" 2>/dev/null; }

UT=$(curl -s -X POST $B/api/login -H 'Content-Type: application/json' -d '{"email":"test@example.com","password":"secret123"}' | jq_tok)
AT=$(curl -s -X POST $B/api/login -H 'Content-Type: application/json' -d '{"email":"admin@meridianncapital.com","password":"admin123"}' | jq_tok)

{
echo "=== approve deposit id=2 ==="; curl -s -X POST $B/api/admin/transactions/2/approve -H "Authorization: Bearer $AT"
echo; echo "=== decline withdrawal id=3 ==="; curl -s -X POST $B/api/admin/transactions/3/decline -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"reason":"Payout details could not be verified"}'
echo; echo "=== reverse bonus id=1 ==="; curl -s -X POST $B/api/admin/transactions/1/reverse -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"reason":"Duplicate account investigation"}'
echo; echo "=== admin create profit ==="; curl -s -X POST $B/api/admin/transactions -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"user_id":2,"type":"profit","amount":25,"note":"Q1 portfolio yield"}'
echo; echo "=== cancel pending deposit ==="
curl -s -X POST $B/api/deposits -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"amount":10,"method":"ETH"}' >/dev/null
NEWID=$(curl -s $B/api/transactions -H "Authorization: Bearer $UT" | node -pe "JSON.parse(require('fs').readFileSync(0)).transactions.find(t=>t.status==='pending'&&t.type==='deposit').id")
echo "cancelling id=$NEWID"; curl -s -X POST $B/api/transactions/$NEWID/cancel -H "Authorization: Bearer $UT"
echo; echo "=== admin loans ==="; curl -s $B/api/admin/loans -H "Authorization: Bearer $AT" | head -c 200
echo; echo "=== approve loan id=1 ==="; curl -s -X POST $B/api/admin/loans/1/approve -H "Authorization: Bearer $AT"
echo; echo "=== admin users ==="; curl -s $B/api/admin/users -H "Authorization: Bearer $AT" | head -c 200
echo; echo "=== admin chats ==="; curl -s $B/api/admin/chats -H "Authorization: Bearer $AT" | head -c 200
echo; echo "=== admin alerts ==="; curl -s $B/api/admin/alerts -H "Authorization: Bearer $AT" | head -c 150
echo; echo "=== admin outbox ==="; curl -s $B/api/admin/outbox -H "Authorization: Bearer $AT" | head -c 150
echo; echo "=== admin backup ==="; curl -s $B/api/admin/backup -H "Authorization: Bearer $AT" | head -c 120
echo; echo "=== notifications ==="; curl -s $B/api/notifications -H "Authorization: Bearer $UT" | head -c 150
echo; echo "=== broadcasts ==="; curl -s $B/api/broadcasts -H "Authorization: Bearer $UT" | head -c 150
echo; echo "=== rules ==="; curl -s $B/api/rules | head -c 100
echo; echo "=== leads ==="; curl -s -X POST $B/api/leads -H 'Content-Type: application/json' -d '{"name":"Jane","email":"jane@x.com","interest":"Portfolios","message":"Interested"}'
echo; echo "=== forgot-password ==="; curl -s -X POST $B/api/forgot-password -H 'Content-Type: application/json' -d '{"email":"test@example.com"}'
echo; echo "=== change-password ==="; curl -s -X POST $B/api/change-password -H "Authorization: Bearer $UT" -H 'Content-Type: application/json' -d '{"current":"secret123","next":"secret456"}'
echo; echo "=== admin wallets add ==="; curl -s -X POST $B/api/admin/wallets -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"network":"Litecoin","currency":"LTC","address":"ltc1qtest"}'
echo; echo "=== admin settings GET ==="; curl -s $B/api/admin/settings -H "Authorization: Bearer $AT" | head -c 200
echo; echo "=== admin rules send ==="; curl -s -X POST $B/api/admin/rules/send -H "Authorization: Bearer $AT"
echo; echo "=== DONE ==="
} >> "$OUT" 2>&1

kill $WPID 2>/dev/null; pkill -f workerd 2>/dev/null
echo "E2E_COMPLETE" >> "$OUT"
