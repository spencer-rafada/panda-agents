import type { AgentProvider, ProviderId } from './providerTypes.js';
import { PROVIDER_IDS } from './providerTypes.js';
import { claudeProvider } from './claudeProvider.js';
import { codexProvider } from './codexProvider.js';
import { cursorProvider } from './cursorProvider.js';

const providers = new Map<ProviderId, AgentProvider>([
	[PROVIDER_IDS.CLAUDE, claudeProvider],
	[PROVIDER_IDS.CODEX, codexProvider],
	[PROVIDER_IDS.CURSOR, cursorProvider],
]);

export function registerProvider(provider: AgentProvider): void {
	providers.set(provider.id, provider);
}

export function getProvider(id: ProviderId): AgentProvider {
	const p = providers.get(id);
	if (!p) throw new Error(`Unknown provider: ${id}`);
	return p;
}

export function getAllProviders(): AgentProvider[] {
	return [...providers.values()];
}

export function inferProviderFromPath(filePath: string): ProviderId {
	if (filePath.includes('.codex')) return PROVIDER_IDS.CODEX;
	if (filePath.includes('.cursor')) return PROVIDER_IDS.CURSOR;
	return PROVIDER_IDS.CLAUDE;
}
