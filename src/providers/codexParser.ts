import type { AgentState } from '../types.js';
import type { TranscriptContext } from './providerTypes.js';
import {
	cancelWaitingTimer,
	startWaitingTimer,
	clearAgentActivity,
	startPermissionTimer,
	cancelPermissionTimer,
} from '../timerManager.js';
import {
	TOOL_DONE_DELAY_MS,
	TEXT_IDLE_DELAY_MS,
	BASH_COMMAND_DISPLAY_MAX_LENGTH,
} from '../constants.js';

/**
 * Codex JSONL format:
 * Line 1: SessionMeta header (has `working_dir`, no `type` field)
 * Subsequent: RolloutItem entries with `type` field:
 *   TurnStarted, TurnEnded, ExecCommandBegin, ExecCommandEnd,
 *   ExecOutputDelta, AgentMessageDelta, ApprovalRequest, UserMessage
 *
 * Internal tools: `apply_patch` (file edits), `shell` (bash commands)
 */

const CODEX_PERMISSION_EXEMPT = new Set<string>();

function formatCodexToolStatus(eventType: string, record: Record<string, unknown>): string {
	if (eventType === 'ExecCommandBegin') {
		const cmd = (record.command as string) || '';
		const display = cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH
			? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026'
			: cmd;
		return `Running: ${display}`;
	}
	return `Using ${eventType}`;
}

export function processCodexLine(
	agentId: number,
	line: string,
	agent: AgentState,
	ctx: TranscriptContext,
): void {
	try {
		const record = JSON.parse(line) as Record<string, unknown>;
		const eventType = record.type as string | undefined;

		// Skip SessionMeta header (has working_dir, no type)
		if (!eventType && record.working_dir !== undefined) return;
		if (!eventType) return;

		if (eventType === 'TurnStarted') {
			cancelWaitingTimer(agentId, ctx.waitingTimers);
			clearAgentActivity(agent, agentId, ctx.permissionTimers, ctx.webview);
			agent.hadToolsInTurn = false;
			ctx.webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
		} else if (eventType === 'TurnEnded') {
			// Definitive turn-end (like Claude's system+turn_duration)
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
		} else if (eventType === 'ExecCommandBegin') {
			const toolId = (record.id as string) || crypto.randomUUID();
			const status = formatCodexToolStatus('ExecCommandBegin', record);
			agent.activeToolIds.add(toolId);
			agent.activeToolStatuses.set(toolId, status);
			agent.activeToolNames.set(toolId, 'shell');
			agent.hadToolsInTurn = true;
			agent.isWaiting = false;
			ctx.webview?.postMessage({ type: 'agentStatus', id: agentId, status: 'active' });
			ctx.webview?.postMessage({ type: 'agentToolStart', id: agentId, toolId, status });
			startPermissionTimer(agentId, ctx.agents, ctx.permissionTimers, CODEX_PERMISSION_EXEMPT, ctx.webview);
		} else if (eventType === 'ExecCommandEnd') {
			const toolId = record.id as string;
			if (toolId && agent.activeToolIds.has(toolId)) {
				agent.activeToolIds.delete(toolId);
				agent.activeToolStatuses.delete(toolId);
				agent.activeToolNames.delete(toolId);
				const doneId = toolId;
				setTimeout(() => {
					ctx.webview?.postMessage({ type: 'agentToolDone', id: agentId, toolId: doneId });
				}, TOOL_DONE_DELAY_MS);
			}
			if (agent.activeToolIds.size === 0) {
				agent.hadToolsInTurn = false;
			}
		} else if (eventType === 'ExecOutputDelta') {
			// Output is flowing — restart permission timer
			const parentId = record.exec_id as string;
			if (parentId && agent.activeToolIds.has(parentId)) {
				startPermissionTimer(agentId, ctx.agents, ctx.permissionTimers, CODEX_PERMISSION_EXEMPT, ctx.webview);
			}
		} else if (eventType === 'ApprovalRequest') {
			// Codex is asking for permission
			agent.permissionSent = true;
			ctx.webview?.postMessage({ type: 'agentToolPermission', id: agentId });
		} else if (eventType === 'AgentMessageDelta') {
			// Streaming text — if no tools used yet, start idle timer
			if (!agent.hadToolsInTurn) {
				startWaitingTimer(agentId, TEXT_IDLE_DELAY_MS, ctx.agents, ctx.waitingTimers, ctx.webview);
			}
		} else if (eventType === 'UserMessage') {
			// New user input — new turn starting
			cancelWaitingTimer(agentId, ctx.waitingTimers);
			clearAgentActivity(agent, agentId, ctx.permissionTimers, ctx.webview);
			agent.hadToolsInTurn = false;
		}
	} catch {
		// Ignore malformed lines
	}
}
