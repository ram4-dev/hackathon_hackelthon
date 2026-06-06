import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
	it("supports opencode provider configuration", () => {
		vi.stubEnv("AI_PROVIDER", "opencode");
		vi.stubEnv("AI_MODEL", "deepseek-v4-flash");
		const fakeSigningValue = ["redacted", "test", "value"].join("-");
		vi.stubEnv("OPENCODE_API_KEY", fakeSigningValue);
		vi.stubEnv("OPENCODE_BASE_URL", "https://opencode.ai/zen/go/v1");

		expect(loadEnv()).toMatchObject({
			aiProvider: "opencode",
			aiModel: "deepseek-v4-flash",
			opencodeApiKey: fakeSigningValue,
			opencodeBaseUrl: "https://opencode.ai/zen/go/v1",
		});

		vi.unstubAllEnvs();
	});
});
