import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OutboundClient } from "../kapso/client.js";
import { MarkdownStore } from "../storage/markdownStore.js";
import { handleOnboarding } from "./onboarding.js";
import type { UnknownTenantContext } from "./tenant.js";

class FakeOutbound implements OutboundClient {
	texts: Array<{ to: string; body: string }> = [];
	async sendText(to: string, body: string) {
		this.texts.push({ to, body });
	}
	async sendButtons() {
		/* not used */
	}
	async sendList() {
		/* not used */
	}
	async sendTemplate() {
		/* not used */
	}
}

let dir: string;
let store: MarkdownStore;
let outbound: FakeOutbound;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "kapso-onboarding-"));
	store = new MarkdownStore(dir);
	outbound = new FakeOutbound();
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("handleOnboarding", () => {
	it("asks for org name when creating without inline name", async () => {
		await handleOnboarding(message("Quiero registrar mi ONG"), tenant(), {
			store,
			outbound,
		});

		await expect(store.getConversationState("111")).resolves.toMatchObject({
			mode: "onboarding",
			step: "awaiting_org_name",
		});
		expect(outbound.texts.at(-1)?.body).toContain("Cómo se llama");
	});

	it("creates org and moves admin to import after receiving org name", async () => {
		await handleOnboarding(
			message("Fundación Demo"),
			{
				...tenant(),
				state: {
					phone: "111",
					orgId: null,
					mode: "onboarding",
					step: "awaiting_org_name",
					scratch: {},
					updatedAt: new Date().toISOString(),
				},
			},
			{ store, outbound, publicWhatsAppNumber: "15551234567" },
		);

		const admin = await store.getMemberByPhone("111");
		expect(admin?.role).toBe("admin");
		await expect(store.getConversationState("111")).resolves.toMatchObject({
			mode: "import",
			orgId: admin?.orgId,
		});
		expect(outbound.texts.at(-1)?.body).toContain("https://wa.me/15551234567");
	});

	it("joins an existing org via invite code", async () => {
		const { org } = await store.createOrgWithAdmin({
			name: "Org",
			adminPhone: "999",
			adminName: "Admin",
		});
		await handleOnboarding(message(`UNIRME ${org.inviteCode}`), tenant(), {
			store,
			outbound,
		});
		const state = await store.getConversationState("111");

		await handleOnboarding(
			message("Beto"),
			{ ...tenant(), state },
			{ store, outbound },
		);

		const member = await store.getMemberByPhone("111");
		expect(member).toMatchObject({ name: "Beto", orgId: org.id });
		await expect(store.getConversationState("111")).resolves.toMatchObject({
			mode: "active",
		});
	});
});

function message(text: string) {
	return {
		messageId: "m1",
		from: "111",
		type: "text",
		text,
		sourceType: "text" as const,
		mediaRef: null,
	};
}

function tenant(
	state: UnknownTenantContext["state"] = null,
): UnknownTenantContext {
	return { kind: "unknown", phone: "111", state };
}
