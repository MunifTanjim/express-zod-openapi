#!/usr/bin/env sh

set -eu

yarn run test

prev_version=$(npx -c 'echo $npm_package_version')
yarn version --no-git-tag-version "$@"
curr_version=$(npx -c 'echo $npm_package_version')

if [ "${curr_version}" = "${prev_version}" ]; then
  exit 1
fi

git add package.json
git commit -m "chore: release v$curr_version"
git tag "$curr_version" -m "v$curr_version"

git push
git push --tags
