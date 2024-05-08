#! /bin/sh
set -e

if grep -q -E '^\s*VITE_CONVEX_URL\s*=\s*https://.*\.convex\.cloud' .env.local; then
    npx convex "$@"
else
    npx convex "$@" --admin-key 0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd --url "http://127.0.0.1:3210"
fi
