import type { OutboundClient } from "../kapso/client.js";
import type { NormalizedMessage } from "../kapso/normalizeMessage.js";
import type { MarkdownStore } from "../storage/markdownStore.js";
import { resolveTenant, type KnownTenantContext } from "./tenant.js";
import type {
	ImportStagingItem,
	PendingImportBatch,
	PendingImportMember,
	PendingImportTask,
} from "./types.js";

const IMPORT_ACK = "✓ recibido";

export type ImportExtractionResult = {
	tasks: PendingImportTask[];
	members: PendingImportMember[];
};

export type ImportExtractor = (
	items: ImportStagingItem[],
	context: { orgId: string; actorPhone: string },
) => Promise<ImportExtractionResult>;

export type ImportModeDeps = {
	store: MarkdownStore;
	outbound: OutboundClient;
	importExtractor?: ImportExtractor;
};

export async function handleImportMode(
	message: NormalizedMessage,
	tenant: KnownTenantContext,
	deps: ImportModeDeps,
): Promise<void> {
	if (isListo(message.text)) {
		await createPendingImportBatch(message, tenant, deps);
		return;
	}

	await deps.store.appendImportItem({
		orgId: tenant.orgId,
		sourceType: message.sourceType,
		rawText: message.text,
		mediaRef: message.mediaRef,
	});
	await deps.outbound.sendText(message.from, IMPORT_ACK);
}

export async function handleImportButton(
	waPhone: string,
	id: string,
	deps: Pick<ImportModeDeps, "store" | "outbound">,
): Promise<boolean> {
	const action = parseImportButtonId(id);
	if (!action) return false;

	const tenant = await resolveTenant(deps.store, waPhone);
	if (tenant.kind !== "known") {
		await deps.outbound.sendText(
			waPhone,
			"No pude encontrar tu organización para procesar esa importación.",
		);
		return true;
	}

	if (action.type === "confirm") {
		await confirmImportBatch(waPhone, tenant, action.batchId, deps);
		return true;
	}

	await cancelImportBatch(waPhone, tenant, action.batchId, deps);
	return true;
}

export async function deterministicImportExtractor(
	items: ImportStagingItem[],
): Promise<ImportExtractionResult> {
	return {
		tasks: items
			.map((item) => item.rawText.trim())
			.filter((title) => title.length > 0)
			.map((title) => ({
				title,
				assignee: null,
				dueDate: null,
				priority: "med",
			})),
		members: [],
	};
}

function isListo(text: string): boolean {
	return text.trim().toUpperCase() === "LISTO";
}

async function createPendingImportBatch(
	message: NormalizedMessage,
	tenant: KnownTenantContext,
	deps: ImportModeDeps,
): Promise<void> {
	const items = await deps.store.getImportItems(tenant.orgId);
	if (items.length === 0) {
		await deps.outbound.sendText(
			message.from,
			"Todavía no tengo elementos para importar. Mandame mensajes y después escribí LISTO.",
		);
		return;
	}

	const extractor = deps.importExtractor ?? deterministicImportExtractor;
	const extracted = await extractor(items, {
		orgId: tenant.orgId,
		actorPhone: tenant.phone,
	});
	const batch = await deps.store.savePendingBatch({
		orgId: tenant.orgId,
		tasks: extracted.tasks,
		members: extracted.members,
	});

	await deps.outbound.sendButtons(
		message.from,
		formatBatchSummary(batch),
		[
			{ id: `confirm_import:${batch.id}`, title: "Confirmar" },
			{ id: `cancel_import:${batch.id}`, title: "Cancelar" },
		],
	);
}

async function confirmImportBatch(
	waPhone: string,
	tenant: KnownTenantContext,
	batchId: string,
	deps: Pick<ImportModeDeps, "store" | "outbound">,
): Promise<void> {
	const batch = await deps.store.getPendingBatch(tenant.orgId, batchId);
	if (!batch || batch.status !== "pending") {
		await deps.outbound.sendText(
			waPhone,
			"No encontré una importación pendiente para confirmar.",
		);
		return;
	}

	const applied = await deps.store.applyImportBatch(tenant.orgId, batchId);
	await deps.store.setConversationState({
		phone: tenant.phone,
		orgId: tenant.orgId,
		mode: "active",
		step: "active",
		scratch: {},
		updatedAt: new Date().toISOString(),
	});
	await deps.outbound.sendText(
		waPhone,
		`Importación confirmada ✅ ${applied.tasks.length} tarea(s) creada(s).`,
	);
}

async function cancelImportBatch(
	waPhone: string,
	tenant: KnownTenantContext,
	batchId: string,
	deps: Pick<ImportModeDeps, "store" | "outbound">,
): Promise<void> {
	const batch = await deps.store.getPendingBatch(tenant.orgId, batchId);
	if (!batch || batch.status !== "pending") {
		await deps.outbound.sendText(
			waPhone,
			"No encontré una importación pendiente para cancelar.",
		);
		return;
	}

	await deps.store.updateBatchStatus(tenant.orgId, batchId, "cancelled");
	await deps.outbound.sendText(
		waPhone,
		"Importación cancelada. Conservé los mensajes originales por si querés revisarlos.",
	);
}

function parseImportButtonId(
	id: string,
): { type: "confirm" | "cancel"; batchId: string } | null {
	const [prefix, batchId] = id.split(":", 2);
	if (!batchId) return null;
	if (prefix === "confirm_import") return { type: "confirm", batchId };
	if (prefix === "cancel_import") return { type: "cancel", batchId };
	return null;
}

function formatBatchSummary(batch: PendingImportBatch): string {
	const taskLabel = batch.tasks.length === 1 ? "tarea" : "tareas";
	const memberPart =
		batch.members.length > 0
			? ` y ${batch.members.length} integrante(s)`
			: "";
	return `Encontré ${batch.tasks.length} ${taskLabel}${memberPart}. ¿Confirmás la importación?`;
}
