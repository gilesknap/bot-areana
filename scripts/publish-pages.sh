#!/usr/bin/env bash
# Publish a built dist/ into one folder of the gh-pages branch, keeping every other folder, and
# regenerate the root switcher.json / index.html. Run from a checkout whose `origin` can be pushed
# (CI: actions/checkout's credentials). Retries from a fresh fetch if another deploy pushed first.
# Usage: scripts/publish-pages.sh <folder> <dist-dir> [site-url]
set -euo pipefail

folder=$1
dist=$(realpath "$2")
site_url=${3:-}
scripts=$(realpath "$(dirname "$0")")

if [[ ! $folder =~ ^[A-Za-z0-9._-]+$ || $folder == . || $folder == .. ]]; then
  echo "publish-pages: bad folder name '$folder'" >&2
  exit 1
fi

site=$(mktemp -d)/site
for attempt in 1 2 3 4 5; do
  git worktree remove --force "$site" 2>/dev/null || true
  if git fetch --depth 1 origin gh-pages; then
    git worktree add --detach "$site" FETCH_HEAD
  else
    # First deploy: start an empty orphan branch.
    git worktree add --detach "$site"
    git -C "$site" checkout --orphan "gh-pages-new-$attempt"
    git -C "$site" rm -rfq --ignore-unmatch .
  fi

  rm -rf "${site:?}/$folder"
  cp -r "$dist" "$site/$folder"
  node "$scripts/pages-index.mjs" "$site" "$site_url"

  git -C "$site" add -A
  if git -C "$site" diff --cached --quiet; then
    echo "publish-pages: nothing changed"
    exit 0
  fi
  git -C "$site" -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -q -m "Publish $folder${SOURCE_SHA:+ from $SOURCE_SHA}"
  if git -C "$site" push origin HEAD:refs/heads/gh-pages; then
    echo "publish-pages: published $folder"
    exit 0
  fi
  echo "publish-pages: push rejected (attempt $attempt), retrying from a fresh fetch" >&2
  sleep $((attempt * 5))
done
echo "publish-pages: gave up after 5 attempts" >&2
exit 1
