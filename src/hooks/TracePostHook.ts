import * as path from "path"
import fs from "fs/promises"
import crypto from "crypto"

import { parsePatch } from "../core/tools/apply-patch"
import { IntentManager } from "./IntentManager"
import { OrchestrationStorage } from "./OrchestrationStorage"
import type { ToolExecutionContext, PostHookResult, TraceLogEntry, ActiveIntent, MutationClass } from "./types"

const DESTRUCTIVE_TOOLS = new Set([
	"write_to_file",
	"execute_command",
	"edit",
	"search_and_replace",
	"edit_file",
	"search_replace",
	"apply_diff",
	"apply_patch",
])

type TraceTarget = {
	path: string
	mutationClass: MutationClass
}

export class TracePostHook {
	private intentManager: IntentManager
	private storage: OrchestrationStorage

	constructor(intentManager: IntentManager, storage: OrchestrationStorage) {
		this.intentManager = intentManager
		this.storage = storage
	}

	private getIntentManager(): IntentManager {
		const globalIntentManager = (global as any).__intentManager as IntentManager | undefined
		return globalIntentManager || this.intentManager
	}

	private async getActiveIntent(context: ToolExecutionContext): Promise<ActiveIntent | null> {
		const intentManager = this.getIntentManager()
		if (context.activeIntentId) {
			const intent = await intentManager.getIntent(context.activeIntentId)
			if (intent) {
				return intent
			}
		}
		return await intentManager.getActiveIntent(context.taskId)
	}

	private extractTraceTargets(context: ToolExecutionContext): TraceTarget[] {
		switch (context.toolName) {
			case "write_to_file":
			case "apply_diff": {
				const filePath = (context.toolParams.path as string) || (context.toolParams.file_path as string)
				return filePath ? [{ path: filePath, mutationClass: "MODIFY" }] : []
			}
			case "edit":
			case "search_and_replace":
			case "search_replace":
			case "edit_file": {
				const filePath = (context.toolParams.file_path as string) || (context.toolParams.path as string)
				return filePath ? [{ path: filePath, mutationClass: "MODIFY" }] : []
			}
			case "apply_patch": {
				const patch = context.toolParams.patch as string | undefined
				if (!patch) {
					return []
				}
				const parsed = parsePatch(patch)
				const targets: TraceTarget[] = []
				for (const hunk of parsed.hunks) {
					if (hunk.type === "AddFile") {
						targets.push({ path: hunk.path, mutationClass: "CREATE" })
					} else {
						targets.push({ path: hunk.path, mutationClass: "MODIFY" })
					}
					if (hunk.type === "UpdateFile" && hunk.movePath) {
						targets.push({ path: hunk.movePath, mutationClass: "MODIFY" })
					}
				}
				return targets
			}
			default:
				return []
		}
	}

	private resolveAbsolutePath(workspacePath: string, filePath: string): string {
		return path.isAbsolute(filePath) ? filePath : path.resolve(workspacePath, filePath)
	}

	private async computeContentHash(absolutePath: string): Promise<string> {
		try {
			const contents = await fs.readFile(absolutePath, "utf8")
			return crypto.createHash("sha256").update(contents, "utf8").digest("hex")
		} catch {
			return ""
		}
	}

	async run(context: ToolExecutionContext, _result: unknown): Promise<PostHookResult> {
		if (!DESTRUCTIVE_TOOLS.has(context.toolName)) {
			return { success: true }
		}

		const activeIntent = await this.getActiveIntent(context)
		if (!activeIntent) {
			return { success: true }
		}

		const targets = this.extractTraceTargets(context)
		if (targets.length === 0) {
			return { success: true }
		}

		let lastEntry: TraceLogEntry | undefined

		for (const target of targets) {
			const absolutePath = this.resolveAbsolutePath(context.workspacePath, target.path)
			const contentHash = await this.computeContentHash(absolutePath)

			const entry: TraceLogEntry = {
				intentId: activeIntent.id,
				contentHash,
				filePath: target.path,
				mutationClass: target.mutationClass,
				timestamp: new Date().toISOString(),
				toolName: context.toolName,
			}

			await this.storage.appendFile("agent_trace.jsonl", `${JSON.stringify(entry)}\n`)
			lastEntry = entry
		}

		return { success: true, traceEntry: lastEntry }
	}
}
