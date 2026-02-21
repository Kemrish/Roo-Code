import { beforeEach, describe, expect, it, vi } from "vitest"

import { presentAssistantMessage } from "../presentAssistantMessage"

const { runMock, editHandleMock } = vi.hoisted(() => ({
	runMock: vi.fn().mockResolvedValue({ allowed: true }),
	editHandleMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../task/Task")
vi.mock("../../tools/validateToolUse", () => ({
	validateToolUse: vi.fn(),
	isValidToolName: vi.fn(() => true),
}))
vi.mock("../../../hooks/PreToolHook", () => ({
	PreToolHook: class {
		run = runMock
	},
}))
vi.mock("../../../hooks/HookEngine", () => ({
	HookEngine: class {
		private hooks: Array<(context: any) => Promise<any>> = []
		registerPreHook(hook: (context: any) => Promise<any>) {
			this.hooks.push(hook)
		}
		async executePreHooks(context: any) {
			for (const hook of this.hooks) {
				const result = await hook(context)
				if (!result.allowed) {
					return result
				}
			}
			return { allowed: true }
		}
	},
}))
vi.mock("../../tools/EditFileTool", () => ({
	editFileTool: {
		handle: editHandleMock,
	},
}))
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureToolUsage: vi.fn(),
		},
	},
}))

describe("presentAssistantMessage intent governance", () => {
	let mockTask: any

	beforeEach(() => {
		runMock.mockClear()
		editHandleMock.mockClear()

		mockTask = {
			taskId: "test-task-id",
			instanceId: "test-instance",
			abort: false,
			workspacePath: "D:/Roo-Code",
			presentAssistantMessageLocked: false,
			presentAssistantMessageHasPendingUpdates: false,
			currentStreamingContentIndex: 0,
			assistantMessageContent: [],
			userMessageContent: [],
			didCompleteReadingStream: false,
			didRejectTool: false,
			didAlreadyUseTool: false,
			consecutiveMistakeCount: 0,
			api: {
				getModel: () => ({ id: "test-model", info: {} }),
			},
			recordToolUsage: vi.fn(),
			recordToolError: vi.fn(),
			toolRepetitionDetector: {
				check: vi.fn().mockReturnValue({ allowExecution: true }),
			},
			providerRef: {
				deref: () => ({
					getState: vi.fn().mockResolvedValue({
						mode: "code",
						customModes: [],
					}),
				}),
			},
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
			checkpointSave: vi.fn().mockResolvedValue(undefined),
			pushToolResultToUserContent: vi.fn().mockReturnValue(true),
		}
	})

	it("passes params to pre-hook when nativeArgs are missing", async () => {
		const toolCallId = "tool_call_edit_file"
		mockTask.assistantMessageContent = [
			{
				type: "tool_use",
				id: toolCallId,
				name: "edit_file",
				params: {
					file_path: "README.md",
					old_string: "old",
					new_string: "new",
				},
				nativeArgs: {
					old_string: "old",
					new_string: "new",
				},
				partial: false,
			},
		]

		await presentAssistantMessage(mockTask)

		expect(runMock).toHaveBeenCalledTimes(1)
		expect(runMock).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "edit_file",
				taskId: "test-task-id",
				workspacePath: "D:/Roo-Code",
				toolParams: expect.objectContaining({
					file_path: "README.md",
					old_string: "old",
					new_string: "new",
				}),
			}),
		)
		expect(editHandleMock).toHaveBeenCalledTimes(1)
	})
})
