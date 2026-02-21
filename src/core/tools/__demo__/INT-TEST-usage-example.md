# Using select_active_intent with INT-TEST

This document demonstrates how to use the `select_active_intent` tool with the `INT-TEST` intent.

## Intent Definition

The INT-TEST intent is defined in `.orchestration/active_intents.yaml`:

```yaml
intents:
    - id: INT-TEST
      name: Intent test
      description: test scope enforcement
      status: IN_PROGRESS
      ownedScope:
          - src/hooks/**
      constraints: []
      acceptanceCriteria: []
```

## Usage Example

```typescript
import { selectActiveIntent } from "../select_active_intent"

// Create a session object to hold the active intent
const session = {
	activeIntent: null,
}

// Select the INT-TEST intent
const result = await selectActiveIntent("INT-TEST", session)

if (result.success) {
	console.log("Intent selected successfully!")

	// Access intent details
	console.log("ID:", result.intent.id) // "INT-TEST"
	console.log("Name:", result.intent.name) // "Intent test"
	console.log("Description:", result.intent.description) // "test scope enforcement"
	console.log("Status:", result.intent.status) // "IN_PROGRESS"
	console.log("Scope:", result.intent.ownedScope) // ["src/hooks/**"]

	// Session is now updated with active intent
	console.log("Active Intent:", session.activeIntent)
	// {
	//   id: "INT-TEST",
	//   name: "Intent test",
	//   scope: ["src/hooks/**"],
	//   constraints: []
	// }

	// Context block is injected into agent's context
	console.log(result.context)
	// Returns formatted XML context for the AI agent
}
```

## What Happens When You Call select_active_intent("INT-TEST")

1. **Reads the intent file**: `.orchestration/active_intents.yaml`
2. **Finds the matching intent**: Locates the intent with `id: "INT-TEST"`
3. **Validates the intent**: Checks that it's not already COMPLETED
4. **Updates the session**: Sets `session.activeIntent` with the intent details
5. **Returns context**: Provides a formatted context block for the AI agent

## The Returned Context Block

The context block is injected into the AI agent's system prompt:

```xml
<active_intent_context id="INT-TEST">
  <name>Intent test</name>
  <status>IN_PROGRESS</status>

  <description>test scope enforcement</description>

  <scope>
    <pattern>src/hooks/**</pattern>
  </scope>

  <constraints>
  </constraints>

  <acceptance_criteria>
  </acceptance_criteria>

  <instructions>
You are now working on intent INT-TEST.
- You may ONLY modify files that match the scope patterns above
- You MUST follow all constraints listed above
- You are DONE when all acceptance criteria are met
- All changes will be logged with this intent ID
  </instructions>
</active_intent_context>
```

## Scope Enforcement

The INT-TEST intent restricts file modifications to `src/hooks/**`:

### Files IN SCOPE (allowed):

- ✓ `src/hooks/types.ts`
- ✓ `src/hooks/IntentManager.ts`
- ✓ `src/hooks/HookEngine.ts`
- ✓ `src/hooks/OrchestrationStorage.ts`
- ✓ `src/hooks/PreToolHook.ts`
- ✓ `src/hooks/ScopeValidator.ts`
- ✓ `src/hooks/subfolder/anything.ts`

### Files OUT OF SCOPE (denied):

- ✗ `src/core/tools/select_active_intent.ts`
- ✗ `src/extension.ts`
- ✗ `README.md`
- ✗ `package.json`

## Testing

Run the comprehensive test suite:

```bash
cd src && npx vitest run core/tools/__tests__/select_active_intent.test.ts
```

The tests demonstrate:

1. ✓ Successfully selecting the INT-TEST intent
2. ✓ Verifying scope patterns are set correctly
3. ✓ Handling errors for non-existent intents

## Error Handling

### Intent Not Found

```typescript
const result = await selectActiveIntent("INT-NONEXISTENT", session)
// result.success === false
// result.error === "Intent INT-NONEXISTENT not found"
// result.recovery === "Available intents: INT-TEST. Please select one of these."
```

### Intent Already Completed

If an intent has `status: COMPLETED`, it cannot be selected again.

### Missing Intent File

If `.orchestration/active_intents.yaml` doesn't exist, an error is returned with recovery instructions.
