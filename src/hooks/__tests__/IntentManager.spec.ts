import { describe, it, expect } from "vitest"

import { IntentManager } from "../IntentManager"
import type { OrchestrationStorage } from "../OrchestrationStorage"

describe("IntentManager", () => {
	it("loads intents from active_intents root with snake_case fields", async () => {
		const storage = {
			fileExists: async () => true,
			readFile: async () => `active_intents:
  - id: "INT-001"
    name: "JWT Authentication Migration"
    status: "IN_PROGRESS"
    owned_scope:
      - "src/auth/**"
      - "!src/auth/legacy/**"
    constraints:
      - type: "TECHNICAL"
        rule: "Must not use external auth providers"
      - "Token validation must complete within 50ms"
    acceptance_criteria:
      - "Integration tests pass"
`,
		} as unknown as OrchestrationStorage

		const manager = new IntentManager(storage)
		const intents = await manager.loadIntents()

		expect(intents).toHaveLength(1)
		expect(intents[0].id).toBe("INT-001")
		expect(intents[0].ownedScope).toEqual(["src/auth/**", "!src/auth/legacy/**"])
		expect(intents[0].constraints).toEqual([
			"Must not use external auth providers",
			"Token validation must complete within 50ms",
		])
		expect(intents[0].acceptanceCriteria).toEqual(["Integration tests pass"])
	})

	it("still supports legacy intents root and camelCase fields", async () => {
		const storage = {
			fileExists: async () => true,
			readFile: async () => `intents:
  - id: "INT-LEGACY"
    name: "Legacy"
    status: "PENDING"
    ownedScope:
      - "src/**"
    constraints: []
    acceptanceCriteria: []
`,
		} as unknown as OrchestrationStorage

		const manager = new IntentManager(storage)
		const intents = await manager.loadIntents()

		expect(intents).toHaveLength(1)
		expect(intents[0].id).toBe("INT-LEGACY")
		expect(intents[0].ownedScope).toEqual(["src/**"])
	})
})
