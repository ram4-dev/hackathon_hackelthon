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

	it('listPeople optionally filters by active and preserves skills', async () => {
		const activePeople = [
			{ id: '1', active: true, skills: ['datos'] },
		];
		const eq = vi.fn().mockReturnValue({
			then: (resolve: any) => resolve({ data: activePeople, error: null }),
		});
		mockSelect.mockReturnValue({ eq });

		const res = await db.listPeople({ active: true });

		expect(eq).toHaveBeenCalledWith('active', true);
		expect(res).toEqual(activePeople);
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

describe('db assignment functions (SPEC-D.5)', () => {
	let mockFrom: any;
	let mockSingle: any;
	let mockMaybeSingle: any;
	let mockInsert: any;
	let mockUpdate: any;
	let mockSelect: any;
	let mockEq: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSingle = vi.fn();
		mockMaybeSingle = vi.fn();

		mockEq = vi.fn().mockReturnValue({
			maybeSingle: mockMaybeSingle,
			select: vi.fn().mockReturnValue({ single: mockSingle }),
			single: mockSingle,
		});

		mockSelect = vi.fn().mockReturnValue({
			eq: mockEq,
			then: (r: any) => r({ data: [], error: null }),
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

	it('insertAssignment creates with status propuesta', async () => {
		const created = { id: 'aid', task_id: 't1', person_id: 'p1', status: 'propuesta', proposed_at: '' };
		mockSingle.mockResolvedValue({ data: created, error: null });

		const result = await db.insertAssignment({ task_id: 't1', person_id: 'p1' });

		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ task_id: 't1', person_id: 'p1', status: 'propuesta' })
		);
		expect(result).toEqual(created);
	});

	it('getAssignment returns null when missing', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		const res = await db.getAssignment('no-exist');
		expect(res).toBeNull();
	});

	it('setAssignmentStatus rejects invalid status', async () => {
		await expect(
			db.setAssignmentStatus('aid', 'invalid' as any)
		).rejects.toThrow('Invalid assignment status');
		expect(mockFrom).not.toHaveBeenCalled();
	});

	it('setAssignmentStatus aprobada_coord requires coord_id', async () => {
		await expect(
			db.setAssignmentStatus('aid', 'aprobada_coord')
		).rejects.toThrow('coord_id required');
	});

	it('setAssignmentStatus aprobada_coord sets coord_id and coord_decision_at', async () => {
		const updated = { id: 'aid', status: 'aprobada_coord', coord_id: 'cid', coord_decision_at: '' };
		mockSingle.mockResolvedValue({ data: updated, error: null });

		const result = await db.setAssignmentStatus('aid', 'aprobada_coord', { coord_id: 'cid' });

		const updateCall = mockUpdate.mock.calls[0][0];
		expect(updateCall.coord_id).toBe('cid');
		expect(updateCall.coord_decision_at).toBeDefined();
		expect(result).toEqual(updated);
	});

	it('setAssignmentStatus aprobada sets responded_at', async () => {
		const updated = { id: 'aid', status: 'aprobada', responded_at: '' };
		mockSingle.mockResolvedValue({ data: updated, error: null });

		await db.setAssignmentStatus('aid', 'aprobada');

		const updateCall = mockUpdate.mock.calls[0][0];
		expect(updateCall.responded_at).toBeDefined();
	});

	it('setAssignmentStatus rechazada requires rejected_by', async () => {
		await expect(
			db.setAssignmentStatus('aid', 'rechazada')
		).rejects.toThrow('rejected_by required');
	});

	it('setAssignmentStatus rechazada sets rejected_by and responded_at', async () => {
		const updated = { id: 'aid', status: 'rechazada', rejected_by: 'coordinador' };
		mockSingle.mockResolvedValue({ data: updated, error: null });

		await db.setAssignmentStatus('aid', 'rechazada', { rejected_by: 'coordinador' });

		const updateCall = mockUpdate.mock.calls[0][0];
		expect(updateCall.rejected_by).toBe('coordinador');
		expect(updateCall.responded_at).toBeDefined();
	});

	it('readPersonLoad returns rows from person_load view', async () => {
		const rows = [{ id: 'p1', name: 'Ana', capacity: 'media', active_effort: 2, active_tasks: 1 }];
		mockSelect.mockReturnValue({ then: (r: any) => r({ data: rows, error: null }) });

		const result = await db.readPersonLoad();
		expect(result).toEqual(rows);
		expect(mockFrom).toHaveBeenCalledWith('person_load');
	});
});

describe('db impact functions (SPEC-D.6)', () => {
	let mockFrom: any;
	let mockSingle: any;
	let mockMaybeSingle: any;
	let mockInsert: any;
	let mockSelect: any;
	let mockEq: any;
	let mockOrder: any;
	let mockLimit: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSingle = vi.fn();
		mockMaybeSingle = vi.fn();
		mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
		mockOrder = vi.fn().mockReturnValue({
			then: (r: any) => r({ data: [], error: null }),
			limit: mockLimit,
		});
		mockEq = vi.fn().mockReturnValue({ order: mockOrder });
		mockSelect = vi.fn().mockReturnValue({
			eq: mockEq,
			order: mockOrder,
			single: mockSingle,
		});
		mockInsert = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});

		mockFrom = vi.fn().mockReturnValue({
			select: mockSelect,
			insert: mockInsert,
		});

		(supabase.from as any) = mockFrom;
	});

	it('insertImpactReport persists with defaults for inputs/outputs/raw_answers', async () => {
		const report = { id: 'rid', task_id: 't1', inputs: {}, outputs: {}, raw_answers: {}, created_at: '' };
		mockSingle.mockResolvedValue({ data: report, error: null });

		const result = await db.insertImpactReport({ task_id: 't1', headline: 'Done' });

		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ task_id: 't1', inputs: {}, outputs: {}, raw_answers: {} })
		);
		expect(result).toEqual(report);
	});

	it('insertImpactReport persists provided inputs and headline', async () => {
		const report = { id: 'rid', task_id: 't1', headline: 'Impact!', inputs: { reach: 50 }, created_at: '' };
		mockSingle.mockResolvedValue({ data: report, error: null });

		await db.insertImpactReport({
			task_id: 't1',
			headline: 'Impact!',
			inputs: { reach: 50 },
			outputs: { beneficiaries: 20 },
		});

		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ headline: 'Impact!', inputs: { reach: 50 } })
		);
	});

	it('getImpactReport returns null when no report exists', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		const res = await db.getImpactReport('task-x');
		expect(res).toBeNull();
	});

	it('getImpactReport returns the latest report for a task', async () => {
		const report = { id: 'rid', task_id: 't1', created_at: '2024-06-01' };
		mockMaybeSingle.mockResolvedValue({ data: report, error: null });
		const res = await db.getImpactReport('t1');
		expect(res).toEqual(report);
	});

	it('getOrgImpact returns headlines and by_type counts', async () => {
		const rows = [
			{ headline: 'H1', task_type: 'charla' },
			{ headline: 'H2', task_type: 'informe' },
			{ headline: null, task_type: 'charla' },
		];
		mockOrder.mockReturnValue({ then: (r: any) => r({ data: rows, error: null }) });

		const result = await db.getOrgImpact();

		expect(result.headlines).toEqual(['H1', 'H2']);
		expect(result.by_type).toEqual({ charla: 2, informe: 1 });
	});

	it('getOrgImpact returns empty headlines and by_type when no reports', async () => {
		mockOrder.mockReturnValue({ then: (r: any) => r({ data: [], error: null }) });
		const result = await db.getOrgImpact();
		expect(result.headlines).toEqual([]);
		expect(result.by_type).toEqual({});
	});
});

describe('db knowledge functions (SPEC-D.7)', () => {
	let mockFrom: any;
	let mockSingle: any;
	let mockInsert: any;
	let mockUpdate: any;
	let mockSelect: any;
	let mockEq: any;
	let mockOrder: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSingle = vi.fn();
		mockOrder = vi.fn().mockReturnValue({ then: (r: any) => r({ data: [], error: null }) });
		mockEq = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});
		mockSelect = vi.fn().mockReturnValue({ order: mockOrder, single: mockSingle });
		mockInsert = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});
		mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });

		mockFrom = vi.fn().mockReturnValue({
			select: mockSelect,
			insert: mockInsert,
			update: mockUpdate,
		});

		(supabase.from as any) = mockFrom;
	});

	it('loadKnowledge returns all rows ordered by created_at asc', async () => {
		const rows = [
			{ id: 'k1', content: 'Fact A', kind: 'hecho', tags: [], created_at: '2024-01-01' },
			{ id: 'k2', content: 'Fact B', kind: 'proceso', tags: ['x'], created_at: '2024-01-02' },
		];
		mockOrder.mockReturnValue({ then: (r: any) => r({ data: rows, error: null }) });

		const result = await db.loadKnowledge();
		expect(result).toEqual(rows);
		expect(mockFrom).toHaveBeenCalledWith('knowledge');
	});

	it('addKnowledge applies defaults kind=hecho and tags=[]', async () => {
		const entry = { id: 'k1', content: 'A fact', kind: 'hecho', tags: [], created_at: '' };
		mockSingle.mockResolvedValue({ data: entry, error: null });

		await db.addKnowledge({ content: 'A fact' });

		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ content: 'A fact', kind: 'hecho', tags: [] })
		);
	});

	it('addKnowledge accepts explicit kind and tags', async () => {
		const entry = { id: 'k1', content: 'Policy', kind: 'politica', tags: ['important'], created_at: '' };
		mockSingle.mockResolvedValue({ data: entry, error: null });

		await db.addKnowledge({ content: 'Policy', kind: 'politica', tags: ['important'] });

		expect(mockInsert).toHaveBeenCalledWith(
			expect.objectContaining({ kind: 'politica', tags: ['important'] })
		);
	});

	it('updateKnowledge patches content and tags', async () => {
		const updated = { id: 'k1', content: 'Updated', tags: ['new'], kind: 'hecho', created_at: '' };
		mockSingle.mockResolvedValue({ data: updated, error: null });

		const result = await db.updateKnowledge('k1', { content: 'Updated', tags: ['new'] });

		expect(mockUpdate).toHaveBeenCalledWith({ content: 'Updated', tags: ['new'] });
		expect(result).toEqual(updated);
	});

	it('updateKnowledge rejects empty patch', async () => {
		await expect(db.updateKnowledge('k1', {})).rejects.toThrow('patch must have at least one field');
		expect(mockFrom).not.toHaveBeenCalled();
	});
});

describe('db session / history / idempotency functions (SPEC-D.8)', () => {
	let mockFrom: any;
	let mockSingle: any;
	let mockMaybeSingle: any;
	let mockSelect: any;
	let mockEq: any;
	let mockOrder: any;
	let mockLimit: any;
	let mockInsert: any;
	let mockUpsert: any;
	let mockDelete: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSingle = vi.fn();
		mockMaybeSingle = vi.fn();
		mockLimit = vi.fn().mockReturnValue({ then: (r: any) => r({ data: [], error: null }) });
		mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
		mockEq = vi.fn().mockReturnValue({
			maybeSingle: mockMaybeSingle,
			order: mockOrder,
			then: (r: any) => r({ data: null, error: null }),
		});
		mockSelect = vi.fn().mockReturnValue({ eq: mockEq, single: mockSingle });
		mockInsert = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});
		mockUpsert = vi.fn().mockReturnValue({
			select: vi.fn().mockReturnValue({ single: mockSingle }),
		});
		mockDelete = vi.fn().mockReturnValue({ eq: mockEq });

		mockFrom = vi.fn().mockReturnValue({
			select: mockSelect,
			insert: mockInsert,
			upsert: mockUpsert,
			delete: mockDelete,
		});

		(supabase.from as any) = mockFrom;
	});

	it('getSession returns null when session does not exist', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		const result = await db.getSession('549100');
		expect(result).toBeNull();
	});

	it('getSession returns session when it exists', async () => {
		const session = { wa_phone: '549100', state: 'active', context: {}, updated_at: '' };
		mockMaybeSingle.mockResolvedValue({ data: session, error: null });
		const result = await db.getSession('549100');
		expect(result).toEqual(session);
	});

	it('setSession upserts with state, context and updated_at', async () => {
		const session = { wa_phone: '549100', state: 'onboarding', context: { step: 1 }, updated_at: '' };
		mockSingle.mockResolvedValue({ data: session, error: null });

		await db.setSession('549100', 'onboarding', { step: 1 });

		expect(mockUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ wa_phone: '549100', state: 'onboarding', context: { step: 1 } }),
			{ onConflict: 'wa_phone' }
		);
	});

	it('clearSession deletes the session row', async () => {
		mockEq.mockReturnValue({ then: (r: any) => r({ error: null }) });
		await db.clearSession('549100');
		expect(mockFrom).toHaveBeenCalledWith('sessions');
		expect(mockDelete).toHaveBeenCalled();
	});

	it('loadHistory returns messages in chronological order (reversed from desc fetch)', async () => {
		const msgs = [
			{ id: 2, wa_phone: '549100', role: 'assistant', content: 'Hi', created_at: '2024-01-01T00:00:02Z' },
			{ id: 1, wa_phone: '549100', role: 'user', content: 'Hello', created_at: '2024-01-01T00:00:01Z' },
		];
		mockLimit.mockReturnValue({ then: (r: any) => r({ data: msgs, error: null }) });

		const result = await db.loadHistory('549100', 20);

		// reversed → chronological: id 1 first, id 2 second
		expect(result[0].id).toBe(1);
		expect(result[1].id).toBe(2);
	});

	it('loadHistory defaults to 20 messages', async () => {
		mockLimit.mockReturnValue({ then: (r: any) => r({ data: [], error: null }) });
		await db.loadHistory('549100');
		expect(mockLimit).toHaveBeenCalledWith(20);
	});

	it('appendHistory inserts a message row', async () => {
		const msg = { id: 1, wa_phone: '549100', role: 'user', content: 'Hello', created_at: '' };
		mockSingle.mockResolvedValue({ data: msg, error: null });

		const result = await db.appendHistory('549100', 'user', 'Hello');

		expect(mockInsert).toHaveBeenCalledWith({ wa_phone: '549100', role: 'user', content: 'Hello' });
		expect(result).toEqual(msg);
	});

	it('wasProcessed returns false when message_id not found', async () => {
		mockMaybeSingle.mockResolvedValue({ data: null, error: null });
		const result = await db.wasProcessed('msg-x');
		expect(result).toBe(false);
	});

	it('wasProcessed returns true when message_id exists', async () => {
		mockMaybeSingle.mockResolvedValue({ data: { message_id: 'msg-x' }, error: null });
		const result = await db.wasProcessed('msg-x');
		expect(result).toBe(true);
	});

	it('markProcessed inserts the message_id', async () => {
		mockInsert.mockReturnValue({ then: (r: any) => r({ error: null }) });
		await db.markProcessed('msg-x');
		expect(mockInsert).toHaveBeenCalledWith({ message_id: 'msg-x' });
	});

	it('markProcessed ignores duplicate key error (idempotent)', async () => {
		mockInsert.mockReturnValue({ then: (r: any) => r({ error: { code: '23505' } }) });
		await expect(db.markProcessed('msg-x')).resolves.toBeUndefined();
	});
});
