export type AppEnv = {
	kapsoApiKey: string;
	kapsoWebhookSecret: string;
	kapsoPhoneNumberId: string;
	kapsoBaseUrl: string;
	kapsoPublicWhatsAppNumber?: string;
	aiProvider: "openai" | "anthropic" | "opencode";
	aiModel?: string;
	opencodeApiKey?: string;
	opencodeBaseUrl: string;
	dataDir: string;
	port: number;
	reminderTemplateName?: string;
};

export function loadEnv(): AppEnv {
	return {
		kapsoApiKey: process.env.KAPSO_API_KEY ?? "",
		kapsoWebhookSecret: process.env.KAPSO_WEBHOOK_SECRET ?? "",
		kapsoPhoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID ?? "",
		kapsoBaseUrl:
			process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp",
		kapsoPublicWhatsAppNumber:
			process.env.KAPSO_PUBLIC_WHATSAPP_NUMBER || undefined,
		aiProvider: parseAiProvider(process.env.AI_PROVIDER),
		aiModel: process.env.AI_MODEL || undefined,
		opencodeApiKey: process.env.OPENCODE_API_KEY || undefined,
		opencodeBaseUrl:
			process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/go/v1",
		dataDir: process.env.DATA_DIR ?? "./data",
		port: parsePort(process.argv, process.env.PORT),
		reminderTemplateName: process.env.KAPSO_REMINDER_TEMPLATE_NAME || undefined,
	};
}

function parseAiProvider(value: string | undefined): AppEnv["aiProvider"] {
	if (value === "anthropic") return "anthropic";
	if (value === "opencode") return "opencode";
	return "openai";
}

function parsePort(argv: string[], envPort: string | undefined): number {
	const portFlagIndex = argv.findIndex((arg) => arg === "--port");
	const cliPort = portFlagIndex >= 0 ? argv[portFlagIndex + 1] : undefined;
	return Number(cliPort ?? envPort ?? 3000);
}
