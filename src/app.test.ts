import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AppEnv } from "./env.js";

let dataDir: string;
let env: AppEnv;

beforeEach(async () => {
	dataDir = await mkdtemp(join(tmpdir(), "kapso-app-"));
	env = {
		kapsoApiKey: "",
		kapsoWebhookSecret: ["test", "signing", "key"].join("-"),
		kapsoPhoneNumberId: "phone_number_id",
		kapsoBaseUrl: "https://api.kapso.ai/meta/whatsapp",
		aiProvider: "openai",
		opencodeBaseUrl: "https://opencode.ai/zen/go/v1",
		dataDir,
		port: 0,
	};
});

afterEach(async () => {
	await rm(dataDir, { recursive: true, force: true });
});

describe("webhook app", () => {
	it("rejects invalid signatures", async () => {
		const app = createApp(env);
		const response = await app.request("/webhook", {
			method: "POST",
			body: "{}",
			headers: { "x-webhook-signature": "bad" },
		});

		expect(response.status).toBe(401);
	});

	it("accepts a valid webhook and ignores duplicates", async () => {
		const enqueued: unknown[] = [];
		const app = createApp(env, {
			enqueue(_handler, payload) {
				enqueued.push(payload);
			},
		});
		const body = JSON.stringify({
			event: "whatsapp.message.received",
			message: {
				id: "wamid.1",
				from: "15551234567",
				type: "text",
				text: { body: "hola" },
			},
		});
		const signature = sign(body, env.kapsoWebhookSecret);

		const first = await app.request("/webhook", {
			method: "POST",
			body,
			headers: {
				"x-webhook-signature": signature,
				"x-idempotency-key": "idem_1",
			},
		});
		const second = await app.request("/webhook", {
			method: "POST",
			body,
			headers: {
				"x-webhook-signature": signature,
				"x-idempotency-key": "idem_1",
			},
		});

		expect(first.status).toBe(200);
		expect(await first.text()).toBe("OK");
		expect(second.status).toBe(200);
		expect(await second.text()).toBe("Already processed");
		expect(enqueued).toHaveLength(1);
	});

	it("deduplicates fallback delivery by message.id when no idempotency header is present", async () => {
		const enqueued: unknown[] = [];
		const app = createApp(env, {
			enqueue(_handler, payload) {
				enqueued.push(payload);
			},
		});
		const body = JSON.stringify({
			event: "whatsapp.message.received",
			message: {
				id: "wamid.fallback",
				from: "15551234567",
				type: "text",
				text: { body: "hola" },
			},
		});
		const signature = sign(body, env.kapsoWebhookSecret);

		const first = await app.request("/webhook", {
			method: "POST",
			body,
			headers: { "x-webhook-signature": signature },
		});
		const second = await app.request("/webhook", {
			method: "POST",
			body,
			headers: { "x-webhook-signature": signature },
		});

		expect(first.status).toBe(200);
		expect(await first.text()).toBe("OK");
		expect(second.status).toBe(200);
		expect(await second.text()).toBe("Already processed");
		expect(enqueued).toHaveLength(1);
	});

	it("deduplicates concurrent deliveries by idempotency header atomically", async () => {
		const enqueued: unknown[] = [];
		const app = createApp(env, {
			enqueue(_handler, payload) {
				enqueued.push(payload);
			},
		});
		const body = JSON.stringify({
			event: "whatsapp.message.received",
			message: {
				id: "wamid.concurrent-header",
				from: "15551234567",
				type: "text",
				text: { body: "hola" },
			},
		});
		const signature = sign(body, env.kapsoWebhookSecret);

		const responses = await Promise.all([
			app.request("/webhook", {
				method: "POST",
				body,
				headers: {
					"x-webhook-signature": signature,
					"x-idempotency-key": "idem_concurrent",
				},
			}),
			app.request("/webhook", {
				method: "POST",
				body,
				headers: {
					"x-webhook-signature": signature,
					"x-idempotency-key": "idem_concurrent",
				},
			}),
		]);

		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		expect(
			await Promise.all(responses.map((response) => response.text())),
		).toEqual(expect.arrayContaining(["OK", "Already processed"]));
		expect(enqueued).toHaveLength(1);
	});

	it("deduplicates concurrent fallback deliveries by message.id atomically", async () => {
		const enqueued: unknown[] = [];
		const app = createApp(env, {
			enqueue(_handler, payload) {
				enqueued.push(payload);
			},
		});
		const body = JSON.stringify({
			event: "whatsapp.message.received",
			message: {
				id: "wamid.concurrent-fallback",
				from: "15551234567",
				type: "text",
				text: { body: "hola" },
			},
		});
		const signature = sign(body, env.kapsoWebhookSecret);

		const responses = await Promise.all([
			app.request("/webhook", {
				method: "POST",
				body,
				headers: { "x-webhook-signature": signature },
			}),
			app.request("/webhook", {
				method: "POST",
				body,
				headers: { "x-webhook-signature": signature },
			}),
		]);

		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		expect(
			await Promise.all(responses.map((response) => response.text())),
		).toEqual(expect.arrayContaining(["OK", "Already processed"]));
		expect(enqueued).toHaveLength(1);
	});

	it("responds before awaiting the async domain processor", async () => {
		let startedJobs = 0;
		let buttonDispatcherWasCalled = false;
		const app = createApp(env, {
			enqueue(handler, payload) {
				startedJobs += 1;
				void handler(payload);
			},
			async buttonDispatcher() {
				buttonDispatcherWasCalled = true;
				await new Promise(() => {
					/* intentionally never resolves */
				});
			},
		});
		const body = JSON.stringify({
			event: "whatsapp.message.received",
			message: {
				id: "wamid.fast-response",
				from: "15551234567",
				type: "interactive",
				interactive: {
					type: "button_reply",
					button_reply: { id: "confirm_import:batch-1", title: "Confirm" },
				},
			},
		});
		const signature = sign(body, env.kapsoWebhookSecret);

		const response = await app.request("/webhook", {
			method: "POST",
			body,
			headers: { "x-webhook-signature": signature },
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
		expect(startedJobs).toBe(1);
		await waitFor(() => buttonDispatcherWasCalled);
	});

	it("accepts valid events on both webhook routes", async () => {
		const app = createApp(env);
		const body = JSON.stringify({
			event: "whatsapp.message.received",
			message: {
				id: "wamid.alias",
				from: "15551234567",
				type: "text",
				text: { body: "hola" },
			},
		});
		const signature = sign(body, env.kapsoWebhookSecret);

		const canonical = await app.request("/webhook", {
			method: "POST",
			body,
			headers: {
				"x-webhook-signature": signature,
				"x-idempotency-key": "idem_route_webhook",
			},
		});
		const alias = await app.request("/api/webhook", {
			method: "POST",
			body,
			headers: {
				"x-webhook-signature": signature,
				"x-idempotency-key": "idem_route_api_webhook",
			},
		});

		expect(canonical.status).toBe(200);
		expect(await canonical.text()).toBe("OK");
		expect(alias.status).toBe(200);
		expect(await alias.text()).toBe("OK");
	});

	it("ignores unsupported events without enqueueing processing", async () => {
		const enqueued: unknown[] = [];
		const app = createApp(env, {
			enqueue(_handler, payload) {
				enqueued.push(payload);
			},
		});
		const body = JSON.stringify({ event: "whatsapp.message.status.updated" });
		const signature = sign(body, env.kapsoWebhookSecret);

		const response = await app.request("/webhook", {
			method: "POST",
			body,
			headers: { "x-webhook-signature": signature },
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("OK");
		expect(enqueued).toEqual([]);
	});
});

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("condition was not met");
}

function sign(rawBody: string, signingKey: string): string {
	return createHmac("sha256", signingKey).update(rawBody).digest("hex");
}
