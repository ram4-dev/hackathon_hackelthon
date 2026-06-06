import type { OutboundClient } from "../kapso/client.js";
import {
	normalizeKapsoMessage,
	type KapsoWebhookPayload,
} from "../kapso/normalizeMessage.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import { handleOnboarding } from "./onboarding.js";
import { routeInboundMessage } from "./stateMachine.js";

export type ProcessInboundDeps = {
	store: MarkdownStore;
	outbound: OutboundClient;
	publicWhatsAppNumber?: string;
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

	if (routed.mode === "onboarding" && routed.tenant.kind === "unknown") {
		await handleOnboarding(normalized, routed.tenant, {
			store: deps.store,
			outbound: deps.outbound,
			publicWhatsAppNumber: deps.publicWhatsAppNumber,
		});
		return;
	}

	// T8/T10 replace these logs with import/active handlers.
	console.log("Routed inbound message", {
		messageId: normalized.messageId,
		from: normalized.from,
		mode: routed.mode,
		tenant: routed.tenant.kind,
	});
}
