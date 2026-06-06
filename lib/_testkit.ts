// Helpers de test (no es *.test.ts → vitest no lo corre como suite).
// Arma un MockLanguageModelV3 (ai/test) con resultados scripteados, para probar el
// agente y las funciones LLM sin API real ni claves.

import type { LanguageModelV3Content, LanguageModelV3GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";

const ZERO_USAGE = {
	inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function gen(content: LanguageModelV3Content[], unified: "stop" | "tool-calls"): LanguageModelV3GenerateResult {
	return {
		content,
		finishReason: { unified, raw: unified === "tool-calls" ? "tool_use" : "end_turn" },
		usage: ZERO_USAGE,
		warnings: [],
	};
}

/** Un step que llama a una tool con `input`. */
export function toolCall(toolName: string, input: unknown, toolCallId = `call_${toolName}`): LanguageModelV3GenerateResult {
	return gen([{ type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) }], "tool-calls");
}

/** Un step que devuelve texto final. */
export function textStep(text: string): LanguageModelV3GenerateResult {
	return gen([{ type: "text", text }], "stop");
}

/** Un step que devuelve un objeto JSON (para generateObject). */
export function objectStep(obj: unknown): LanguageModelV3GenerateResult {
	return gen([{ type: "text", text: JSON.stringify(obj) }], "stop");
}

/** Modelo mock que devuelve los `results` en secuencia (repite el último si se piden más). */
export function mockModel(...results: LanguageModelV3GenerateResult[]): MockLanguageModelV3 {
	let i = 0;
	return new MockLanguageModelV3({
		doGenerate: async () => results[Math.min(i++, results.length - 1)],
	});
}
