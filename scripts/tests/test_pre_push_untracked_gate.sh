#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gallery-prepush-untracked-test.XXXXXX")" || exit 1
TEST_TOKEN="$$.$RANDOM$RANDOM"
SENTINEL_DIR="$ROOT/functions/.prepush-untracked-$TEST_TOKEN"
SENTINEL_DIR_OWNED=0
SENTINEL_NAME="functions/.prepush-untracked-$TEST_TOKEN/"$'\n'
SENTINEL_PATH="$ROOT/$SENTINEL_NAME"
EXPECTED_DIAGNOSTIC="$(printf '%q' "$SENTINEL_NAME")"
DISSERTATION_SENTINEL_DIR="$ROOT/dissertation/.prepush-untracked-$TEST_TOKEN"
DISSERTATION_SENTINEL_DIR_OWNED=0
DISSERTATION_SENTINEL_NAME="dissertation/.prepush-untracked-$TEST_TOKEN/consumed.js"
DISSERTATION_SENTINEL_PATH="$ROOT/$DISSERTATION_SENTINEL_NAME"
DISSERTATION_EXPECTED_DIAGNOSTIC="$(printf '%q' "$DISSERTATION_SENTINEL_NAME")"
FONT_SENTINEL_DIR="$ROOT/fonts/.prepush-untracked-$TEST_TOKEN"
FONT_SENTINEL_DIR_OWNED=0
FONT_SENTINEL_NAME="fonts/.prepush-untracked-$TEST_TOKEN/consumed.woff2"
FONT_SENTINEL_PATH="$ROOT/$FONT_SENTINEL_NAME"
FONT_EXPECTED_DIAGNOSTIC="$(printf '%q' "$FONT_SENTINEL_NAME")"
SAFE_SENTINEL_DIR="$ROOT/functions/.prepush-safe-$TEST_TOKEN"
SAFE_SENTINEL_DIR_OWNED=0
SAFE_EDITOR_PATH="$SAFE_SENTINEL_DIR/release-gate-local.js~"
SAFE_COVERAGE_DIR="$SAFE_SENTINEL_DIR/coverage"
SAFE_COVERAGE_PATH="$SAFE_COVERAGE_DIR/prepush-sentinel.js"
cleanup() {
  (( SENTINEL_DIR_OWNED == 1 )) && rm -rf -- "$SENTINEL_DIR"
  (( DISSERTATION_SENTINEL_DIR_OWNED == 1 )) \
    && rm -rf -- "$DISSERTATION_SENTINEL_DIR"
  (( FONT_SENTINEL_DIR_OWNED == 1 )) && rm -rf -- "$FONT_SENTINEL_DIR"
  (( SAFE_SENTINEL_DIR_OWNED == 1 )) && rm -rf -- "$SAFE_SENTINEL_DIR"
  [[ -d "$TEST_TMP_ROOT" ]] && rm -rf -- "$TEST_TMP_ROOT"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! mkdir "$SENTINEL_DIR"; then
  echo "pre-push untracked gate: FAIL (could not own LF sentinel directory)" >&2
  exit 1
fi
SENTINEL_DIR_OWNED=1
: > "$SENTINEL_PATH" || {
  echo "pre-push untracked gate: FAIL (could not create LF-only sentinel)" >&2
  exit 1
}

set +e
output="$(
  TMPDIR="$TEST_TMP_ROOT" \
    bash "$ROOT/scripts/hooks/pre-push" origin </dev/null 2>&1
)"
status=$?
set -e

rm -rf -- "$SENTINEL_DIR"
SENTINEL_DIR_OWNED=0

if (( status != 1 )); then
  echo "pre-push untracked gate: FAIL (status=$status, expected 1)" >&2
  exit 1
fi
if [[ "$output" != *"untracked or ignored files could influence release gates"* ]]; then
  echo "pre-push untracked gate: FAIL (LF-only filename was not diagnosed)" >&2
  exit 1
fi
if [[ "$output" != *"  - $EXPECTED_DIAGNOSTIC"* ]]; then
  echo "pre-push untracked gate: FAIL (LF-only filename was not preserved)" >&2
  exit 1
fi
if [[ -e "$SENTINEL_PATH" ]]; then
  echo "pre-push untracked gate: FAIL (sentinel cleanup failed)" >&2
  exit 1
fi

if ! mkdir "$DISSERTATION_SENTINEL_DIR"; then
  echo "pre-push untracked gate: FAIL (could not own dissertation sentinel directory)" >&2
  exit 1
fi
DISSERTATION_SENTINEL_DIR_OWNED=1
if ! mkdir "$FONT_SENTINEL_DIR"; then
  echo "pre-push untracked gate: FAIL (could not own font sentinel directory)" >&2
  exit 1
fi
FONT_SENTINEL_DIR_OWNED=1
: > "$DISSERTATION_SENTINEL_PATH"
: > "$FONT_SENTINEL_PATH"
set +e
dissertation_output="$(
  TMPDIR="$TEST_TMP_ROOT" \
    bash "$ROOT/scripts/hooks/pre-push" origin </dev/null 2>&1
)"
dissertation_status=$?
set -e
rm -rf -- "$DISSERTATION_SENTINEL_DIR" "$FONT_SENTINEL_DIR"
DISSERTATION_SENTINEL_DIR_OWNED=0
FONT_SENTINEL_DIR_OWNED=0
if (( dissertation_status != 1 )); then
  echo "pre-push untracked gate: FAIL (dissertation status=$dissertation_status, expected 1)" >&2
  exit 1
fi
if [[ "$dissertation_output" != *"  - $DISSERTATION_EXPECTED_DIAGNOSTIC"* ]]; then
  echo "pre-push untracked gate: FAIL (dissertation input was not diagnosed)" >&2
  exit 1
fi
if [[ "$dissertation_output" != *"  - $FONT_EXPECTED_DIAGNOSTIC"* ]]; then
  echo "pre-push untracked gate: FAIL (dissertation font input was not diagnosed)" >&2
  exit 1
fi

if ! mkdir "$SAFE_SENTINEL_DIR"; then
  echo "pre-push untracked gate: FAIL (could not own safe sentinel directory)" >&2
  exit 1
fi
SAFE_SENTINEL_DIR_OWNED=1
mkdir "$SAFE_COVERAGE_DIR"
: > "$SAFE_EDITOR_PATH"
: > "$SAFE_COVERAGE_PATH"
set +e
safe_output="$(
  TMPDIR="$TEST_TMP_ROOT" GALLERY_PREPUSH_TEST_UNTRACKED_SAFE_MARKER=1 \
    bash "$ROOT/scripts/hooks/pre-push" origin </dev/null 2>&1
)"
safe_status=$?
set -e
cleanup
trap - EXIT
if (( safe_status != 86 )); then
  echo "pre-push untracked gate: FAIL (safe status=$safe_status, expected 86)" >&2
  exit 1
fi
if [[ "$safe_output" != *"untracked-input safe marker reached"* ]]; then
  echo "pre-push untracked gate: FAIL (safe marker was not reached)" >&2
  exit 1
fi
if [[ "$safe_output" == *"untracked or ignored files could influence release gates"* ]]; then
  echo "pre-push untracked gate: FAIL (ordinary editor/coverage artefacts blocked)" >&2
  exit 1
fi

echo "pre-push untracked gate: PASS"
