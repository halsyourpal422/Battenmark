#!/bin/sh
# Battenmark golden-model smoke over HTTP using only curl + jq-free parsing.
# Starts its own server on :8791, creates the 80x50x12 box, validates, stops.
set -eu

PORT="${PORT:-8791}"
BASE="http://127.0.0.1:${PORT}"
TOKEN="${AGENTCAD_API_TOKEN:-secret-token}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

command -v curl >/dev/null || { echo "curl required"; exit 2; }
command -v python3 >/dev/null || { echo "python3 required"; exit 2; }

cd "$ROOT"
AGENTCAD_API_TOKEN="$TOKEN" npx agentcad serve --port "$PORT" >/tmp/battenmark-example-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

i=0
while [ "$i" -lt 40 ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/status" || true)
  [ "$code" = "200" ] && break
  i=$((i + 1))
  sleep 0.5
done
[ "$code" = "200" ] || { echo "server did not become ready"; tail -20 /tmp/battenmark-example-server.log; exit 1; }

PROJECT=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"cli-golden-box"}' "$BASE/api/v1/projects" | python3 -c 'import json,sys;print(json.load(sys.stdin)["project_id"])')

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"operation":"create_box","arguments":{"length_mm":80,"width_mm":50,"height_mm":12,"name":"Base"}}' \
  "$BASE/api/v1/projects/$PROJECT/operations" >/dev/null

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{}' "$BASE/api/v1/projects/$PROJECT/rebuild" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print("valid=%s volume_mm3=%s" % (d["valid"], d["volume_mm3"])); assert abs(d["volume_mm3"]-48000)<1'

echo "GOLDEN MODEL OK (HTTP transport)"
