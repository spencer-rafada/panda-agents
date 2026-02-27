import * as path from 'path';
import type { AgentState } from '../types.js';
import type { TranscriptContext } from './providerTypes.js';
import {
	cancelWaitingTimer,
	clearAgentActivity,
	startPermissionTimer,
	cancelPermissionTimer,
} from '../timerManager.js';
import {
	TOOL_DONE_DELAY_MS,
	BASH_COMMAND_DISPLAY_MAX_LENGTH,
} from '../constants.js';

/**
 * Cursor hooks JSONL format:
 * Each line is a JSON object written by panda-logger.js with fields:
 *   type: hook event name (e.g. "beforeShellExecution", "afterFileEdit")
 *   timestamp: Date.now()
 *   ...rest of the hook payload from stdin
 *
 * Hook events we handle:
 *   beforeSubmitPrompt, afterAgentResponse, stop,
 *   beforeShellExecution, afterShellExecution,
 *   beforeReadFile, afterFileEdit,
 *   beforeMCPExecution, afterMCPExecution
 */

const CURSOR_PERMISSION_EXEMPT = new Set<string>();

function formatCursorStatus(event: string, record: Record<string, unknown>): string {
	if (event === 'beforeShellExecution') {
		const cmd = (record.command as string) || '';
		const display = cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH
			? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026'
			: cmd;
		return `Running: ${display}`;
	}
	if (event === 'beforeReadFile') {
		return `Reading ${path.basename((record.file_path as string) || '')}`;
	}
	if (event === 'afterFileEdit') {
		return `Editing ${path.basename((record.file_path as string) || '')}`;
	}
	if (event === 'beforeMCPExecution') {
		return `MCP: ${(record.tool_name as string) || 'tool'}`;
	}
	return `Using ${event}`;
}

function generateToolId(): string {
	return `cursor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function processCursorLine(
	agentId: number,
	line: string,
	agent: AgentState,
	ctx: TranscriptContext,
): void {
	try {
		const record = JSON.parse(line) as Record<string, unknown>;
		const event = record.type as string;
		if (!event) return;

		if (event === 'beforeSubmitPrompt') {
			// New user prompt — new turn
			cancelWaitingTimer(agentId, ctx.waitingTimers);
			clearAgentActivity(agent, agentId, ctx.permissionTimers, ctx.webview);
			agent.hadToolsInTurn = false;
			ctx.webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
		} else if (event === 'afterAgentResponse' || event === 'stop') {
			// Agent finished or user stopped
			cancelWaitingTimer(agentId, ctx.waitingTimers);
			cancelPermissionTimer(agentId, ctx.permissionTimers);
			if (agent.activeToolIds.size > 0) {
				agent.activeToolIds.clear();
				agent.activeToolStatuses.clear();
				agent.activeToolNames.clear();
				agent.activeSubagentToolIds.clear();
				agent.activeSubagentToolNames.clear();
				ctx.webview?.postMessage({ type: 'agentToolsClear', id: agentId });
			}
			agent.isWaiting = true;
			agent.permissionSent = false;
			agent.hadToolsInTurn = false;
			ctx.webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'waiting' });
		} else if (event === 'beforeShellExecution' || event === 'beforeReadFile' || event === 'beforeMCPExecution') {
			// Tool start
			const toolId = generateToolId();
			const status = formatCursorStatus(event, record);
			const toolName = event === 'beforeShellExecution' ? 'Bash'
				: event === 'beforeReadFile' ? 'Read'
				: 'MCP';
			agent.activeToolIds.add(toolId);
			agent.activeToolStatuses.set(toolId, status);
			agent.activeToolNames.set(toolId, toolName);
			agent.hadToolsInTurn = true;
			agent.isWaiting = false;
			ctx.webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
			ctx.webview?.postMessage({ type: 'agentToolStart', id: agentId, toolId, status });
			startPermissionTimer(agentId, ctx.agents, ctx.permissionTimers, CURSOR_PERMISSION_EXEMPT, ctx.webview);
		} else if (event === 'afterShellExecution' || event === 'afterFileEdit' || event === 'afterMCPExecution') {
			// Tool done — find and clear the matching before-tool by type
			const matchType = event === 'afterShellExecution' ? 'Bash'
				: event === 'afterFileEdit' ? 'Read' // afterFileEdit may match a beforeReadFile or be standalone
				: 'MCP';

			// For afterFileEdit without a matching beforeReadFile, generate a brief start+done
			let matchedToolId: string | null = null;
			for (const [toolId, toolName] of agent.activeToolNames) {
				if (toolName === matchType) {
					matchedToolId = toolId;
					break;
				}
			}

			if (matchedToolId) {
				agent.activeToolIds.delete(matchedToolId);
				agent.activeToolStatuses.delete(matchedToolId);
				agent.activeToolNames.delete(matchedToolId);
				const doneId = matchedToolId;
				setTimeout(() => {
					ctx.webview?.postMessage({ type: 'agentToolDone', id: agentId, toolId: doneId });
				}, TOOL_DONE_DELAY_MS);
			} else if (event === 'afterFileEdit') {
				// No matching before-tool — show a brief edit event
				const toolId = generateToolId();
				const status = formatCursorStatus(event, record);
				agent.hadToolsInTurn = true;
				ctx.webview?.postMessage({ type: 'agentToolStart', id: agentId, toolId, status });
				setTimeout(() => {
					ctx.webview?.postMessage({ type: 'agentToolDone', id: agentId, toolId });
				}, TOOL_DONE_DELAY_MS);
			}

			if (agent.activeToolIds.size === 0) {
				agent.hadToolsInTurn = false;
			}
		}
	} catch {
		// Ignore malformed lines
	}
}
