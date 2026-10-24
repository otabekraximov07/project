#!/usr/bin/env bash
# HamrohNasiya Undiruv: fetch the latest code, rebuild and start. The data folder is kept.
set -e
cd "$(dirname "$0")"
git pull --ff-only
npm install
npm run build
echo "Yangilandi. Server: http://localhost:3000 (to'xtatish: Ctrl+C)"
npm start
