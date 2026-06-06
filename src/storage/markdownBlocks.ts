export type MarkdownBlock = {
	id: string;
	metadata: Record<string, string>;
	body: string;
};

export function appendBlock(markdown: string, block: MarkdownBlock): string {
	const prefix = markdown.trimEnd();
	const serialized = serializeBlock(block);
	return `${prefix ? `${prefix}\n\n` : ""}${serialized}\n`;
}

export function serializeBlock(block: MarkdownBlock): string {
	const metadata = Object.entries(block.metadata)
		.map(([key, value]) => `- ${key}: ${value}`)
		.join("\n");

	return [
		`## ${block.id}`,
		"",
		metadata,
		"",
		"```text",
		block.body.replaceAll("```", "`\u200b``"),
		"```",
	].join("\n");
}

export function parseBlocks(markdown: string): MarkdownBlock[] {
	const sections = markdown
		.split(/^##\s+/m)
		.filter((section) => section.trim().length > 0);

	return sections.map((section) => {
		const [rawId = "", ...rest] = section.split(/\r?\n/);
		const content = rest.join("\n");
		const metadata: Record<string, string> = {};

		for (const match of content.matchAll(/^-\s+([^:]+):\s*(.*)$/gm)) {
			metadata[match[1].trim()] = match[2].trim();
		}

		const bodyMatch = content.match(/```text\n([\s\S]*?)\n```/);
		return {
			id: rawId.trim(),
			metadata,
			body: (bodyMatch?.[1] ?? "").replaceAll("`\u200b``", "```"),
		};
	});
}
