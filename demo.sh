#!/bin/bash

echo "✨ Starting CareerAgent in Demo Mode..."
echo "Note: The backend is not required for Demo Mode."
echo "==================================================="

cd frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

VITE_DEMO_MODE=true VITE_BASE_URL="/" npm run dev
