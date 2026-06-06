import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

const MAX_INTERACTIVE_BUTTONS = 3;
const MAX_INTERACTIVE_LIST_ROWS = 10;
const DEFAULT_LIST_BUTTON_TEXT = "Ver opciones";

export type KapsoButton = {
	id: string;
	title: string;
};

export type KapsoListRow = {
	id: string;
	title: string;
	description?: string;
};

type KapsoMessages = {
	sendText(input: Record<string, unknown>): Promise<unknown>;
	sendInteractiveButtons(input: Record<string, unknown>): Promise<unknown>;
	sendInteractiveList(input: Record<string, unknown>): Promise<unknown>;
	sendTemplate(input: Record<string, unknown>): Promise<unknown>;
};

export type KapsoClientConfig = {
	baseUrl: string;
	apiKey: string;
	phoneNumberId: string;
};

export class KapsoClient {
	private readonly messages: KapsoMessages;

	constructor(
		private readonly config: KapsoClientConfig,
		messages?: KapsoMessages,
	) {
		this.messages =
			messages ??
			new WhatsAppClient({
				baseUrl: config.baseUrl,
				kapsoApiKey: config.apiKey,
			}).messages;
	}

	async sendText(to: string, body: string): Promise<void> {
		await this.messages.sendText({
			phoneNumberId: this.config.phoneNumberId,
			to,
			body,
		});
	}

	async sendButtons(
		to: string,
		bodyText: string,
		buttons: KapsoButton[],
	): Promise<void> {
		await this.messages.sendInteractiveButtons({
			phoneNumberId: this.config.phoneNumberId,
			to,
			bodyText,
			buttons: buttons.slice(0, MAX_INTERACTIVE_BUTTONS),
		});
	}

	async sendList(
		to: string,
		bodyText: string,
		rows: KapsoListRow[],
	): Promise<void> {
		await this.messages.sendInteractiveList({
			phoneNumberId: this.config.phoneNumberId,
			to,
			bodyText,
			buttonText: DEFAULT_LIST_BUTTON_TEXT,
			sections: [{ rows: rows.slice(0, MAX_INTERACTIVE_LIST_ROWS) }],
		});
	}

	async sendTemplate(
		to: string,
		templateName: string,
		languageCode = "es_AR",
	): Promise<void> {
		await this.messages.sendTemplate({
			phoneNumberId: this.config.phoneNumberId,
			to,
			template: {
				name: templateName,
				language: { code: languageCode },
			},
		});
	}
}

export type OutboundClient = Pick<
	KapsoClient,
	"sendText" | "sendButtons" | "sendList" | "sendTemplate"
>;
