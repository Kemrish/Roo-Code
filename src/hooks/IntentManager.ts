import * as yaml from "yaml"
import { OrchestrationStorage } from "./OrchestrationStorage"
import type { ActiveIntent, ActiveIntentsYaml, IntentStatus } from "./types"

/**
 * IntentManager manages active intents loaded from active_intents.yaml.
 * It handles loading, querying, and managing the active intent per task.
 */
export class IntentManager {
	private storage: OrchestrationStorage
	private intentsCache: ActiveIntent[] | null = null
	private activeIntentsByTask: Map<string, string> = new Map() // taskId -> intentId

	constructor(storage: OrchestrationStorage) {
		this.storage = storage
	}

	/**
	 * Loads all intents from active_intents.yaml.
	 * Uses caching to avoid re-parsing on every call.
	 * @returns Array of all intents
	 */
	async loadIntents(): Promise<ActiveIntent[]> {
		if (this.intentsCache !== null) {
			return this.intentsCache
		}

		const exists = await this.storage.fileExists("active_intents.yaml")
		if (!exists) {
			// Initialize with empty intents array if file doesn't exist
			await this.initializeIntentsFile()
			this.intentsCache = []
			return []
		}

		try {
			const content = await this.storage.readFile("active_intents.yaml")
			const parsed = yaml.parse(content) as ActiveIntentsYaml & {
				active_intents?: unknown[]
			}

			const rawIntents = Array.isArray(parsed?.intents)
				? parsed.intents
				: Array.isArray(parsed?.active_intents)
					? parsed.active_intents
					: null

			if (!rawIntents) {
				this.intentsCache = []
				return []
			}

			// Validate and normalize intents
			this.intentsCache = rawIntents.map((intent) => this.normalizeIntent(intent as Record<string, unknown>))

			return this.intentsCache
		} catch (error) {
			throw new Error(
				`Failed to parse active_intents.yaml: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Gets an intent by ID.
	 * @param intentId The intent ID to look up
	 * @returns The intent if found, null otherwise
	 */
	async getIntent(intentId: string): Promise<ActiveIntent | null> {
		const intents = await this.loadIntents()
		return intents.find((intent) => intent.id === intentId) || null
	}

	/**
	 * Sets the active intent for a task.
	 * Only one intent can be active per task at a time.
	 * @param taskId The task ID
	 * @param intentId The intent ID to activate
	 */
	async setActiveIntent(taskId: string, intentId: string): Promise<void> {
		const intent = await this.getIntent(intentId)
		if (!intent) {
			throw new Error(`Intent ${intentId} not found`)
		}

		this.activeIntentsByTask.set(taskId, intentId)
	}

	/**
	 * Gets the active intent for a task.
	 * @param taskId The task ID
	 * @returns The active intent if one is set, null otherwise
	 */
	async getActiveIntent(taskId: string): Promise<ActiveIntent | null> {
		const intentId = this.activeIntentsByTask.get(taskId)
		if (!intentId) {
			return null
		}

		return await this.getIntent(intentId)
	}

	/**
	 * Clears the active intent for a task.
	 * @param taskId The task ID
	 */
	async clearActiveIntent(taskId: string): Promise<void> {
		this.activeIntentsByTask.delete(taskId)
	}

	/**
	 * Invalidates the intents cache, forcing a reload on next access.
	 * Useful when active_intents.yaml is modified externally.
	 */
	invalidateCache(): void {
		this.intentsCache = null
	}

	/**
	 * Formats intent context for injection into system prompt.
	 * @param intent The intent to format
	 * @returns XML-formatted intent context string
	 */
	formatIntentContext(intent: ActiveIntent): string {
		const scopePatterns = intent.ownedScope.join(", ")
		const constraints = intent.constraints.length > 0 ? intent.constraints.join("\n  - ") : "None"

		return `<intent_context>
<intent_id>${intent.id}</intent_id>
<name>${intent.name}</name>
<description>${intent.description}</description>
<owned_scope>${scopePatterns}</owned_scope>
<constraints>
  - ${constraints}
</constraints>
<acceptance_criteria>
${intent.acceptanceCriteria.map((criteria) => `  - ${criteria}`).join("\n")}
</acceptance_criteria>
</intent_context>`
	}

	/**
	 * Initializes the active_intents.yaml file with an empty structure if it doesn't exist.
	 */
	private async initializeIntentsFile(): Promise<void> {
		const defaultContent = `# Active Intents Configuration
# This file defines the available intents for this workspace.
# Each intent specifies what files/areas can be modified and what constraints apply.

intents: []
`
		try {
			await this.storage.writeFile("active_intents.yaml", defaultContent)
		} catch (error) {
			console.warn("[IntentManager] Failed to initialize active_intents.yaml:", error)
		}
	}

	private normalizeIntent(rawIntent: Record<string, unknown>): ActiveIntent {
		const rawStatus = String(rawIntent.status || "PENDING").toUpperCase()
		const status: IntentStatus = (
			rawStatus === "PLANNED" ||
			rawStatus === "PENDING" ||
			rawStatus === "IN_PROGRESS" ||
			rawStatus === "COMPLETED" ||
			rawStatus === "BLOCKED"
				? rawStatus
				: "PENDING"
		) as IntentStatus

		return {
			id: String(rawIntent.id || ""),
			name: String(rawIntent.name || ""),
			description: String(rawIntent.description || ""),
			status,
			ownedScope: this.normalizeStringArray(rawIntent.ownedScope ?? rawIntent.owned_scope),
			constraints: this.normalizeConstraints(rawIntent.constraints),
			acceptanceCriteria: this.normalizeStringArray(
				rawIntent.acceptanceCriteria ?? rawIntent.acceptance_criteria,
			),
			metadata:
				rawIntent.metadata && typeof rawIntent.metadata === "object"
					? (rawIntent.metadata as Record<string, unknown>)
					: {},
		}
	}

	private normalizeStringArray(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return []
		}
		return value
			.map((item) => (typeof item === "string" ? item : String(item ?? "")))
			.map((item) => item.trim())
			.filter((item) => item.length > 0)
	}

	private normalizeConstraints(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return []
		}

		const normalized: string[] = []
		for (const item of value) {
			if (typeof item === "string") {
				const trimmed = item.trim()
				if (trimmed) {
					normalized.push(trimmed)
				}
				continue
			}

			if (item && typeof item === "object") {
				const objectItem = item as Record<string, unknown>
				if (typeof objectItem.rule === "string" && objectItem.rule.trim().length > 0) {
					normalized.push(objectItem.rule.trim())
					continue
				}
				const compact = JSON.stringify(objectItem)
				if (compact) {
					normalized.push(compact)
				}
			}
		}
		return normalized
	}
}
