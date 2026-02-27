import * as path from 'path';
import * as os from 'os';
import type { AgentProvider, TranscriptContext } from './providerTypes.js';
import { PROVIDER_IDS } from './providerTypes.js';
import type { AgentState } from '../types.js';
import { processCodexLine } from './codexParser.js';
import { CODEX_SESSIONS_DIR } from '../constants.js';

export const codexProvider: AgentProvider = {
	id: PROVIDER_IDS.CODEX,
	displayName: 'Codex',
	terminalNamePrefix: 'Codex',
	usesProjectScan: true,
	needsTerminal: true,

	launchTerminal(terminal, _cwd) {
		if (!terminal) return null;
		// Codex generates its own session ID; we watch the sessions dir for new files
		terminal.sendText('codex');

		const projectDir = path.join(os.homedir(), CODEX_SESSIONS_DIR);
		// jsonlFile is empty — will be discovered by project scan when Codex creates it
		return { projectDir, jsonlFile: '' };
	},

	getProjectDir() {
		return path.join(os.homedir(), CODEX_SESSIONS_DIR);
	},

	processLine(agentId: number, line: string, agent: AgentState, ctx: TranscriptContext) {
		processCodexLine(agentId, line, agent, ctx);
	},
};
