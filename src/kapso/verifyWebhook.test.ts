import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyKapsoSignature } from "./verifyWebhook.js";

describe("verifyKapsoSignature", () => {
	it("accepts a valid HMAC SHA256 signature", () => {
		const rawBody = JSON.stringify({ hello: "world" });
		const signingKey = ["test", "signing", "key"].join("-");
		const signature = createHmac("sha256", signingKey)
			.update(rawBody)
			.digest("hex");

		expect(
			verifyKapsoSignature({ rawBody, signature, secret: signingKey }),
		).toBe(true);
		expect(
			verifyKapsoSignature({
				rawBody,
				signature: `sha256=${signature}`,
				secret: signingKey,
			}),
		).toBe(true);
	});

	it("rejects invalid signatures", () => {
		const signingKey = ["test", "signing", "key"].join("-");
		expect(
			verifyKapsoSignature({
				rawBody: "{}",
				signature: "bad",
				secret: signingKey,
			}),
		).toBe(false);
		expect(
			verifyKapsoSignature({
				rawBody: "{}",
				signature: "",
				secret: signingKey,
			}),
		).toBe(false);
	});
});
