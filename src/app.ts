import { Hono } from "hono";
import type { AppEnv } from "./env.js";
import { processInboundMessage } from "./domain/processInboundMessage.js";
import { enqueue } from "./jobs/queue.js";
import { KapsoClient, type OutboundClient } from "./kapso/client.js";
import { ConsoleOutboundClient } from "./kapso/consoleClient.js";
import type { KapsoWebhookPayload } from "./kapso/normalizeMessage.js";
import { verifyKapsoSignature } from "./kapso/verifyWebhook.js";
import { MarkdownStore } from "./storage/markdownStore.js";

export function createApp(env: AppEnv) {
	const app = new Hono();
	const store = new MarkdownStore(env.dataDir);
	const outbound = createOutboundClient(env);

	app.get("/health", (c) => c.json({ ok: true }));

	app.post("/webhook", async (c) => {
		const rawBody = await c.req.text();
		const signature = c.req.header("x-webhook-signature");

		if (
			!verifyKapsoSignature({
				rawBody,
				signature,
				secret: env.kapsoWebhookSecret,
			})
		) {
			return c.text("Invalid signature", 401);
		}

		const payload = parsePayload(rawBody);
		if (!payload) return c.text("Invalid payload", 400);

		if (payload.event && payload.event !== "whatsapp.message.received") {
			return c.text("OK", 200);
		}

		const messageId = payload.message?.id ?? "";
		const idempotencyKey = c.req.header("x-idempotency-key") ?? messageId;

		if (!idempotencyKey) {
			return c.text("OK", 200);
		}

		if (await store.isWebhookProcessed(idempotencyKey)) {
			return c.text("Already processed", 200);
		}

		await store.markWebhookProcessed({ key: idempotencyKey, messageId });
		enqueue(
			(queuedPayload) =>
				processInboundMessage(queuedPayload, {
					store,
					outbound,
					publicWhatsAppNumber: env.kapsoPublicWhatsAppNumber,
				}),
			payload,
		);

		return c.text("OK", 200);
	});

	return app;
}

function createOutboundClient(env: AppEnv): OutboundClient {
	if (!env.kapsoApiKey || !env.kapsoPhoneNumberId) {
		return new ConsoleOutboundClient();
	}

	return new KapsoClient({
		apiKey: env.kapsoApiKey,
		baseUrl: env.kapsoBaseUrl,
		phoneNumberId: env.kapsoPhoneNumberId,
	});
}

function parsePayload(rawBody: string): KapsoWebhookPayload | null {
	try {
		const parsed = JSON.parse(rawBody) as KapsoWebhookPayload;
		return typeof parsed === "object" && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}
