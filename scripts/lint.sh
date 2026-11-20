#!/usr/bin/env sh
# Runs `bun lint` from the canary that .bun-canary-version pins, installing it
# on first use. The release in .bun-version has no linter yet; when one does,
# this script and the pin can go. Rules come from .oxlintrc.json.
#
# Usage: lint.sh [--fix] [files...]   no files: the whole project
set -eu

cd "$(dirname "$0")/.."
pin=$(tr -d '[:space:]' <.bun-canary-version)
canary="${BUN_INSTALL:-$HOME/.bun}/canary/$pin/bin/bun"
if [ ! -x "$canary" ]; then
  bun scripts/install-bun-canary.ts >&2
fi
exec "$canary" lint --no-script "$@"
