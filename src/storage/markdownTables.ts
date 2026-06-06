export type MarkdownRow = Record<string, string>;

const EMPTY_PLACEHOLDER = "";

export function escapeCell(value: unknown): string {
	return String(value ?? EMPTY_PLACEHOLDER)
		.replaceAll("\\", "\\\\")
		.replaceAll("|", "\\|")
		.replaceAll("\n", "<br>")
		.trim();
}

export function unescapeCell(value: string): string {
	return value
		.trim()
		.replaceAll("<br>", "\n")
		.replace(/\\\|/g, "|")
		.replace(/\\\\/g, "\\");
}

export function serializeTable(headers: string[], rows: MarkdownRow[]): string {
	const headerLine = `| ${headers.map(escapeCell).join(" | ")} |`;
	const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
	const rowLines = rows.map(
		(row) =>
			`| ${headers.map((header) => escapeCell(row[header] ?? "")).join(" | ")} |`,
	);
	return [headerLine, separatorLine, ...rowLines, ""].join("\n");
}

export function parseTable(markdown: string): MarkdownRow[] {
	const lines = markdown
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith("|") && line.endsWith("|"));

	if (lines.length < 2) return [];

	const headers = splitTableLine(lines[0]).map(unescapeCell);
	return lines.slice(2).map((line) => {
		const cells = splitTableLine(line).map(unescapeCell);
		return Object.fromEntries(
			headers.map((header, index) => [header, cells[index] ?? ""]),
		);
	});
}

function splitTableLine(line: string): string[] {
	const body = line.replace(/^\|/, "").replace(/\|$/, "");
	const cells: string[] = [];
	let current = "";
	let escaped = false;

	for (const char of body) {
		if (escaped) {
			current += `\\${char}`;
			escaped = false;
			continue;
		}

		if (char === "\\") {
			escaped = true;
			continue;
		}

		if (char === "|") {
			cells.push(current.trim());
			current = "";
			continue;
		}

		current += char;
	}

	if (escaped) current += "\\";
	cells.push(current.trim());
	return cells;
}
