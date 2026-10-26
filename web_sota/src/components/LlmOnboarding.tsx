import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/api/client";
import {
	fetchOnboarding,
	fetchProviders,
	isOnboarded,
	loadSelection,
	markOnboarded,
	type OnboardingState,
	type ProviderInfo,
	saveLlmSettings,
	saveSelection,
} from "@/lib/llm";
import { PageLoading } from "./PageLoading";

type Props = {
	/** banner: render only when setup is incomplete. full: always render status + setup. */
	mode: "banner" | "full";
};

export function LlmOnboarding({ mode }: Props) {
	const [state, setState] = useState<OnboardingState | null>(null);
	const [providers, setProviders] = useState<ProviderInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState(mode === "full");
	const [choice, setChoice] = useState("");
	const [keyInput, setKeyInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(isOnboarded());

	useEffect(() => {
		(async () => {
			try {
				const [ob, pv] = await Promise.all([
					fetchOnboarding(),
					fetchProviders().catch(() => null),
				]);
				setState(ob);
				if (pv) setProviders(pv.providers);
				const rec = ob.recommendation.path;
				if (rec.startsWith("cloud:")) setChoice(rec);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	useEffect(() => {
		if (mode === "full") setExpanded(true);
	}, [mode]);

	if (loading) {
		if (mode === "full")
			return (
				<PageLoading
					variant="inline"
					label="Checking LLM setup…"
					testId="llm-onboarding-loading"
				/>
			);
		return null;
	}

	if (error || !state) return null;

	const detectedLocals = providers.filter(
		(p) => p.kind === "local" && p.detected,
	);
	const clouds: ProviderInfo[] = providers.filter((p) => p.kind === "cloud");
	const ready = detectedLocals.length > 0 || state.clouds_configured.length > 0;

	if (mode === "banner" && (ready || done)) return null;

	const needsKey = choice.startsWith("cloud:");
	const chosenCloud = needsKey ? choice.slice("cloud:".length) : "";

	async function save() {
		if (!choice) return;
		setSaving(true);
		setError(null);
		try {
			if (choice.startsWith("local:")) {
				const id = choice.slice("local:".length);
				const prev = loadSelection();
				const model = (prev.provider === id && prev.model) || "";
				await saveLlmSettings({ provider: id, model });
				saveSelection(id, model);
			} else {
				const prev = loadSelection();
				const model = (prev.provider === chosenCloud && prev.model) || "";
				await saveLlmSettings({
					provider: chosenCloud,
					model,
					api_key: keyInput || undefined,
				});
				saveSelection(chosenCloud, model);
			}
			markOnboarded();
			setDone(true);
			const pv = await fetchProviders().catch(() => null);
			if (pv) setProviders(pv.providers);
			const ob = await apiGet<OnboardingState>("/api/llm/onboarding").catch(
				() => null,
			);
			if (ob) setState(ob);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			data-testid="llm-onboarding"
			className={`rounded-xl border p-4 md:p-5 ${ready ? "border-zinc-800 bg-zinc-900" : "border-red-500/50 bg-red-500/5"}`}
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-sm font-semibold text-zinc-100">
						{ready ? "AI provider ready" : "Set up AI to enable chat"}
					</p>
					<p className="mt-0.5 max-w-2xl text-xs text-zinc-500">
						{ready
							? "A local engine or cloud key is configured. Change providers anytime in Settings."
							: state.recommendation.reason}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{mode === "banner" && !ready && !expanded && (
						<button
							type="button"
							data-testid="onboarding-cue"
							onClick={() => setExpanded(true)}
							className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
						>
							Set up AI
						</button>
					)}
					{mode === "banner" && (
						<Link
							to="/settings"
							className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
						>
							Settings
						</Link>
					)}
				</div>
			</div>

			{(expanded || mode === "full") && !done && (
				<div className="mt-4 space-y-2" data-testid="onboarding-paths">
					{detectedLocals.map((p) => (
						<label
							key={p.id}
							className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${choice === `local:${p.id}` ? "border-blue-500/60 bg-blue-500/5" : "border-zinc-800"}`}
						>
							<input
								type="radio"
								name="llm-path"
								checked={choice === `local:${p.id}`}
								onChange={() => setChoice(`local:${p.id}`)}
							/>
							<span className="h-2 w-2 rounded-full bg-green-500" />
							<span className="font-medium text-zinc-100">{p.label}</span>
							<span className="text-xs text-zinc-500">
								detected · free · {p.models?.length ?? 0} models
							</span>
						</label>
					))}

					{clouds.map((p) => (
						<label
							key={p.id}
							className={`flex flex-wrap cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${choice === `cloud:${p.id}` ? "border-blue-500/60 bg-blue-500/5" : "border-zinc-800"}`}
						>
							<input
								type="radio"
								name="llm-path"
								checked={choice === `cloud:${p.id}`}
								onChange={() => setChoice(`cloud:${p.id}`)}
							/>
							<span
								className={`h-2 w-2 rounded-full ${p.configured ? "bg-green-500" : "bg-amber-500"}`}
							/>
							<span className="font-medium text-zinc-100">{p.label}</span>
							<span className="text-xs text-zinc-500">
								{p.configured
									? "key configured"
									: `needs ${p.key_env} — cheapest instant path`}
							</span>
							{choice === `cloud:${p.id}` && !p.configured && (
								<input
									type="password"
									value={keyInput}
									onChange={(e) => setKeyInput(e.target.value)}
									placeholder={`Paste ${p.key_env}`}
									aria-label={`${p.label} API key`}
									data-testid={`llm-key-${p.id}`}
									className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100 sm:w-72"
								/>
							)}
						</label>
					))}

					{state.locals.length > 0 && detectedLocals.length === 0 && (
						<p className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
							No local engine running. Free path: install Ollama (
							<code className="font-mono">
								winget install -e --id Ollama.Ollama
							</code>
							, then <code className="font-mono">ollama pull qwen3:32b</code>)
							and come back — or paste a cloud key above.
						</p>
					)}

					{error && <p className="text-xs text-red-400">{error}</p>}

					<div className="flex gap-2 pt-1">
						<button
							type="button"
							onClick={() => void save()}
							disabled={
								saving ||
								!choice ||
								(needsKey &&
									!keyInput &&
									!clouds.find((c) => c.id === chosenCloud)?.configured)
							}
							data-testid="onboarding-save"
							className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
						>
							{saving ? "Saving…" : "Use this setup"}
						</button>
					</div>
				</div>
			)}

			{done && mode === "full" && (
				<p className="mt-3 text-xs text-green-400">
					Saved. Chat is enabled with your selection.
				</p>
			)}
		</div>
	);
}
