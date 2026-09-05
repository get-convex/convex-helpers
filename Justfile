set fallback := true
set shell := ["bash", "-uc"]
set windows-shell := ["sh", "-uc"]

# `just --list` (or just `just`) will print all the recipes in
# the current Justfile. `just RECIPE` will run the macro/job.
#
# In several places there are recipes for running common scripts or commands.
# Instead of `Makefile`s, Convex uses Justfiles, which are similar, but avoid
# several footguns associated with Makefiles, since using make as a macro runner
# can sometimes conflict with Makefiles desire to have some rudimentary
# understanding of build artifacts and associated dependencies.
#
# Read up on just here: https://github.com/casey/just

_default:
  @just --list

set positional-arguments

reset-local-backend:
  rm -rf convex_local_storage && rm -f convex_local_backend.sqlite3

# (*) Run the open source convex backend, downloading first if necessary.
run-local-backend:
  #!/usr/bin/env sh
  set -eu
  if [ ! -x ./convex-local-backend ]; then
    case "$(uname -s)-$(uname -m)" in
      Darwin-arm64)
        pkg=convex-local-backend-aarch64-apple-darwin.zip
        ;;
      Darwin-x86_64)
        pkg=convex-local-backend-x86_64-apple-darwin.zip
        ;;
      Linux-aarch64|Linux-arm64)
        pkg=convex-local-backend-aarch64-unknown-linux-gnu.zip
        ;;
      Linux-x86_64)
        pkg=convex-local-backend-x86_64-unknown-linux-gnu.zip
        ;;
      *)
        echo "Download or build the convex-local-backend: https://github.com/get-convex/convex-backend" >&2
        exit 1
        ;;
    esac
    curl -fL -O "https://github.com/get-convex/convex-backend/releases/latest/download/$pkg"
    unzip -o "$pkg"
  fi
  # Public development credentials matching the admin key in `just convex` and convex.sh.
  # https://github.com/get-convex/convex-backend/tree/main/crates/keybroker/dev
  exec ./convex-local-backend \
    --interface 127.0.0.1 \
    --instance-name carnitas \
    --instance-secret 4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974

# (*) Run convex CLI commands like `convex dev` against local backend from `just run-local-backend`.
# This uses the public development admin key matching the credentials in `just run-local-backend`.
convex *ARGS:
  npx convex "$@" --admin-key 0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd --url "http://127.0.0.1:3210"

# Clears a table in the cloud backend.
clear-table *ARGS:
  npx convex import --table "$1" --replace --format jsonLines /dev/null "${@:2}"
