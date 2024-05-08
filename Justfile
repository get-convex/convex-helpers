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
  if [ ! -x ./convex-local-backend ]; then
    if [ "$(uname)" == "Darwin" ]; then
      if [ "$(uname -m)" == "arm64" ]; then
        pkg=convex-local-backend-aarch64-apple-darwin.zip
      elif [ "$(uname -m)" == "x86_64" ]; then
        pkg=convex-local-backend-x86_64-apple-darwin.zip
      fi
    elif [ "$(uname -m)" == "x86_64" ]; then
      pkg=convex-local-backend-x86_64-unknown-linux-gnu.zip
    fi
    if [ -z "$pkg" ]; then
      echo "Download or build the convex-local-backend: https://github.com/get-convex/convex-backend"
      exit 1
    fi
    curl  -L -O "https://github.com/get-convex/convex-backend/releases/latest/download/$pkg"
    unzip "$pkg"
  fi
  ./convex-local-backend

# Taken from https://github.com/get-convex/convex-backend/blob/main/Justfile
# (*) Run convex CLI commands like `convex dev` against local backend from `just run-local-backend`.
# This uses the default admin key for local backends, which is safe as long as the backend is
# running locally.
convex *ARGS:
  npx convex "$@" --admin-key 0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd --url "http://127.0.0.1:3210"

