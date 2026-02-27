import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { AgentProvider, TranscriptContext } from './providerTypes.js';
import { PROVIDER_IDS } from './providerTypes.js';
import type { AgentState } from '../types.js';
import { processCursorLine } from './cursorParser.js';
import { CURSOR_HOOKS_DIR, CURSOR_JSONL_FILE, CURSOR_HANDLER_SCRIPT } from '../constants.js';

export const cursorProvider: AgentProvider = {
	id: PROVIDER_IDS.CURSOR,
	displayName: 'Cursor',
	terminalNamePrefix: 'Cursor',
	usesProjectScan: false,
	needsTerminal: false,

	async setup(cwd: string): Promise<boolean> {
		return setupCursorHooks(cwd);
	},

	launchTerminal(_terminal, cwd) {
		const hooksDir = path.join(cwd, CURSOR_HOOKS_DIR);
		const jsonlFile = path.join(hooksDir, CURSOR_JSONL_FILE);
		return { projectDir: hooksDir, jsonlFile };
	},

	getProjectDir(cwd?) {
		const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) return null;
		return path.join(workspacePath, CURSOR_HOOKS_DIR);
	},

	processLine(agentId: number, line: string, agent: AgentState, ctx: TranscriptContext) {
		processCursorLine(agentId, line, agent, ctx);
	},
};

/**
 * Install/merge Cursor hooks into .cursor/hooks.json and write the handler script.
 * Merges with existing hooks to avoid clobbering user config.
 */
async function setupCursorHooks(cwd: string): Promise<boolean> {
	try {
		const cursorDir = path.join(cwd, '.cursor');
		const hooksJsonPath = path.join(cursorDir, 'hooks.json');
		const hooksScriptDir = path.join(cwd, CURSOR_HOOKS_DIR);
		const handlerPath = path.join(hooksScriptDir, CURSOR_HANDLER_SCRIPT);
		const jsonlPath = path.join(hooksScriptDir, CURSOR_JSONL_FILE);

		// Ensure directories exist
		fs.mkdirSync(hooksScriptDir, { recursive: true });

		// Write the handler script (always overwrite to get latest version)
		const handlerScript = generateHandlerScript(jsonlPath);
		fs.writeFileSync(handlerPath, handlerScript, 'utf-8');

		// Merge into hooks.json
		let hooksConfig: Record<string, unknown> = {};
		if (fs.existsSync(hooksJsonPath)) {
			try {
				hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8')) as Record<string, unknown>;
			} catch {
				hooksConfig = {};
			}
		}

		// Ensure top-level "hooks" key exists
		if (!hooksConfig.hooks || typeof hooksConfig.hooks !== 'object') {
			hooksConfig.hooks = {};
		}
		const hooks = hooksConfig.hooks as Record<string, unknown[]>;

		const hookEvents = [
			'beforeShellExecution', 'afterShellExecution',
			'beforeReadFile', 'afterFileEdit',
			'beforeMCPExecution', 'afterMCPExecution',
			'stop', 'beforeSubmitPrompt', 'afterAgentResponse',
		];

		const handlerCommand = `node "${handlerPath}"`;

		for (const event of hookEvents) {
			const existing = (hooks[event] || []) as Array<Record<string, unknown>>;
			const alreadyInstalled = existing.some(
				(h) => typeof h.command === 'string' && h.command.includes(CURSOR_HANDLER_SCRIPT),
			);
			if (!alreadyInstalled) {
				existing.push({
					type: 'command',
					command: handlerCommand,
				});
			}
			hooks[event] = existing;
		}

		fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2), 'utf-8');
		console.log(`[Pixel Agents] Cursor hooks installed at ${hooksJsonPath}`);
		return true;
	} catch (err) {
		console.error(`[Pixel Agents] Failed to setup Cursor hooks:`, err);
		return false;
	}
}

function generateHandlerScript(jsonlPath: string): string {
	// Node.js script that reads hook event data from stdin and appends a JSONL line
	const escapedPath = JSON.stringify(jsonlPath);
	return `#!/usr/bin/env node
const fs = require('fs');
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = input.trim() ? JSON.parse(input) : {};
    const event = data.hook_event_name || 'unknown';
    const record = { type: event, timestamp: Date.now(), ...data };
    fs.appendFileSync(${escapedPath}, JSON.stringify(record) + '\\n');
  } catch (e) {
    // Silently fail — don't break the Cursor workflow
  }
});
`;
}
