#!/bin/sh
# Runs the full test suite when the agent finishes a turn. If tests fail, emits
# a continue decision so the agent keeps working. A counter stops the loop after
# three consecutive failures so a broken suite cannot burn credits forever.

mkdir -p .cache
count_file=.cache/stop-hook-failures
npm test --silent >.cache/stop-hook-last.log 2>&1
status=$?

if [ "$status" -eq 0 ]; then
  rm -f "$count_file"
  exit 0
fi

count=$(cat "$count_file" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$count_file"

if [ "$count" -le 3 ]; then
  printf '{"decision":"block","reason":"Tests failed (attempt %s of 3). See .cache/stop-hook-last.log and fix the failing tests before finishing."}\n' "$count"
fi
exit 0
