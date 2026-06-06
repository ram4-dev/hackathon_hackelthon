import type { OutboundClient } from "../kapso/client.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import { handleImportButton } from "./importMode.js";

export type ButtonDispatcher = (waPhone: string, id: string) => Promise<void>;

export function createDefaultButtonDispatcher(deps: {
	store: MarkdownStore;
	outbound: OutboundClient;
}): ButtonDispatcher {
	return async (waPhone, id) => {
		const handled = await handleImportButton(waPhone, id, deps);
		if (!handled) await logUnhandledButton(waPhone, id);
	};
}

export const logUnhandledButton: ButtonDispatcher = async (waPhone, id) => {
	console.warn("Unhandled interactive reply", { waPhone, id });
};
