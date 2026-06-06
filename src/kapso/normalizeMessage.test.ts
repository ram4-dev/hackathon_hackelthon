import { describe, expect, it } from "vitest";
import { normalizeKapsoMessage } from "./normalizeMessage.js";

describe("normalizeKapsoMessage", () => {
	it("uses audio transcript first", () => {
		expect(
			normalizeKapsoMessage({
				message: {
					id: "wamid.1",
					from: "+54 9 11 1234-5678",
					type: "audio",
					kapso: {
						content: "fallback",
						transcript: { text: "transcribed audio" },
					},
				},
			}),
		).toMatchObject({
			from: "5491112345678",
			sourceType: "audio",
			text: "transcribed audio",
		});
	});

	it("uses kapso content for media messages", () => {
		expect(
			normalizeKapsoMessage({
				message: {
					id: "wamid.2",
					from: "15551234567",
					type: "document",
					kapso: {
						content: "PDF summary",
						media_data: { url: "https://example.test/file.pdf" },
					},
				},
			}),
		).toMatchObject({
			sourceType: "document",
			text: "PDF summary",
			mediaRef: "https://example.test/file.pdf",
		});
	});

	it("extracts interactive button IDs", () => {
		expect(
			normalizeKapsoMessage({
				message: {
					id: "wamid.3",
					from: "1",
					type: "interactive",
					interactive: {
						type: "button_reply",
						button_reply: { id: "confirm_import:batch_1", title: "Confirmar" },
					},
				},
			}),
		).toMatchObject({
			interactiveId: "confirm_import:batch_1",
			text: "Confirmar",
		});
	});
});
