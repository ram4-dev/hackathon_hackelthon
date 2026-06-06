import type { OutboundClient } from "../kapso/client.js";
import {
	normalizeKapsoMessage,
	type KapsoWebhookPayload,
} from "../kapso/normalizeMessage.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import {
	createDefaultButtonDispatcher,
	type ButtonDispatcher,
} from "./buttonRouter.js";
import {
	handleImportMode,
	type ImportExtractor,
} from "./importMode.js";
import { handleOnboarding } from "./onboarding.js";
import { routeInboundMessage } from "./stateMachine.js";
import { createEchoTextHandler, type TextHandler } from "./textHandler.js";

export type ProcessInboundDeps = {
	store: MarkdownStore;
	outbound: OutboundClient;
	publicWhatsAppNumber?: string;
	buttonDispatcher?: ButtonDispatcher;
	textHandler?: TextHandler;
	importExtractor?: ImportExtractor;
};

export async function processInboundMessage(
	payload: KapsoWebhookPayload,
	deps: ProcessInboundDeps,
): Promise<void> {
	const normalized = normalizeKapsoMessage(payload);
	if (!normalized) {
		console.warn("Ignoring Kapso message without sender or message payload");
		return;
	}

	const routed = await routeInboundMessage(deps.store, normalized);

	if (normalized.interactiveId) {
		await (deps.buttonDispatcher ??
			createDefaultButtonDispatcher({
				store: deps.store,
				outbound: deps.outbound,
			}))(normalized.from, normalized.interactiveId);
		return;
	}

	if (routed.mode === "onboarding" && routed.tenant.kind === "unknown") {
		await handleOnboarding(normalized, routed.tenant, {
			store: deps.store,
			outbound: deps.outbound,
			publicWhatsAppNumber: deps.publicWhatsAppNumber,
		});
		return;
	}

	if (routed.mode === "import" && routed.tenant.kind === "known") {
		await handleImportMode(normalized, routed.tenant, {
			store: deps.store,
			outbound: deps.outbound,
			importExtractor: deps.importExtractor,
		});
		return;
	}

	await (deps.textHandler ?? createEchoTextHandler(deps.outbound))(
		normalized.from,
		normalized.text,
	);
}
