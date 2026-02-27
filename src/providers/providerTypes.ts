import type * as vscode from 'vscode';
import type { AgentState } from '../types.js';

export const PROVIDER_IDS = {
	CLAUDE: 'claude',
	CODEX: 'codex',
	CURSOR: 'cursor',
} as const;

export type ProviderId = typeof PROVIDER_IDS[keyof typeof PROVIDER_IDS];

/** Context passed to processLine — wraps timer/message dispatch helpers */
export interface TranscriptContext {
	agents: Map<number, AgentState>;
	waitingTimers: Map<number, ReturnType<typeof setTimeout>>;
	permissionTimers: Map<number, ReturnType<typeof setTimeout>>;
	webview: vscode.Webview | undefined;
}

export interface AgentProvider {
	/** Unique identifier for persistence */
	readonly id: ProviderId;

	/** Display name for UI (terminal prefix, button labels) */
	readonly displayName: string;

	/** Terminal name prefix (e.g. "Claude Code", "Codex") */
	readonly terminalNamePrefix: string;

	/** Whether this provider uses project-dir scanning for new JSONL files */
	readonly usesProjectScan: boolean;

	/**
	 * Send the CLI command to the terminal and return the expected JSONL file path.
	 * Returns null if the provider can't determine a project dir.
	 * For terminal-less providers (Cursor), terminal may be null.
	 */
	launchTerminal(
		terminal: vscode.Terminal | null,
		cwd: string,
	): { projectDir: string; jsonlFile: string } | null;

	/**
	 * Get the project directory for scanning.
	 * Returns null if not applicable.
	 */
	getProjectDir(cwd?: string): string | null;

	/**
	 * Parse a JSONL line and dispatch appropriate webview messages.
	 */
	processLine(
		agentId: number,
		line: string,
		agent: AgentState,
		ctx: TranscriptContext,
	): void;

	/**
	 * Optional: one-time setup needed before first agent launch.
	 * Used by Cursor to install hooks. Returns true if setup succeeded.
	 */
	setup?(cwd: string): Promise<boolean>;

	/** Whether this provider needs a VS Code terminal (false for Cursor) */
	readonly needsTerminal: boolean;
}
