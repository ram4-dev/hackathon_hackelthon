import type { LanguageModel } from "ai";
import { runAgent } from "../../lib/agent.js";
import type { Db } from "../../lib/contracts.js";
import { createModel } from "../../lib/model.js";
import { db as mockDb } from "../../lib/mocks.js";
import { db as dataDb } from "../lib/db.js";
import type { OutboundClient } from "../kapso/client.js";

export type TextHandler = (waPhone: string, text: string) => Promise<void>;
export type AgentRunner = (
	waPhone: string,
	text: string,
	deps: Parameters<typeof runAgent>[2],
) => Promise<void>;

export type AgentTextHandlerOptions = {
	runner?: AgentRunner;
	db?: Db;
	model?: LanguageModel;
	now?: () => string;
};

let cachedModel: LanguageModel | null = null;

export function createAgentTextHandler(
	outbound: OutboundClient,
	options: AgentTextHandlerOptions = {},
): TextHandler {
	return async (waPhone, text) => {
		const runner = options.runner ?? runAgent;
		await runner(waPhone, text, {
			db: options.db ?? getDefaultDb(),
			send: {
				sendText: outbound.sendText.bind(outbound),
				sendButtons: outbound.sendButtons.bind(outbound),
				sendList: outbound.sendList.bind(outbound),
			},
			model: options.model ?? getDefaultModel(),
			now: options.now ?? (() => new Date().toISOString()),
		});
	};
}

export function createEchoTextHandler(outbound: OutboundClient): TextHandler {
	return async (waPhone, text) => {
		await outbound.sendText(waPhone, `ok: ${text}`);
	};
}

function getDefaultDb(): Db {
	if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
		return mockDb;
	}

	// Data PR exports SPEC-00-compatible functions from src/lib/db.ts, but its
	// local domain types are not the same TypeScript symbols as lib/contracts.ts.
	// Keep the structural cast at this backend↔ML/Data boundary instead of
	// spreading casts through the agent or handlers.
	return dataDb as unknown as Db;
}

function getDefaultModel(): LanguageModel {
	cachedModel ??= createModel();
	return cachedModel;
}
