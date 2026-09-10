#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
npm install
npm test
npm run build
printf '\nAll local verification steps completed successfully.\n'
