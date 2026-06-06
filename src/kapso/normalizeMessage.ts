import type { SourceType } from "../domain/types.js";
import { normalizePhone } from "../storage/markdownStore.js";

export type KapsoWebhookPayload = {
	event?: string;
	message?: {
		id?: string;
		type?: string;
		from?: string;
		text?: { body?: string };
		interactive?: {
			type?: string;
			button_reply?: { id?: string; title?: string };
			list_reply?: { id?: string; title?: string };
		};
		kapso?: {
			content?: string;
			transcript?: { text?: string };
			media_url?: string;
			media_data?: {
				url?: string;
				filename?: string;
				content_type?: string;
				byte_size?: number;
			};
		};
	};
	conversation?: {
		phone_number?: string;
	};
	phone_number_id?: string;
};

export type NormalizedMessage = {
	messageId: string;
	from: string;
	type: string;
	text: string;
	sourceType: SourceType;
	mediaRef: string | null;
	interactiveId?: string;
	interactiveTitle?: string;
};

export function normalizeKapsoMessage(
	payload: KapsoWebhookPayload,
): NormalizedMessage | null {
	const message = payload.message;
	if (!message) return null;

	const from = message.from ?? payload.conversation?.phone_number;
	if (!from) return null;

	const type = message.type ?? "unknown";
	const interactive = getInteractiveSelection(message.interactive);
	const transcript =
		type === "audio" ? message.kapso?.transcript?.text : undefined;
	const text =
		transcript ??
		message.kapso?.content ??
		message.text?.body ??
		interactive?.title ??
		"";

	return {
		messageId: message.id ?? "",
		from: normalizePhone(from),
		type,
		text,
		sourceType: toSourceType(type),
		mediaRef:
			message.kapso?.media_data?.url ?? message.kapso?.media_url ?? null,
		interactiveId: interactive?.id,
		interactiveTitle: interactive?.title,
	};
}

type KapsoInteractive = NonNullable<
	NonNullable<KapsoWebhookPayload["message"]>["interactive"]
>;

function getInteractiveSelection(interactive: KapsoInteractive | undefined) {
	if (!interactive) return undefined;
	if ("button_reply" in interactive && interactive.button_reply?.id) {
		return {
			id: interactive.button_reply.id,
			title: interactive.button_reply.title ?? interactive.button_reply.id,
		};
	}
	if ("list_reply" in interactive && interactive.list_reply?.id) {
		return {
			id: interactive.list_reply.id,
			title: interactive.list_reply.title ?? interactive.list_reply.id,
		};
	}
	return undefined;
}

function toSourceType(type: string): SourceType {
	if (
		type === "text" ||
		type === "audio" ||
		type === "image" ||
		type === "document" ||
		type === "video" ||
		type === "interactive"
	) {
		return type;
	}
	return "unknown";
}
