#! /bin/bash

set -e

# Cuts a release of the convex-helpers package.
#
# This script does not publish anything. It verifies the tree, bumps the
# version, and pushes an `npm/<version>` tag. That tag triggers
# .github/workflows/release.yml, which builds and publishes to npm using npm
# trusted publishing (OIDC) -- no npm token lives on a laptop or in CI.
#
#   ./publish.sh          patch release -> published under `latest`
#   ./publish.sh alpha    prerelease    -> published under `alpha`
#
# The workflow derives the dist-tag from the version, so any preid works:
# 0.1.129-beta.0 publishes under `beta`.
#
# If the release workflow fails, nothing was published -- delete the tag, fix
# the problem, and release again:
#   git push --delete origin npm/<version> && git tag -d npm/<version>
#
# NOTE: make sure you aren't running `npm run dev` anywhere, to avoid races
# with regenerating files while building.

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes found. Commit or stash them before releasing."
  exit 1
fi

# Pre-flight: the same checks CI runs, so a broken release fails here rather
# than after the tag is already pushed.
rm -rf packages/convex-helpers/node_modules
npm run clean
npm ci
npm run build
npm run lint
npm run test

# Don't leave a half-applied version bump behind if anything below fails.
function cleanup() {
  git checkout -- :/packages/convex-helpers/package.json
}
trap cleanup EXIT

pushd packages/convex-helpers >/dev/null
if [ "$1" == "alpha" ]; then
  npm version prerelease --preid alpha
else
  npm version patch
fi
current=$(npm pkg get version | tr -d '"')
popd >/dev/null

echo "Currently published:"
npm view convex-helpers@latest version
npm view convex-helpers@alpha version

read -r -p "Enter the new version number (hit enter for $current): " version

pushd packages/convex-helpers >/dev/null
if [ -n "$version" ]; then
  npm pkg set version="$version"
else
  version=$current
fi
popd >/dev/null

git add packages/convex-helpers/package.json packages/convex-helpers/CHANGELOG.md
# If there's nothing to commit, continue
git commit -m "npm $version" || true
git tag "npm/$version"
git push origin HEAD
git push origin "npm/$version"

cat <<EOF

Pushed npm/$version. CI is building and publishing it:
  https://github.com/get-convex/convex-helpers/actions/workflows/release.yml
EOF
