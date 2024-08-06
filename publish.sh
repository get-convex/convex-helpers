#! /bin/bash

set -e

rm -rf packages/convex-helpers/node_modules
npm i
npm run clean
npm run build
npm i
npm run lint
npm run test
git diff --exit-code || {
  echo "Uncommitted changes found. Commit or stash them before publishing."
  exit 1
}

pushd packages/convex-helpers >/dev/null
if [ "$1" == "alpha" ]; then
  npm version prerelease --preid alpha
else
  npm version patch
fi
current=$(npm pkg get version | tr -d '"')
popd >/dev/null

cat <<EOF
Test it:
  - Add some example usage to the outer convex-helpers repo.
  - Install from another project via \`npm link\`.
  - Run \`npm pack\` and install it elsewhere from the .tgz file.
EOF
echo "Latest versions:"
npm view convex-helpers@latest version
npm view convex-helpers@alpha version

read -r -p "Enter the new version number (hit enter for $current): " version

pushd packages/convex-helpers >/dev/null
if [ -n "$version" ]; then
  npm pkg set version="$version"
else
  version=$current
fi

cp package.json dist/

cd dist
npm publish --dry-run
popd >/dev/null
echo "^^^ DRY RUN ^^^"
read -r -p "Publish $version to npm? (y/n): " publish
if [ "$publish" = "y" ]; then
  npm i
  pushd packages/convex-helpers/dist >/dev/null
  if (echo "$version" | grep alpha >/dev/null); then
    npm publish --tag alpha
  else
    npm publish
  fi
  popd >/dev/null
  git add package.json package-lock.json packages/convex-helpers/package.json
  # If there's nothing to commit, continue
  git commit -m "npm $version" || true
  git tag "npm/$version"
  git push origin "npm/$version"
  git push
else
  echo "Aborted."
  git co package-lock.json packages/convex-helpers/package.json
fi
