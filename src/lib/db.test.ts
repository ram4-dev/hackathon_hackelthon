import { describe, expect, it, vi, beforeEach } from 'vitest';
import { db, supabase } from './db.js';

vi.mock('@supabase/supabase-js', () => {
	const mockSupabase = {
		from: vi.fn(),
	};
	return {
		createClient: vi.fn(() => mockSupabase),
	};
});

describe('db people functions (SPEC-D.3)', () => {
	let mockFrom: any;
	let mockSelect: any;
	let mockEq: any;
	let mockMaybeSingle: any;
	let mockSingle: any;
	let mockUpdate: any;
	let mockInsert: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSingle = vi.fn();
		mockMaybeSingle = vi.fn();

		mockEq = vi.fn().mockImplementation(function (this: any) {
			return {
				maybeSingle: mockMaybeSingle,
				select: vi.fn().mockReturnValue({ single: mockSingle }),
				single: mockSingle,
				eq: mockEq,
				then: (resolve: any) => resolve({ data: [], error: null }),
			};
		});

		mockSelect = vi.fn().mockReturnValue({
			eq: mockEq,
			maybeSingle: mockMaybeSingle,
			single: mockSingle,
		});

		mockUpdate = vi.fn().mockReturnValue({
			eq: mockEq,
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});

		mockInsert = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});

		mockFrom = vi.fn().mockReturnValue({
			select: mockSelect,
			update: mockUpdate,
			insert: mockInsert,
		});

		(supabase.from as any) = mockFrom;
	});

	it('upsertPerson inserts with defaults if person does not exist', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		mockSingle.mockResolvedValue({
			data: { wa_phone: '549111', name: '549111', capacity: 'media', skills: [], is_coordinator: false },
			error: null,
		});

		await db.upsertPerson({ wa_phone: '549111' });

		expect(mockFrom).toHaveBeenCalledWith('people');
		expect(mockInsert).toHaveBeenCalledWith({
			wa_phone: '549111',
			name: '549111',
			role: undefined,
			skills: [],
			capacity: 'media',
			is_coordinator: false,
			active: true,
			timezone: 'America/Argentina/Buenos_Aires',
		});
	});

	it('upsertPerson updates merging existing fields if person exists', async () => {
		mockMaybeSingle.mockResolvedValue({ data: { wa_phone: '549111', name: 'Old' }, error: null });
		mockSingle.mockResolvedValue({ data: { wa_phone: '549111', name: 'New' }, error: null });

		await db.upsertPerson({ wa_phone: '549111', name: 'New', capacity: 'alta' });

		expect(mockUpdate).toHaveBeenCalledWith({
			name: 'New',
			capacity: 'alta',
		});
	});

	it('upsertPerson preserves all fields if nothing to update', async () => {
		const existing = { wa_phone: '549111', name: 'Old' };
		mockMaybeSingle.mockResolvedValue({ data: existing, error: null });

		const result = await db.upsertPerson({ wa_phone: '549111' });

		expect(mockUpdate).not.toHaveBeenCalled();
		expect(result).toBe(existing);
	});

	it('getPersonByPhone returns null when missing', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		const res = await db.getPersonByPhone('999');
		expect(res).toBeNull();
	});

	it('listCoordinators filters by is_coordinator and active', async () => {
		// Mock the specific chain for listCoordinators: select -> eq -> eq
		const chainEq2 = {
			then: (resolve: any) => resolve({ data: [{ id: '1' }], error: null }),
		};
		const chainEq1 = { eq: vi.fn().mockReturnValue(chainEq2) };
		mockSelect.mockReturnValue({ eq: vi.fn().mockReturnValue(chainEq1) });

		const res = await db.listCoordinators();
		expect(res).toEqual([{ id: '1' }]);
	});
});

describe('db task functions (SPEC-D.4)', () => {
	let mockFrom: any;
	let mockSelect: any;
	let mockInsert: any;
	let mockUpdate: any;
	let mockSingle: any;
	let mockEq: any;
	let mockOrder: any;
	let mockLimit: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSingle = vi.fn();
		mockLimit = vi.fn().mockReturnValue({ then: (r: any) => r({ data: [], error: null }) });
		mockOrder = vi.fn().mockReturnValue({
			then: (r: any) => r({ data: [], error: null }),
			eq: vi.fn().mockReturnValue({ then: (r: any) => r({ data: [], error: null }) }),
			limit: mockLimit,
		});
		mockEq = vi.fn().mockReturnValue({
			then: (r: any) => r({ data: [], error: null }),
			eq: vi.fn().mockReturnValue({ then: (r: any) => r({ data: [], error: null }) }),
			order: mockOrder,
			select: vi.fn().mockReturnValue({ single: mockSingle }),
			single: mockSingle,
		});
		mockSelect = vi.fn().mockReturnValue({
			eq: mockEq,
			order: mockOrder,
			single: mockSingle,
		});
		mockInsert = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});
		mockUpdate = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({ single: mockSingle }),
			}),
		});

		mockFrom = vi.fn().mockReturnValue({
			select: mockSelect,
			insert: mockInsert,
			update: mockUpdate,
		});

		(supabase.from as any) = mockFrom;
	});

	it('createTask applies defaults', async () => {
		const task = {
			id: 'tid',
			title: 'x',
			priority: 'media',
			effort: 1,
			status: 'pendiente',
			required_skills: [],
			created_at: '2024-01-01',
		};
		mockSingle.mockResolvedValue({ data: task, error: null });

		const result = await db.createTask({ title: 'x' });

		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'x',
				priority: 'media',
				effort: 1,
				status: 'pendiente',
				required_skills: [],
			})
		);
		expect(result).toEqual(task);
	});

	it('createTask rejects invalid priority', async () => {
		await expect(
			db.createTask({ title: 'x', priority: 'invalid' as any })
		).rejects.toThrow('Invalid priority');
	});

	it('setTaskStatus rejects invalid status before Supabase call', async () => {
		await expect(
			db.setTaskStatus('task-1', 'invalid' as any)
		).rejects.toThrow('Invalid status');
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('setTaskStatus updates and returns the task', async () => {
		const updated = { id: 'tid', status: 'en_curso', created_at: '2024-01-01' };
		mockSingle.mockResolvedValue({ data: updated, error: null });

		const result = await db.setTaskStatus('tid', 'en_curso');
		expect(result).toEqual(updated);
	});

	it('getBoard returns columns with all 6 TaskStatus keys', async () => {
		(supabase.from as any) = vi.fn((table: string) => {
			if (table === 'tasks') {
				return {
					select: vi.fn().mockReturnValue({
						order: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: [], error: null }),
						}),
					}),
				};
			}
			if (table === 'assignments') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								then: (r: any) => r({ data: [], error: null }),
							}),
						}),
					}),
				};
			}
			if (table === 'impact_reports') {
				return {
					select: vi.fn().mockReturnValue({
						order: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								then: (r: any) => r({ data: [], error: null }),
							}),
						}),
					}),
				};
			}
			return { select: vi.fn().mockReturnValue({ then: (r: any) => r({ data: [], error: null }) }) };
		});

		const board = await db.getBoard();

		const expectedKeys = ['pendiente', 'propuesta', 'aprobada', 'en_curso', 'hecha', 'bloqueada'];
		expect(Object.keys(board.columns)).toEqual(expect.arrayContaining(expectedKeys));
		expect(Object.keys(board.columns)).toHaveLength(6);
	});

	it('getBoard alerts include tasks with deadline < 24h and status != hecha', async () => {
		const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
		const far = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
		const tasks = [
			{ id: '1', title: 'alert', status: 'pendiente', deadline: soon, required_skills: [], effort: 1, priority: 'media', created_at: '' },
			{ id: '2', title: 'far', status: 'pendiente', deadline: far, required_skills: [], effort: 1, priority: 'media', created_at: '' },
			{ id: '3', title: 'done', status: 'hecha', deadline: soon, required_skills: [], effort: 1, priority: 'media', created_at: '' },
		];

		(supabase.from as any) = vi.fn((table: string) => {
			if (table === 'tasks') {
				return {
					select: vi.fn().mockReturnValue({
						order: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: tasks, error: null }),
						}),
					}),
				};
			}
			if (table === 'assignments') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								then: (r: any) => r({ data: [], error: null }),
							}),
						}),
					}),
				};
			}
			return {
				select: vi.fn().mockReturnValue({
					order: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: [], error: null }),
						}),
					}),
				}),
			};
		});

		const board = await db.getBoard();
		expect(board.alerts).toHaveLength(1);
		expect(board.alerts[0].title).toBe('alert');
	});

	it('getBoard recent_impact returns max 5 items', async () => {
		const impacts = Array.from({ length: 3 }, (_, i) => ({
			headline: `Impact ${i}`,
			created_at: new Date(Date.now() - i * 1000).toISOString(),
		}));

		(supabase.from as any) = vi.fn((table: string) => {
			if (table === 'tasks') {
				return {
					select: vi.fn().mockReturnValue({
						order: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: [], error: null }),
						}),
					}),
				};
			}
			if (table === 'assignments') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								then: (r: any) => r({ data: [], error: null }),
							}),
						}),
					}),
				};
			}
			return {
				select: vi.fn().mockReturnValue({
					order: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: impacts, error: null }),
						}),
					}),
				}),
			};
		});

		const board = await db.getBoard();
		expect(board.recent_impact).toHaveLength(3);
	});

	it('getBoard pending_approval contains only propuesta assignments', async () => {
		const pendingAssignments = [
			{ id: 'a1', task_id: 't1', person_id: 'p1', status: 'propuesta', proposed_at: '' },
		];

		(supabase.from as any) = vi.fn((table: string) => {
			if (table === 'tasks') {
				return {
					select: vi.fn().mockReturnValue({
						order: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: [], error: null }),
						}),
					}),
				};
			}
			if (table === 'assignments') {
				return {
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								then: (r: any) => r({ data: pendingAssignments, error: null }),
							}),
						}),
					}),
				};
			}
			return {
				select: vi.fn().mockReturnValue({
					order: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							then: (r: any) => r({ data: [], error: null }),
						}),
					}),
				}),
			};
		});

		const board = await db.getBoard();
		expect(board.pending_approval).toEqual(pendingAssignments);
	});
});
