/**
 * Active LLM card: current selection, VRAM-switching save, kick-out, telemetry.
 * Owns the active pair; LlmProviderCards owns per-provider keys (no overlap).
 */
import { useEffect, useState } from "react";
import {
	fetchGpus,
	fetchModels,
	type GpuInfo,
	saveLlmSettings,
	unloadLlm,
} from "@/lib/llm";
import {
	fetchOllamaModels,
	fitsTarget,
	pickPreferredModel,
} from "@/lib/model-preference";
import { useLlm } from "@/store/llm";

export function ActiveLlmCard() {
	const { provider, model, targetGpuIndex, setPair, setTargetGpu } = useLlm();
	const [models, setModels] = useState<string[]>([]);
	const [gpus, setGpus] = useState<GpuInfo[]>([]);
	const [loaded, setLoaded] = useState<string[]>([]);
	const [localModels, setLocalModels] = useState<string[]>([]);
	const [msg, setMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		(async () => {
			try {
				const [m, g, l] = await Promise.all([
					fetchModels(provider).catch(() => ({ models: [] as string[] })),
					fetchGpus(),
					fetchOllamaModels(),
				]);
				setModels(m.models ?? []);
				setGpus(g);
				setLoaded(l.loaded);
				setLocalModels(l.installed);
			} catch {
				/* offline */
			}
		})();
	}, [provider]);

	const targetGpu =
		gpus.find((g) => g.index === targetGpuIndex) ??
		gpus.find((g) => g.index > 0) ??
		gpus[0] ??
		null;
	const visibleModels =
		provider === "ollama" && targetGpu
			? models.filter((m) =>
					fitsTarget(m, {
						index: targetGpu.index,
						name: targetGpu.name,
						vramMb: targetGpu.total_mb,
					}),
				)
			: models;

	async function save() {
		if (!model) {
			setMsg("Pick a model first.");
			return;
		}
		setBusy(true);
		setMsg("Switching VRAM…");
		try {
			const r = await saveLlmSettings({ provider, model });
			setPair(provider, model);
			const sw = r.switch as
				| { evicted?: string[]; warmed?: boolean; engine?: boolean }
				| undefined;
			if (sw && provider === "ollama") {
				const ev = sw.evicted?.length ? ` evicted ${sw.evicted.length}` : "";
				setMsg(
					sw.engine
						? `Active.${ev}${sw.warmed ? " warmed." : ""}`
						: "Saved (engine offline).",
				);
			} else {
				setMsg("Saved.");
			}
			const l = await fetchOllamaModels().catch(() => null);
			if (l) setLoaded(l.loaded);
		} catch (e) {
			setMsg(e instanceof Error ? e.message : "Save failed");
		} finally {
			setBusy(false);
		}
	}

	async function kick() {
		setBusy(true);
		try {
			await unloadLlm({ provider });
			setMsg("Evicted resident models.");
			const l = await fetchOllamaModels().catch(() => null);
			if (l) setLoaded(l.loaded);
		} catch (e) {
			setMsg(e instanceof Error ? e.message : "Unload failed");
		} finally {
			setBusy(false);
		}
	}

	function suggestDefault() {
		const pick = pickPreferredModel(
			loaded,
			localModels.length > 0 ? localModels : models,
			targetGpu
				? {
						index: targetGpu.index,
						name: targetGpu.name,
						vramMb: targetGpu.total_mb,
					}
				: null,
		);
		if (pick) {
			setPair("ollama", pick);
			setMsg(`Suggested resident-first default: ${pick}`);
		}
	}

	return (
		<div
			className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
			data-testid="active-llm-card"
		>
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex flex-col gap-1">
					<label
						className="text-[11px] uppercase tracking-wider text-zinc-500"
						htmlFor="llm-provider"
					>
						Provider
					</label>
					<select
						id="llm-provider"
						data-testid="llm-provider-select"
						value={provider}
						onChange={(e) => setPair(e.target.value, "")}
						className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
					>
						<option value="ollama">Ollama (local)</option>
						<option value="lmstudio">LM Studio (local)</option>
						<option value="vllm">vLLM (local)</option>
						<option value="openai">OpenAI</option>
						<option value="anthropic">Anthropic</option>
						<option value="deepseek">DeepSeek</option>
						<option value="openrouter">OpenRouter</option>
						<option value="meta">Meta</option>
						<option value="google">Google</option>
						<option value="groq">Groq</option>
						<option value="mistral">Mistral</option>
					</select>
				</div>
				<div className="flex min-w-52 flex-1 flex-col gap-1">
					<label
						className="text-[11px] uppercase tracking-wider text-zinc-500"
						htmlFor="llm-model"
					>
						Model
					</label>
					<select
						id="llm-model"
						data-testid="llm-model-select"
						value={model}
						onChange={(e) => setPair(provider, e.target.value)}
						className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-sm text-zinc-100"
					>
						<option value="">— pick a model —</option>
						{visibleModels.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</div>
				{gpus.length > 1 && (
					<div className="flex flex-col gap-1">
						<label
							className="text-[11px] uppercase tracking-wider text-zinc-500"
							htmlFor="llm-gpu"
						>
							GPU
						</label>
						<select
							id="llm-gpu"
							data-testid="llm-gpu-select"
							value={targetGpu?.index ?? ""}
							onChange={(e) =>
								setTargetGpu(
									e.target.value === "" ? null : Number(e.target.value),
								)
							}
							className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
						>
							{gpus.map((g) => (
								<option key={g.index} value={g.index}>
									GPU {g.index} - {g.name} ({Math.round(g.total_mb / 1024)} GB)
								</option>
							))}
						</select>
					</div>
				)}
				<div className="flex items-end gap-2 pt-5">
					<button
						type="button"
						onClick={() => void save()}
						disabled={busy || !model}
						data-testid="llm-save"
						className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
					>
						Save + switch VRAM
					</button>
					<button
						type="button"
						onClick={() => void kick()}
						disabled={busy}
						data-testid="llm-unload"
						className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
					>
						Unload
					</button>
					<button
						type="button"
						onClick={suggestDefault}
						data-testid="llm-suggest"
						className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700"
					>
						Resident-first default
					</button>
				</div>
			</div>
			{msg && <p className="mt-2 text-xs text-zinc-400">{msg}</p>}
			{loaded.length > 0 && (
				<p
					className="mt-2 font-mono text-[11px] text-zinc-500"
					data-testid="llm-residents"
				>
					resident: {loaded.join(", ")}
				</p>
			)}
		</div>
	);
}
