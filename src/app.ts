import { Hono, type Context } from "hono";
import type { AppEnv } from "./env.js";
import type { ButtonDispatcher } from "./domain/buttonRouter.js";
import { processInboundMessage } from "./domain/processInboundMessage.js";
import type { TextHandler } from "./domain/textHandler.js";
import { enqueue as defaultEnqueue, type JobHandler } from "./jobs/queue.js";
import { KapsoClient, type OutboundClient } from "./kapso/client.js";
import { ConsoleOutboundClient } from "./kapso/consoleClient.js";
import type { KapsoWebhookPayload } from "./kapso/normalizeMessage.js";
import { verifyKapsoSignature } from "./kapso/verifyWebhook.js";
import { MarkdownStore } from "./storage/markdownStore.js";

type EnqueueFn = <T>(handler: JobHandler<T>, payload: T) => void;

export type CreateAppOptions = {
	store?: MarkdownStore;
	outbound?: OutboundClient;
	enqueue?: EnqueueFn;
	buttonDispatcher?: ButtonDispatcher;
	textHandler?: TextHandler;
};

export function createApp(env: AppEnv, options: CreateAppOptions = {}) {
	const app = new Hono();
	const store = options.store ?? new MarkdownStore(env.dataDir);
	const outbound = options.outbound ?? createOutboundClient(env);
	const enqueue = options.enqueue ?? defaultEnqueue;

	app.get("/health", (c) => c.json({ ok: true }));

	const handleWebhook = async (c: Context) => {
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

		// Hackathon retry semantics: atomically record the delivery as accepted
		// before scheduling side effects. Accepted deliveries are non-retryable
		// here; async failures are logged by the queue and later duplicate
		// deliveries are ignored to prevent repeated WhatsApp replies or task
		// mutations.
		const accepted = await store.tryMarkWebhookProcessed({
			key: idempotencyKey,
			messageId,
		});
		if (!accepted) {
			return c.text("Already processed", 200);
		}
		enqueue(
			(queuedPayload) =>
				processInboundMessage(queuedPayload, {
					store,
					outbound,
					publicWhatsAppNumber: env.kapsoPublicWhatsAppNumber,
					buttonDispatcher: options.buttonDispatcher,
					textHandler: options.textHandler,
				}),
			payload,
		);

		return c.text("OK", 200);
	};

	app.post("/webhook", handleWebhook);
	app.post("/api/webhook", handleWebhook);

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
