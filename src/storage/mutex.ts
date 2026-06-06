export class AsyncMutex {
	private current: Promise<void> = Promise.resolve();

	async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
		let release!: () => void;
		const previous = this.current;
		this.current = new Promise<void>((resolve) => {
			release = resolve;
		});

		await previous;

		try {
			return await fn();
		} finally {
			release();
		}
	}
}

export const markdownWriteMutex = new AsyncMutex();
