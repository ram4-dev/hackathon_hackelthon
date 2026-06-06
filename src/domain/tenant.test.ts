import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarkdownStore } from "../storage/markdownStore.js";
import { routeInboundMessage } from "./stateMachine.js";

let dir: string;
let store: MarkdownStore;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "kapso-tenant-"));
	store = new MarkdownStore(dir);
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("tenant routing", () => {
	it("routes known members to their own org on every message", async () => {
		const orgA = await store.createOrgWithAdmin({
			name: "Org A",
			adminPhone: "111",
			adminName: "Ana",
		});
		const orgB = await store.createOrgWithAdmin({
			name: "Org B",
			adminPhone: "222",
			adminName: "Beto",
		});

		const routedA = await routeInboundMessage(store, {
			messageId: "a",
			from: "111",
			type: "text",
			text: "hola",
			sourceType: "text",
			mediaRef: null,
		});
		const routedB = await routeInboundMessage(store, {
			messageId: "b",
			from: "222",
			type: "text",
			text: "hola",
			sourceType: "text",
			mediaRef: null,
		});

		expect(routedA).toMatchObject({
			mode: "active",
			tenant: { kind: "known", orgId: orgA.org.id },
		});
		expect(routedB).toMatchObject({
			mode: "active",
			tenant: { kind: "known", orgId: orgB.org.id },
		});
	});

	it("routes unknown senders to onboarding", async () => {
		await expect(
			routeInboundMessage(store, {
				messageId: "x",
				from: "333",
				type: "text",
				text: "hola",
				sourceType: "text",
				mediaRef: null,
			}),
		).resolves.toMatchObject({
			mode: "onboarding",
			tenant: { kind: "unknown", phone: "333" },
		});
	});

	it("preserves import state for a known admin", async () => {
		const { org } = await store.createOrgWithAdmin({
			name: "Org",
			adminPhone: "111",
			adminName: "Ana",
		});
		await store.setConversationState({
			phone: "111",
			orgId: org.id,
			mode: "import",
			step: "collecting",
			scratch: {},
			updatedAt: new Date().toISOString(),
		});

		await expect(
			routeInboundMessage(store, {
				messageId: "a",
				from: "111",
				type: "text",
				text: "dump",
				sourceType: "text",
				mediaRef: null,
			}),
		).resolves.toMatchObject({ mode: "import" });
	});
});
