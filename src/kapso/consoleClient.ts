import type { KapsoButton, KapsoListRow, OutboundClient } from "./client.js";

export class ConsoleOutboundClient implements OutboundClient {
	async sendText(to: string, body: string): Promise<void> {
		console.log("Kapso text", { to, body });
	}

	async sendButtons(
		to: string,
		bodyText: string,
		buttons: KapsoButton[],
	): Promise<void> {
		console.log("Kapso buttons", { to, bodyText, buttons });
	}

	async sendList(
		to: string,
		bodyText: string,
		rows: KapsoListRow[],
	): Promise<void> {
		console.log("Kapso list", { to, bodyText, rows });
	}

	async sendTemplate(
		to: string,
		templateName: string,
		languageCode?: string,
	): Promise<void> {
		console.log("Kapso template", { to, templateName, languageCode });
	}
}
