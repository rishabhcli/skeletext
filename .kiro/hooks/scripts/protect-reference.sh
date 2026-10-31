#!/bin/sh
# Blocks write tools whose target path is the verified ETS reference.
# Only path-like JSON keys are inspected, so a write that merely mentions
# the file name in its content is not blocked. Exit code 2 blocks the tool.

input=$(cat)

if printf '%s' "$input" | grep -E -q '"(path|file_path|filePath|target_file|file)"[[:space:]]*:[[:space:]]*"[^"]*docs/ets300706-level1-reference\.md"'; then
  echo "BLOCKED: docs/ets300706-level1-reference.md is read-only. It is the verified source of truth for control codes." >&2
  exit 2
fi

exit 0
