---
description: Exits plan mode and signals user approval is needed
allowed-tools: Write, Read, Bash
---

# ExitPlanMode

This command is called at the end of Phase 1B when in plan mode. It exits plan mode, signals that the plan is complete, and instructs the user to review and approve before continuing.

## Execution

1. Read the current plan state from `.claude/plan-state/state.json`
2. Update the state to mark plan mode as inactive and record the completion timestamp
3. Output a clear message to the user

## Implementation

```bash
#!/bin/bash
set -e

PLAN_STATE_FILE="/home/user/shawnbot/.claude/plan-state/state.json"
PLAN_FILE="/home/user/shawnbot/.claude/plan-state/PLAN.md"

# Read current state
STATE=$(cat "$PLAN_STATE_FILE")

# Get current timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update state: set active to false and record completion time
UPDATED_STATE=$(echo "$STATE" | jq --arg ts "$TIMESTAMP" '.active = false | .completedAt = $ts')

# Write updated state back
echo "$UPDATED_STATE" > "$PLAN_STATE_FILE"

# Output user-facing message
cat << 'EOF'

================================================================================
                         PLAN MODE COMPLETE
================================================================================

The implementation plan has been synthesized and is ready for your review.

Plan Location: /home/user/shawnbot/.claude/plan-state/PLAN.md

NEXT STEPS:

1. Review the plan file carefully to ensure it aligns with your requirements
2. Once approved, resume implementation by running:

   npm run implement

   The orchestrator will automatically detect the approved plan and continue
   to Phase 2 (implementation).

If you need to make changes or start over:
- Edit the PLAN.md file directly
- Or delete the plan and re-run the command to regenerate

================================================================================

EOF
```

## Notes

- Plan mode exits only when the user explicitly approves by re-running the implement command
- The `active: false` flag prevents the orchestrator from entering plan mode again
- Completion timestamp is recorded for audit and workflow purposes
- The plan file itself is not deleted, allowing users to review it at any time
