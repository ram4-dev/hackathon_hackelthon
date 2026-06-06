import { describe, expect, it } from "vitest";
import { appendBlock, parseBlocks } from "./markdownBlocks.js";

describe("markdown blocks", () => {
	it("appends and parses fenced text blocks", () => {
		const markdown = appendBlock("", {
			id: "stg_1",
			metadata: {
				source_type: "audio",
				created_at: "2026-06-06T00:00:00.000Z",
			},
			body: "Hay que llamar a donantes",
		});

		expect(parseBlocks(markdown)).toEqual([
			{
				id: "stg_1",
				metadata: {
					source_type: "audio",
					created_at: "2026-06-06T00:00:00.000Z",
				},
				body: "Hay que llamar a donantes",
			},
		]);
	});
});
