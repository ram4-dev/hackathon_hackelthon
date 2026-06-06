import type { OutboundClient } from "../kapso/client.js";
import type { NormalizedMessage } from "../kapso/normalizeMessage.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import type { UnknownTenantContext } from "./tenant.js";

export type OnboardingDeps = {
	store: MarkdownStore;
	outbound: OutboundClient;
	publicWhatsAppNumber?: string;
};

export async function handleOnboarding(
	message: NormalizedMessage,
	tenant: UnknownTenantContext,
	deps: OnboardingDeps,
): Promise<void> {
	const text = message.text.trim();
	const state = tenant.state;

	if (state?.step === "awaiting_org_name") {
		await createOrgFromName(text, tenant.phone, deps);
		return;
	}

	if (state?.step === "awaiting_join_name") {
		const inviteCode = String(state.scratch.inviteCode ?? "");
		await joinOrgWithName(
			{ inviteCode, name: text, phone: tenant.phone },
			deps,
		);
		return;
	}

	const joinMatch = text.match(/^UNIRME\s+([A-Z0-9]{4,12})$/i);
	if (joinMatch) {
		const inviteCode = joinMatch[1].toUpperCase();
		const org = await deps.store.findOrgByInviteCode(inviteCode);
		if (!org) {
			await deps.outbound.sendText(
				tenant.phone,
				"No encontré ese código. Revisalo y probá de nuevo.",
			);
			return;
		}

		await deps.store.setConversationState({
			phone: tenant.phone,
			orgId: org.id,
			mode: "onboarding",
			step: "awaiting_join_name",
			scratch: { inviteCode },
			updatedAt: new Date().toISOString(),
		});
		await deps.outbound.sendText(tenant.phone, "Perfecto. ¿Cómo te llamás?");
		return;
	}

	if (/registrar\s+mi\s+ong/i.test(text) || /crear\s+ong/i.test(text)) {
		const inlineName = text
			.replace(/quiero\s+registrar\s+mi\s+ong/i, "")
			.replace(/crear\s+ong/i, "")
			.trim();
		if (inlineName) {
			await createOrgFromName(inlineName, tenant.phone, deps);
			return;
		}

		await deps.store.setConversationState({
			phone: tenant.phone,
			orgId: null,
			mode: "onboarding",
			step: "awaiting_org_name",
			scratch: {},
			updatedAt: new Date().toISOString(),
		});
		await deps.outbound.sendText(tenant.phone, "Dale. ¿Cómo se llama tu ONG?");
		return;
	}

	await deps.outbound.sendText(
		tenant.phone,
		"Para empezar, mandá “Quiero registrar mi ONG” o “UNIRME ABC123”.",
	);
}

async function createOrgFromName(
	name: string,
	phone: string,
	deps: OnboardingDeps,
): Promise<void> {
	if (!name.trim()) {
		await deps.outbound.sendText(
			phone,
			"Necesito el nombre de la ONG para crearla.",
		);
		return;
	}

	const { org } = await deps.store.createOrgWithAdmin({
		name: name.trim(),
		adminPhone: phone,
		adminName: "Admin",
		adminRole: "admin",
	});
	await deps.store.setConversationState({
		phone,
		orgId: org.id,
		mode: "import",
		step: "collecting",
		scratch: {},
		updatedAt: new Date().toISOString(),
	});

	const link = buildInviteLink(deps.publicWhatsAppNumber, org.inviteCode);
	await deps.outbound.sendText(
		phone,
		`Listo, registré ${org.name}.\nCódigo: ${org.inviteCode}\nInvitación: ${link}\nAhora mandame audios, textos o archivos con las tareas. Cuando termines, escribí LISTO.`,
	);
}

async function joinOrgWithName(
	input: { inviteCode: string; name: string; phone: string },
	deps: OnboardingDeps,
): Promise<void> {
	const org = await deps.store.findOrgByInviteCode(input.inviteCode);
	if (!org) {
		await deps.outbound.sendText(
			input.phone,
			"No encontré ese código. Pedile al admin que te lo reenvíe.",
		);
		return;
	}

	const member = await deps.store.joinOrg({
		orgId: org.id,
		phone: input.phone,
		name: input.name.trim() || "Miembro",
		role: "member",
	});
	await deps.store.setConversationState({
		phone: input.phone,
		orgId: org.id,
		mode: "active",
		step: "ready",
		scratch: {},
		updatedAt: new Date().toISOString(),
	});
	await deps.outbound.sendText(
		input.phone,
		`Listo ${member.name}, ya estás en ${org.name}. Podés crear, listar o completar tareas por acá.`,
	);
}

function buildInviteLink(
	publicWhatsAppNumber: string | undefined,
	inviteCode: string,
): string {
	const number = publicWhatsAppNumber?.replace(/\D/g, "") || "<numero>";
	return `https://wa.me/${number}?text=UNIRME%20${encodeURIComponent(inviteCode)}`;
}
