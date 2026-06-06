import type { NormalizedMessage } from "../kapso/normalizeMessage.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import { resolveTenant, type TenantContext } from "./tenant.js";
import type { ConversationMode } from "./types.js";

export type RoutedInbound = {
	tenant: TenantContext;
	mode: ConversationMode;
	message: NormalizedMessage;
};

export async function routeInboundMessage(
	store: MarkdownStore,
	message: NormalizedMessage,
): Promise<RoutedInbound> {
	const tenant = await resolveTenant(store, message.from);
	const mode = resolveMode(tenant);

	return { tenant, mode, message };
}

export function resolveMode(tenant: TenantContext): ConversationMode {
	if (tenant.kind === "unknown") {
		return tenant.state?.mode ?? "onboarding";
	}

	if (tenant.state?.mode === "import") return "import";
	return "active";
}
