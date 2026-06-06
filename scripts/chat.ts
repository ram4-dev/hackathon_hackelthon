// scripts/chat.ts — Harness local del agente (SPEC-ML §1).
//
// Loop de consola que llama a runAgent contra los mocks (db en memoria + send que
// loguea). Probás TODO el agente sin webhook ni base real. Necesita un proveedor
// LLM configurado (.env: ANTHROPIC_API_KEY o AI_PROVIDER=opencode + OPENCODE_API_KEY).
//
// Como los handlers de botones son del Backend (handleButton/coordinatorRespond/
// respondToAssignment, SPEC-B.3), acá se SIMULAN con /btn para poder recorrer el ciclo
// completo (coordinador aprueba → persona acepta → "Terminé" → Balance) end-to-end.
//
//   npm run chat
//   > hola                         (onboarding, si el usuario es nuevo)
//   > /user 5491100000002          (cambiar de número)
//   > creá una tarea para mandar el informe el viernes
//   > /btn coord_approve:assign_1  (simula al coordinador aprobando)
//   > /btn approve:assign_1        (simula a la persona aceptando)
//   > /btn done:task_2             (simula "Terminé" → arranca el Balance)
//   > 50                           (respuestas de impacto, de a una)
//   > ¿cómo venimos?

import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { runAgent } from "../lib/agent.js";
import { defaultDeps } from "../lib/deps.js";
import { startImpactFlow } from "../lib/impact.js";

const deps = defaultDeps;
let currentUser = "5491100000099"; // número nuevo por defecto → demo de onboarding

// --- Simulación de Backend (handleButton) para el harness ---------------------
// Espeja la máquina de estados de SPEC-B.3 contra el mock, hasta integrar con Backend.
async function simulateButton(id: string): Promise<void> {
	const { db, send } = deps;
	const [prefix, arg] = id.split(":");
	switch (prefix) {
		case "coord_approve": {
			const a = await db.setAssignmentStatus(arg, "aprobada_coord", { coord_id: (await db.listCoordinators())[0]?.id });
			const task = (await db.listTasks()).find((t) => t.id === a.task_id);
			const person = (await db.listPeople()).find((p) => p.id === a.person_id);
			if (person) {
				await send.sendButtons(person.wa_phone, `El equipo te propuso «${task?.title}». ¿La tomás?`, [
					{ id: `approve:${a.id}`, title: "✅ La tomo" },
					{ id: `reject:${a.id}`, title: "❌ No puedo" },
				]);
			}
			break;
		}
		case "coord_reject": {
			const a = await db.setAssignmentStatus(arg, "rechazada", { rejected_by: "coordinador" });
			await db.setTaskStatus(a.task_id, "pendiente");
			console.log("↩️  Tarea vuelta a 'pendiente'.");
			break;
		}
		case "approve": {
			const a = await db.setAssignmentStatus(arg, "aprobada");
			await db.setTaskStatus(a.task_id, "aprobada");
			const coord = (await db.listCoordinators())[0];
			const person = (await db.listPeople()).find((p) => p.id === a.person_id);
			if (coord) await send.sendText(coord.wa_phone, `${person?.name} tomó la tarea ✅`);
			break;
		}
		case "reject": {
			const a = await db.setAssignmentStatus(arg, "rechazada", { rejected_by: "persona" });
			console.log("↩️  La persona rechazó; el Backend re-propondría al siguiente candidato.");
			break;
		}
		case "done":
			await startImpactFlow(currentUser, arg, deps);
			break;
		default:
			// IDs fuera del contrato (ej cap:media de onboarding) → al agente como texto.
			await runAgent(currentUser, id, deps);
	}
}

function help(): void {
	console.log(`
Comandos:
  /user <wa_phone>     cambiar de número (default: ${currentUser})
  /btn <id>            simular un botón (coord_approve:.. approve:.. done:.. etc)
  /who                 listar personas
  /board               imprimir el tablero
  /help                esta ayuda
  /exit                salir
Cualquier otra cosa se manda al agente como texto.`);
}

/** Procesa una línea. Devuelve false para terminar el loop. */
async function dispatch(line: string): Promise<boolean> {
	if (line === "/exit") return false;
	if (line === "/help") {
		help();
	} else if (line.startsWith("/user ")) {
		currentUser = line.slice(6).trim();
		console.log("👤 Usuario:", currentUser);
	} else if (line.startsWith("/btn ")) {
		await simulateButton(line.slice(5).trim());
	} else if (line === "/who") {
		for (const p of await deps.db.listPeople()) {
			console.log(`  ${p.id} ${p.name} (${p.wa_phone})${p.is_coordinator ? " [coord]" : ""} skills=${p.skills.join("/")}`);
		}
	} else if (line === "/board") {
		console.log(JSON.stringify(await deps.db.getBoard(), null, 2));
	} else {
		await runAgent(currentUser, line, deps);
	}
	return true;
}

async function main(): Promise<void> {
	console.log("💬 Pulso — harness local. /help para comandos. Usuario actual:", currentUser);

	if (process.stdin.isTTY) {
		// Modo interactivo (terminal real).
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		while (true) {
			let line: string;
			try {
				line = (await rl.question(`\n[${currentUser}] › `)).trim();
			} catch {
				break; // Ctrl-D / stdin cerrado
			}
			if (!line) continue;
			try {
				if (!(await dispatch(line))) break;
			} catch (e) {
				console.error("⚠️ ", e instanceof Error ? e.message : e);
			}
		}
		rl.close();
	} else {
		// Modo scripted (entrada por pipe): leemos todo y procesamos línea por línea.
		let data = "";
		for await (const chunk of process.stdin) data += chunk;
		for (const raw of data.split("\n")) {
			const line = raw.trim();
			if (!line) continue;
			console.log(`\n[${currentUser}] › ${line}`);
			try {
				if (!(await dispatch(line))) break;
			} catch (e) {
				console.error("⚠️ ", e instanceof Error ? e.message : e);
			}
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
