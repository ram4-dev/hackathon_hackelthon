import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "./markdownTables.js";

const headers = ["id", "title", "notes"];

describe("markdown tables", () => {
	it("round-trips escaped pipes and newlines", () => {
		const markdown = serializeTable(headers, [
			{ id: "task_1", title: "Call A | B", notes: "line 1\nline 2" },
		]);

		expect(parseTable(markdown)).toEqual([
			{ id: "task_1", title: "Call A | B", notes: "line 1\nline 2" },
		]);
	});
});
