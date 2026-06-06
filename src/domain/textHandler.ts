import type { OutboundClient } from "../kapso/client.js";

export type TextHandler = (waPhone: string, text: string) => Promise<void>;

export function createEchoTextHandler(outbound: OutboundClient): TextHandler {
	return async (waPhone, text) => {
		await outbound.sendText(waPhone, `ok: ${text}`);
	};
}
