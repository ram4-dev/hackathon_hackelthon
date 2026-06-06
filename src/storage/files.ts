import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { markdownWriteMutex } from "./mutex.js";

export async function readTextFile(path: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return "";
		throw error;
	}
}

export async function writeTextFile(
	path: string,
	content: string,
): Promise<void> {
	await markdownWriteMutex.runExclusive(async () => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content, "utf8");
	});
}

export async function updateTextFile(
	path: string,
	updater: (current: string) => string | Promise<string>,
): Promise<void> {
	await markdownWriteMutex.runExclusive(async () => {
		await mkdir(dirname(path), { recursive: true });
		const current = await readTextFile(path);
		const next = await updater(current);
		await writeFile(path, next, "utf8");
	});
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
