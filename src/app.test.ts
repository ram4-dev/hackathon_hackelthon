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
		const app = createApp(env);
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
	});
});

function sign(rawBody: string, signingKey: string): string {
	return createHmac("sha256", signingKey).update(rawBody).digest("hex");
}
