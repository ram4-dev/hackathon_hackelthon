// scripts/demo.ts — Recorrido e2e para la presentación (SPEC-ML DoD).
//
// Corre el ciclo completo contra los mocks usando el MISMO dispatch del harness
// (scripts/chat.ts): onboarding → alta de tarea → propuesta (con justificación) →
// [coordinador aprueba] → [persona acepta] → "Terminé" → preguntas a medida →
// Balance de Impacto → "¿cómo venimos?".
//
// Requiere un proveedor LLM en .env (ANTHROPIC_API_KEY o AI_PROVIDER=opencode + key).
//   npm run demo
//
// Robusto a ids: lee del mock el id real de la asignación/tarea entre pasos (en vez de
// hardcodear assign_1/task_2). Los /btn simulan al Backend (handleButton) hasta integrar.
// La cantidad de preguntas de impacto la decide el LLM (2-4); mandamos algunas de más por
// las dudas (las que sobran se procesan como mensajes normales).

import "dotenv/config";
import { defaultDeps as deps } from "../lib/deps.js";
import { dispatch } from "./chat.js";

function act(title: string): void {
	console.log(`\n━━━━━━━━━━ ${title} ━━━━━━━━━━`);
}
async function say(line: string): Promise<void> {
	console.log(`\n👉 ${line}`);
	await dispatch(line);
}

async function main(): Promise<void> {
	console.log("🎬 Pulso — DEMO e2e contra mocks\n");

	act("ACTO 1 · Onboarding de una persona nueva");
	await say("/user 5491100000099");
	await say("Hola, soy Vale del área de comunicación. Mis skills: redes y redacción. Disponibilidad media. Registrame, por favor.");

	act("ACTO 2 · Alta de tarea + propuesta al coordinador");
	await say("/user 5491100000002");
	await say("Creá una tarea para dar una charla de RCP el próximo sábado y proponé un responsable. Hacelo ahora, no preguntes.");

	// ids reales desde el mock (robusto a la variación de ids / al seed).
	let board = await deps.db.getBoard();
	let assignment = board.pending_approval.at(-1);
	if (!assignment) {
		await say("Dale, creá la tarea con createTask y después proposeAssignment.");
		board = await deps.db.getBoard();
		assignment = board.pending_approval.at(-1);
	}
	if (!assignment) {
		console.log("\n⚠️  El modelo no creó la asignación (suele pasar con modelos chicos). Probá con un modelo más capaz (Anthropic/Gemini). Corto la demo acá.");
		process.exit(0);
	}
	const taskId = assignment.task_id;

	act("ACTO 3 · Doble aprobación (coordinador → persona)");
	await say(`/btn coord_approve:${assignment.id}`);
	await say(`/btn approve:${assignment.id}`);

	act("ACTO 4 · Cierre + Balance de Impacto");
	await say(`/btn done:${taskId}`);
	await say("40");
	await say("2");
	await say("el 85% la valoró útil");
	await say("repartimos material impreso");

	act("ACTO 5 · Tablero");
	await say("¿cómo venimos?");

	console.log("\n✅ Demo terminada.");
	process.exit(0);
}

main().catch((e) => {
	console.error("⚠️ ", e instanceof Error ? e.message : e);
	process.exit(1);
});
