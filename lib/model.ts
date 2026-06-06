// lib/model.ts — selección de proveedor para el AI SDK.
// SPEC-00 §7 usa ANTHROPIC_API_KEY + LLM_MODEL; el repo además trae AI_PROVIDER /
// AI_MODEL (.env.example, default opencode). Soportamos ambos: default anthropic
// claude-opus-4-8, con opencode/openai como alternativas.

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

type Provider = "anthropic" | "openai" | "opencode";

const DEFAULT_MODEL: Record<Provider, string> = {
	anthropic: "claude-opus-4-8",
	openai: "gpt-4.1-mini",
	opencode: "deepseek-v4-flash",
};

function parseProvider(value: string | undefined): Provider {
	if (value === "openai") return "openai";
	if (value === "opencode") return "opencode";
	return "anthropic";
}

/** Modelo de lenguaje para `generateText` / `generateObject`. */
export function createModel(): LanguageModel {
	const provider = parseProvider(process.env.AI_PROVIDER ?? process.env.LLM_PROVIDER);
	const modelId = process.env.LLM_MODEL || process.env.AI_MODEL || DEFAULT_MODEL[provider];

	switch (provider) {
		case "openai":
			return openai(modelId);
		case "opencode":
			return createOpenAICompatible({
				name: "opencode",
				apiKey: process.env.OPENCODE_API_KEY,
				baseURL: process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/zen/go/v1",
				includeUsage: true,
			})(modelId);
		default:
			return anthropic(modelId);
	}
}
