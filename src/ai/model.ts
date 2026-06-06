import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AppEnv } from "../env.js";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_OPENCODE_MODEL = "deepseek-v4-flash";

export function createLanguageModel(env: AppEnv): LanguageModel {
	switch (env.aiProvider) {
		case "anthropic":
			return anthropic(env.aiModel ?? DEFAULT_ANTHROPIC_MODEL);
		case "opencode":
			return createOpenCodeProvider(env)(env.aiModel ?? DEFAULT_OPENCODE_MODEL);
		case "openai":
		default:
			return openai(env.aiModel ?? DEFAULT_OPENAI_MODEL);
	}
}

export function createOpenCodeProvider(
	env: Pick<AppEnv, "opencodeApiKey" | "opencodeBaseUrl">,
) {
	return createOpenAICompatible({
		name: "opencode",
		apiKey: env.opencodeApiKey,
		baseURL: env.opencodeBaseUrl,
		includeUsage: true,
	});
}
