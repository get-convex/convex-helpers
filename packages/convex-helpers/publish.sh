#! /bin/bash

set -e

npm i
npm run lint
npm run test
npm run clean
npm run build
pushd ../.. >/dev/null
npm i
pushd tests >/dev/null
npm i
npm run test
popd >/dev/null
popd >/dev/null
git diff --exit-code || {
  echo "Uncommitted changes found. Commit or stash them before publishing."
  exit 1
}

if [ "$1" == "alpha" ]; then
  npm version prerelease --preid alpha
fi

cat <<EOF
Test it:
  - Add some example usage to the outer convex-helpers repo.
  - Install from another project via \`npm link\`.
  - Run \`npm pack\` and install it elsewhere from the .tgz file.
EOF
echo "Latest versions:"
npm view convex-helpers@latest version
npm view convex-helpers@alpha version
current=$(npm pkg get version | tr -d '"')

read -r -p "Enter the new version number (hit enter for $current): " version

if [ -n "$version" ]; then
  npm pkg set version="$version"
  npm i
else
  version=$current
fi

npm publish --dry-run
echo "^^^ DRY RUN ^^^"
read -r -p "Publish $version to npm? (y/n): " publish
if [ "$publish" = "y" ]; then
  git add package.json package-lock.json

  pushd "../.." >/dev/null
  npm i
  git add package.json package-lock.json
  cd tests
  npm i
  git add package.json package-lock.json
  popd >/dev/null

  # If there's nothing to commit, continue
  git commit -m "npm $version" || true
  if (echo "$version" | grep alpha >/dev/null); then
    npm publish --tag alpha
  else
    npm publish
  fi
  git tag "npm/$version"
  git push
  git push origin "npm/$version"
fi
