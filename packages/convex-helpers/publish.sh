#! /bin/sh

set -e

echo "Current version:"
grep '"version":' package.json || {
  echo "No version number found in package.json"
  exit 1
}
read -p "Enter the new version number: " version

sed -i '' "s/\"version\": \".*\"/\"version\": \"$version\"/g" package.json

npm run clean;
npm run build;

echo <<EOF
Test it:
  - Add some example usage to the outer convex-helpers repo.
  - Install from another project via \`npm link\`.
  - Run \`npm pack\` and install it elsewhere from the .tgz file.
EOF
read -p "Hit enter when ready"
npm publish --dry-run
read -p "Publish to npm? (y/n): " publish
if [ "$publish" = "y"  ]; then
  git add package.json
  # If there's nothing to commit, continue
  git commit -m "npm $version" || true
  npm publish
  git tag npm/$version
  git push --tags
fi
