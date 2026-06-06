import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyKapsoSignature(input: {
	rawBody: string;
	signature: string | null | undefined;
	secret: string;
}): boolean {
	if (!input.signature || !input.secret) return false;

	const expected = createHmac("sha256", input.secret)
		.update(input.rawBody)
		.digest("hex");
	const received = stripSignaturePrefix(input.signature.trim());

	const expectedBuffer = Buffer.from(expected, "hex");
	const receivedBuffer = Buffer.from(received, "hex");

	if (expectedBuffer.length !== receivedBuffer.length) return false;
	return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function stripSignaturePrefix(signature: string): string {
	return signature.startsWith("sha256=")
		? signature.slice("sha256=".length)
		: signature;
}
