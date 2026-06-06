import { randomUUID } from "node:crypto";

export type IdPrefix = "org" | "mem" | "task" | "stg" | "batch" | "rem" | "evt";

export function makeId(prefix: IdPrefix): string {
	return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function makeInviteCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let index = 0; index < 6; index += 1) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
}
