#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true
if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  npm run dev >>/tmp/app-startup.log 2>&1 &
fi
# Telegram production is webhook-only on Vercel (https://barq-vid.vercel.app/api/telegram).
# Do not start the local poller — getUpdates fights the webhook.
exit 0
