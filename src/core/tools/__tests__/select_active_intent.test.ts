import { describe, it, expect, beforeEach, vi } from "vitest"
import * as path from "path"
import * as fsPromises from "fs/promises"

vi.mock("fs/promises", () => ({
	default: {
		access: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue(`intents:
  - id: "INT-TEST"
    name: "Intent test"
    description: "test scope enforcement"
    status: "IN_PROGRESS"
    ownedScope:
      - "src/hooks/**"
    constraints: []
    acceptanceCriteria: []
`),
	},
	access: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockResolvedValue(`intents:
  - id: "INT-TEST"
    name: "Intent test"
    description: "test scope enforcement"
    status: "IN_PROGRESS"
    ownedScope:
      - "src/hooks/**"
    constraints: []
    acceptanceCriteria: []
`),
}))

// Mock vscode module - must be before imports that use vscode
vi.mock("vscode", () => {
	const path = require("path")
	// When running from src/, go up one level to get the workspace root
	const workspaceRoot = path.resolve(process.cwd(), "..")

	return {
		workspace: {
			workspaceFolders: [
				{
					uri: {
						fsPath: workspaceRoot,
					},
				},
			],
		},
	}
})

import { selectActiveIntent, isFileInIntentScope } from "../select_active_intent"

describe("select_active_intent with INT-TEST", () => {
	let session: any

	beforeEach(() => {
		session = {
			activeIntent: null,
		}
	})

	it("should successfully select the INT-TEST intent", async () => {
		// Call the function with INT-TEST
		const result = await selectActiveIntent("INT-TEST", session)

		// Verify the result
		expect(result.success).toBe(true)
		expect(result.error).toBeUndefined()

		// Verify intent details
		expect(result.intent).toBeDefined()
		expect(result.intent?.id).toBe("INT-TEST")
		expect(result.intent?.name).toBe("Intent test")
		expect(result.intent?.description).toBe("test scope enforcement")
		expect(result.intent?.status).toBe("IN_PROGRESS")
		expect(result.intent?.ownedScope).toEqual(["src/hooks/**"])
		expect(result.intent?.constraints).toEqual([])
		expect(result.intent?.acceptanceCriteria).toEqual([])

		// Verify session was updated
		expect(session.activeIntent).toBeDefined()
		expect(session.activeIntent.id).toBe("INT-TEST")
		expect(session.activeIntent.name).toBe("Intent test")
		expect(session.activeIntent.scope).toEqual(["src/hooks/**"])
		expect(session.activeIntent.constraints).toEqual([])

		// Verify context block
		expect(result.context).toBeDefined()
		expect(result.context).toContain('<active_intent_context id="INT-TEST">')
		expect(result.context).toContain("<name>Intent test</name>")
		expect(result.context).toContain("<status>IN_PROGRESS</status>")
		expect(result.context).toContain("<pattern>src/hooks/**</pattern>")
		expect(result.context).toContain("You are now working on intent INT-TEST")

		// Log the full result for demonstration
		console.log("\n=== INT-TEST Selection Success ===\n")
		console.log("Intent ID:", result.intent?.id)
		console.log("Intent Name:", result.intent?.name)
		console.log("Description:", result.intent?.description)
		console.log("Status:", result.intent?.status)
		console.log("Owned Scope:", result.intent?.ownedScope)
		console.log("\nSession State:")
		console.log("  Active Intent ID:", session.activeIntent?.id)
		console.log("  Allowed Scope:", session.activeIntent?.scope)
		console.log("\nContext Block:")
		console.log(result.context)
	})

	it("should show the scope pattern for INT-TEST intent", async () => {
		// First select the intent
		const result = await selectActiveIntent("INT-TEST", session)
		expect(result.success).toBe(true)

		console.log("\n=== Scope Information for INT-TEST ===\n")
		console.log("Intent Scope Pattern:", session.activeIntent.scope)
		console.log("\nThe scope 'src/hooks/**' means:")
		console.log("  ✓ Files IN SCOPE: src/hooks/types.ts, src/hooks/IntentManager.ts, etc.")
		console.log("  ✗ Files OUT OF SCOPE: src/core/..., src/extension.ts, README.md, etc.")
		console.log("\nThis pattern uses glob matching where:")
		console.log("  - '**' matches any directory depth")
		console.log("  - '*' matches any characters within a path segment")

		// Verify scope is correctly set
		expect(session.activeIntent.scope).toEqual(["src/hooks/**"])
	})

	it("should fail when selecting a non-existent intent", async () => {
		const result = await selectActiveIntent("INT-NONEXISTENT", session)

		expect(result.success).toBe(false)
		expect(result.error).toContain("Intent INT-NONEXISTENT not found")
		expect(result.recovery).toContain("Available intents: INT-TEST")
	})

	it("should parse active_intents root with snake_case fields", async () => {
		vi.mocked(fsPromises.readFile).mockResolvedValueOnce(`active_intents:
  - id: "INT-SNAKE"
    name: "Snake format"
    status: "IN_PROGRESS"
    owned_scope:
      - "src/auth/**"
    constraints:
      - type: "TECHNICAL"
        rule: "No external auth provider"
    acceptance_criteria:
      - "Auth tests pass"
`)

		const result = await selectActiveIntent("INT-SNAKE", session)

		expect(result.success).toBe(true)
		expect(result.intent?.ownedScope).toEqual(["src/auth/**"])
		expect(result.intent?.constraints).toEqual(["No external auth provider"])
		expect(result.intent?.acceptanceCriteria).toEqual(["Auth tests pass"])
	})
})
