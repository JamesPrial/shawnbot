---
description: Enters plan mode for implementation planning
allowed-tools: Write, Read, Bash
argument-hint: <plan-file-path>
---

# Enter Plan Mode

Activates plan mode for structured implementation planning. Updates the plan state file to track the active plan and session.

## Implementation

```bash
#!/bin/bash

# Get plan file path from arguments
PLAN_FILE="$ARGUMENTS"

if [ -z "$PLAN_FILE" ]; then
  echo "ERROR: Plan file path required"
  echo "Usage: enter-plan-mode <plan-file-path>"
  exit 1
fi

# Generate session ID or use existing one (format: timestamp-based unique ID)
SESSION_ID="${SESSION_ID:-$(date +%s%N | md5sum | cut -c1-8)}"

# Get current timestamp in ISO8601 format
TIMESTAMP=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Create state directory if it doesn't exist
STATE_DIR="/home/user/shawnbot/.claude/plan-state"
mkdir -p "$STATE_DIR"

# Create or update state.json
cat > "$STATE_DIR/state.json" <<EOF
{
  "active": true,
  "planFile": "$PLAN_FILE",
  "createdAt": "$TIMESTAMP",
  "sessionId": "$SESSION_ID"
}
EOF

echo "Plan mode activated"
echo "  Plan file: $PLAN_FILE"
echo "  Session ID: $SESSION_ID"
echo "  Started at: $TIMESTAMP"
```

## Notes

- Works in conjunction with `exit-plan-mode.md` to manage the complete plan lifecycle
- Plan state is stored in `.claude/plan-state/state.json`
- Session ID is auto-generated if not provided
- Creates the plan-state directory if it doesn't exist
