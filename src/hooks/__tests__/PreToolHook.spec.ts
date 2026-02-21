import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { validatePathMock } = vi.hoisted(() => ({
	validatePathMock: vi.fn(),
}))

vi.mock("../ScopeValidator", () => ({
	ScopeValidator: class {
		validatePath = validatePathMock
	},
}))

import { PreToolHook } from "../PreToolHook"
import { IntentManager } from "../IntentManager"
import type { ActiveIntent, ToolExecutionContext } from "../types"

const baseIntent: ActiveIntent = {
	id: "INT-001",
	name: "Intent test",
	description: "Test intent",
	status: "IN_PROGRESS",
	ownedScope: ["src/**", "webview-ui/**"],
	constraints: [],
	acceptanceCriteria: [],
}

function makeContext(overrides: Partial<ToolExecutionContext>): ToolExecutionContext {
	return {
		toolName: "write_to_file",
		toolParams: {},
		taskId: "task-1",
		workspacePath: "D:/Roo-Code",
		...overrides,
	}
}

describe("PreToolHook", () => {
	beforeEach(() => {
		delete (global as any).__intentManager
		validatePathMock.mockReset()
		validatePathMock.mockImplementation(async (filePath: string, scopePatterns: string[]) => {
			return scopePatterns.some((pattern) => {
				const prefix = pattern.replace("/**", "")
				return filePath.replace(/\\/g, "/").startsWith(prefix)
			})
		})
	})

	afterEach(() => {
		delete (global as any).__intentManager
		vi.restoreAllMocks()
	})

	it("allows non-destructive tools without an active intent", async () => {
		const intentManager = {
			getIntent: vi.fn(),
			getActiveIntent: vi.fn(),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)

		const result = await hook.run(
			makeContext({
				toolName: "read_file",
				toolParams: { path: "src/index.ts" },
			}),
		)

		expect(result).toEqual({ allowed: true })
	})

	it("blocks destructive tools when no active intent is selected", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(null),
			getActiveIntent: vi.fn().mockResolvedValue(null),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)

		const result = await hook.run(
			makeContext({
				toolName: "apply_diff",
				toolParams: { path: "src/hooks/ScopeValidator.ts", diff: "dummy" },
			}),
		)

		expect(result.allowed).toBe(false)
		expect(result.error).toContain("No active intent selected")
	})

	it("allows write_to_file when path is within active intent scope", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(baseIntent),
			getActiveIntent: vi.fn().mockResolvedValue(baseIntent),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)

		const result = await hook.run(
			makeContext({
				toolName: "write_to_file",
				toolParams: { path: "src/hooks/ScopeValidator.ts" },
				activeIntentId: "INT-001",
			}),
		)

		expect(result).toEqual({ allowed: true })
	})

	it("blocks apply_diff when file path is out of scope", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(baseIntent),
			getActiveIntent: vi.fn().mockResolvedValue(baseIntent),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)

		const result = await hook.run(
			makeContext({
				toolName: "apply_diff",
				toolParams: {
					path: "packages/types/src/index.ts",
					diff: "*** Begin Patch\n*** End Patch",
				},
			}),
		)

		expect(result.allowed).toBe(false)
		expect(result.error).toContain("Scope Violation")
		expect(result.error).toContain("packages/types/src/index.ts")
	})

	it("blocks edit when file path is out of scope", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(baseIntent),
			getActiveIntent: vi.fn().mockResolvedValue(baseIntent),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)

		const result = await hook.run(
			makeContext({
				toolName: "edit",
				toolParams: {
					file_path: "packages/types/src/index.ts",
					old_string: "a",
					new_string: "b",
				},
			}),
		)

		expect(result.allowed).toBe(false)
		expect(result.error).toContain("Scope Violation")
	})

	it("blocks apply_patch when any patched file is out of scope", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(baseIntent),
			getActiveIntent: vi.fn().mockResolvedValue(baseIntent),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)
		const patch = `*** Begin Patch
*** Update File: src/hooks/ScopeValidator.ts
@@
-old
+new
*** Add File: packages/types/src/new-file.ts
+export const x = 1
*** End Patch`

		const result = await hook.run(
			makeContext({
				toolName: "apply_patch",
				toolParams: { patch },
			}),
		)

		expect(result.allowed).toBe(false)
		expect(result.error).toContain("Scope Violation")
		expect(result.error).toContain("packages/types/src/new-file.ts")
	})

	it("blocks apply_patch when move destination is out of scope", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(baseIntent),
			getActiveIntent: vi.fn().mockResolvedValue(baseIntent),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)
		const patch = `*** Begin Patch
*** Update File: src/hooks/ScopeValidator.ts
*** Move to: packages/types/src/ScopeValidator.ts
@@
-old
+new
*** End Patch`

		const result = await hook.run(
			makeContext({
				toolName: "apply_patch",
				toolParams: { patch },
			}),
		)

		expect(result.allowed).toBe(false)
		expect(result.error).toContain("Scope Violation")
		expect(result.error).toContain("packages/types/src/ScopeValidator.ts")
	})

	it("blocks execute_command even when an intent is active", async () => {
		const intentManager = {
			getIntent: vi.fn().mockResolvedValue(baseIntent),
			getActiveIntent: vi.fn().mockResolvedValue(baseIntent),
		} as unknown as IntentManager

		const hook = new PreToolHook(intentManager)

		const result = await hook.run(
			makeContext({
				toolName: "execute_command",
				toolParams: { command: "echo hi > README.md" },
			}),
		)

		expect(result.allowed).toBe(false)
		expect(result.error).toContain("execute_command")
		expect(result.error).toContain("Scope Violation")
	})
})
