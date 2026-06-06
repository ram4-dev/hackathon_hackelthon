import type { ConversationState, Member } from "./types.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import { normalizePhone } from "../storage/markdownStore.js";

export type KnownTenantContext = {
	kind: "known";
	phone: string;
	orgId: string;
	memberId: string;
	role: string;
	member: Member;
	state: ConversationState | null;
};

export type UnknownTenantContext = {
	kind: "unknown";
	phone: string;
	state: ConversationState | null;
};

export type TenantContext = KnownTenantContext | UnknownTenantContext;

export async function resolveTenant(
	store: MarkdownStore,
	phone: string,
): Promise<TenantContext> {
	const normalized = normalizePhone(phone);
	const [member, state] = await Promise.all([
		store.getMemberByPhone(normalized),
		store.getConversationState(normalized),
	]);

	if (!member) {
		return { kind: "unknown", phone: normalized, state };
	}

	return {
		kind: "known",
		phone: normalized,
		orgId: member.orgId,
		memberId: member.id,
		role: member.role,
		member,
		state,
	};
}
