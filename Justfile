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

# (*) Run the open source convex backend on port 8000
run-local-backend *ARGS:
    cd $CONVEX_LOCAL_BACKEND; just run-local-backend $@

# Uses an admin key from admin_key.txt for dev backends.
# (*) Run convex CLI commands like `convex dev` against local backend from `just run-local-backend`.
convex *ARGS:
  npx convex "$@" --admin-key $(cat packages/convex-helpers/testing/admin_key.txt) --url "http://127.0.0.1:8000"

