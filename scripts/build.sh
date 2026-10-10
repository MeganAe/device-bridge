#!/usr/bin/env sh
set -eu

if ! command -v npm >/dev/null 2>&1; then
  echo "npm est requis pour construire Device Bridge." >&2
  exit 1
fi

PYTHON=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "Python 3.9+ est requis pour préparer les outils embarqués." >&2
  exit 1
fi

"$PYTHON" scripts/prepare_tools.py
npm ci
npm run build
printf '\nBuild terminé. Consultez src-tauri/target/release/bundle/.\n'
