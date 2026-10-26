/** LLM provider probe helpers (AGENTS.md lib/provider.ts surface). */
import {
	fetchGpus,
	fetchOllamaModels,
	type GpuInfo,
	pickPreferredModel,
	resolveDefaultModel,
} from "@/lib/model-preference";

export type { GpuInfo };

/** Resolve the startup default model: stored choice wins, else resident-first. */
export async function resolveStartupModel(
	targetGpu: GpuInfo | null,
): Promise<{ provider: string; model: string }> {
	const previous = (() => {
		try {
			return localStorage.getItem("llm_model") || "";
		} catch {
			return "";
		}
	})();
	const state = await fetchOllamaModels();
	if (state.installed.length === 0)
		return { provider: "ollama", model: previous };
	const model = await resolveDefaultModel(previous, undefined, targetGpu);
	return { provider: "ollama", model };
}

export {
	fetchGpus,
	fetchOllamaModels,
	pickPreferredModel,
	resolveDefaultModel,
};
