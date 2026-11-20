#!/usr/bin/env bash
# Boots the production image and checks what the unit tests can't reach: the
# front end bundled with Tailwind at first request, and Chromium printing a
# report. Usage: image-smoke.sh <image>   (needs docker, curl, jq and bun)
set -euo pipefail

image=${1:?usage: image-smoke.sh <image>}
name="whiskerfile-smoke-$$"
work=$(mktemp -d)

finish() {
  status=$?
  if [ "$status" -ne 0 ]; then docker logs --tail 50 "$name" || true; fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap finish EXIT

# AUTH_MODE=dev signs every request in; the port is published on loopback only.
docker run -d --name "$name" -e AUTH_MODE=dev -p 127.0.0.1::3000 "$image" >/dev/null
base="http://$(docker port "$name" 3000)"

curl --retry 30 --retry-delay 1 --retry-all-errors -fsS -o /dev/null "$base/healthz"
echo "ok: the server answers /healthz"

curl -fsS -o "$work/index.html" "$base/"
css=$(grep -oE 'href="[^"]+\.css"' "$work/index.html" | head -n 1 | cut -d'"' -f2)
js=$(grep -oE 'src="[^"]+\.js"' "$work/index.html" | head -n 1 | cut -d'"' -f2)
curl -fsS -o "$work/app.css" "$base$css"
curl -fsS -o /dev/null "$base$js"
# A stylesheet bundled without the Tailwind plugin has no utility classes.
grep -q '\.flex{display:flex}' "$work/app.css"
echo "ok: the front end is bundled with Tailwind"

bun scripts/seed-dev.ts "$base" >/dev/null
pet=$(curl -fsS "$base/api/pets" | jq -r '.[0].id')
curl -fsS -o "$work/report.pdf" "$base/api/pets/$pet/report.pdf?today=$(date +%F)&weightUnit=lb"
[ "$(head -c 5 "$work/report.pdf")" = "%PDF-" ]
echo "ok: Chromium prints a report"
