import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";

export type KapsoButton = {
	id: string;
	title: string;
};

export type KapsoClientConfig = {
	baseUrl: string;
	apiKey: string;
	phoneNumberId: string;
};

export class KapsoClient {
	private readonly client: WhatsAppClient;

	constructor(private readonly config: KapsoClientConfig) {
		this.client = new WhatsAppClient({
			baseUrl: config.baseUrl,
			kapsoApiKey: config.apiKey,
		});
	}

	async sendText(to: string, body: string): Promise<void> {
		await this.client.messages.sendText({
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
		await this.client.messages.sendInteractiveButtons({
			phoneNumberId: this.config.phoneNumberId,
			to,
			bodyText,
			buttons,
		});
	}

	async sendTemplate(
		to: string,
		templateName: string,
		languageCode = "es_AR",
	): Promise<void> {
		await this.client.messages.sendTemplate({
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
	"sendText" | "sendButtons" | "sendTemplate"
>;
