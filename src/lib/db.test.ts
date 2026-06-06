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
