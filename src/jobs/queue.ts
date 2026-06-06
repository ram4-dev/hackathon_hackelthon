export type JobHandler<T> = (payload: T) => Promise<void>;

export function enqueue<T>(handler: JobHandler<T>, payload: T): void {
	setImmediate(() => {
		handler(payload).catch((error: unknown) => {
			console.error("Async job failed", error);
		});
	});
}
