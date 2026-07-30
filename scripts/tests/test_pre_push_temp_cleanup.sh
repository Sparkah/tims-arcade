#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gallery-prepush-cleanup-test.XXXXXX")" || exit 1
cleanup() {
  [[ -d "$TEST_TMP_ROOT" ]] && rm -rf -- "$TEST_TMP_ROOT"
}
trap cleanup EXIT

set +e
TMPDIR="$TEST_TMP_ROOT" GALLERY_PREPUSH_TEST_INTERRUPT_AFTER_TEMP=1 \
  bash "$ROOT/scripts/hooks/pre-push" origin </dev/null >/dev/null 2>&1
status=$?
set -e

if (( status != 143 )); then
  echo "pre-push temp cleanup: FAIL (interrupt status=$status, expected 143)" >&2
  exit 1
fi

leftovers=("$TEST_TMP_ROOT"/gallery-prepush.*)
if [[ -e "${leftovers[0]}" ]]; then
  echo "pre-push temp cleanup: FAIL (owned temp root survived TERM)" >&2
  printf '  - %s\n' "${leftovers[@]}" >&2
  exit 1
fi

echo "pre-push temp cleanup: PASS"
