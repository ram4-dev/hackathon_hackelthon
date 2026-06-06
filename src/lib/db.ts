import { createClient } from "@supabase/supabase-js";
import type { Person, Capacity } from "../domain/types";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);

export const db = {
	async upsertPerson(input: {
		wa_phone: string;
		name?: string;
		role?: string;
		skills?: string[];
		capacity?: Capacity;
		is_coordinator?: boolean;
	}): Promise<Person> {
		// Try to find the person first
		const { data: existing, error: findError } = await supabase
			.from("people")
			.select("*")
			.eq("wa_phone", input.wa_phone)
			.maybeSingle();

		if (findError) throw findError;

		if (existing) {
			// Update: merge semantics. We only update provided fields.
			const patch: any = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.role !== undefined) patch.role = input.role;
			if (input.skills !== undefined) patch.skills = input.skills;
			if (input.capacity !== undefined) patch.capacity = input.capacity;
			if (input.is_coordinator !== undefined) patch.is_coordinator = input.is_coordinator;

			// If no new fields to update, return the existing person
			if (Object.keys(patch).length === 0) {
				return existing as Person;
			}

			const { data, error } = await supabase
				.from("people")
				.update(patch)
				.eq("wa_phone", input.wa_phone)
				.select()
				.single();

			if (error) throw error;
			return data as Person;
		} else {
			// Insert: apply defaults
			const payload = {
				wa_phone: input.wa_phone,
				name: input.name ?? input.wa_phone,
				role: input.role,
				skills: input.skills ?? [],
				capacity: input.capacity ?? "media",
				is_coordinator: input.is_coordinator ?? false,
				active: true,
				timezone: "America/Argentina/Buenos_Aires",
			};

			const { data, error } = await supabase
				.from("people")
				.insert(payload)
				.select()
				.single();

			if (error) throw error;
			return data as Person;
		}
	},

	async getPersonByPhone(wa_phone: string): Promise<Person | null> {
		const { data, error } = await supabase
			.from("people")
			.select("*")
			.eq("wa_phone", wa_phone)
			.maybeSingle();

		if (error) throw error;
		return data as Person | null;
	},

	async listCoordinators(): Promise<Person[]> {
		const { data, error } = await supabase
			.from("people")
			.select("*")
			.eq("is_coordinator", true)
			.eq("active", true);

		if (error) throw error;
		return data as Person[];
	},
};
