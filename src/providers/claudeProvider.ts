import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import type { AgentProvider, TranscriptContext } from './providerTypes.js';
import { PROVIDER_IDS } from './providerTypes.js';
import type { AgentState } from '../types.js';
import { processTranscriptLine } from '../transcriptParser.js';

export const claudeProvider: AgentProvider = {
	id: PROVIDER_IDS.CLAUDE,
	displayName: 'Claude Code',
	terminalNamePrefix: 'Claude Code',
	usesProjectScan: true,
	needsTerminal: true,

	launchTerminal(terminal, cwd) {
		if (!terminal) return null;
		const sessionId = crypto.randomUUID();
		terminal.sendText(`claude --session-id ${sessionId}`);

		const dirName = cwd.replace(/[:\\/]/g, '-');
		const projectDir = path.join(os.homedir(), '.claude', 'projects', dirName);
		const jsonlFile = path.join(projectDir, `${sessionId}.jsonl`);

		return { projectDir, jsonlFile };
	},

	getProjectDir(cwd?) {
		const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) return null;
		const dirName = workspacePath.replace(/[:\\/]/g, '-');
		return path.join(os.homedir(), '.claude', 'projects', dirName);
	},

	processLine(agentId: number, line: string, _agent: AgentState, ctx: TranscriptContext) {
		processTranscriptLine(agentId, line, ctx.agents, ctx.waitingTimers, ctx.permissionTimers, ctx.webview);
	},
};
