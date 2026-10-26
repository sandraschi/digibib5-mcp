/** Fleet LLM store: active provider/model pair + GPU target (zustand, persisted). */
import { create } from "zustand";
import { loadSelection, saveSelection } from "@/lib/llm";

interface LlmState {
	provider: string;
	model: string;
	targetGpuIndex: number | null;
	setPair: (provider: string, model: string) => void;
	setTargetGpu: (index: number | null) => void;
	refresh: () => void;
}

const GPU_KEY = "llm_gpu";

function loadGpu(): number | null {
	try {
		const raw = localStorage.getItem(GPU_KEY);
		if (raw == null || raw === "") return null;
		const n = Number(raw);
		return Number.isNaN(n) ? null : n;
	} catch {
		return null;
	}
}

const initial = loadSelection();

export const useLlm = create<LlmState>()((set) => ({
	provider: initial.provider,
	model: initial.model,
	targetGpuIndex: loadGpu(),
	setPair: (provider, model) => {
		saveSelection(provider, model);
		set({ provider, model });
	},
	setTargetGpu: (index) => {
		try {
			if (index == null) localStorage.removeItem(GPU_KEY);
			else localStorage.setItem(GPU_KEY, String(index));
		} catch {
			/* ignore */
		}
		set({ targetGpuIndex: index });
	},
	refresh: () => {
		const sel = loadSelection();
		set({
			provider: sel.provider,
			model: sel.model,
			targetGpuIndex: loadGpu(),
		});
	},
}));
