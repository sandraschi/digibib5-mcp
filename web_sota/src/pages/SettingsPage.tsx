/**
 * Settings: backend health + ActiveLlmCard + provider cards (AiSettings pattern).
 */
import { useCallback, useEffect, useState } from "react";
import { ActiveLlmCard } from "@/components/ActiveLlmCard";
import { LlmOnboarding } from "@/components/LlmOnboarding";
import { LlmProviderCards } from "@/components/LlmProviderCards";
import { PageLoading } from "@/components/PageLoading";
import {
	fetchLlmSettings,
	fetchProviders,
	loadSelection,
	type ProviderInfo,
} from "@/lib/llm";

export function SettingsPage() {
	const [providers, setProviders] = useState<ProviderInfo[]>([]);
	const [probing, setProbing] = useState(true);
	const [selected, setSelected] = useState("ollama");
	const [health, setHealth] = useState<{
		root?: string;
		root_exists?: boolean;
		service?: string;
	} | null>(null);

	const refreshProviders = useCallback(async () => {
		try {
			const pv = await fetchProviders();
			setProviders(pv.providers);
		} catch {
			/* keep previous list */
		}
	}, []);

	useEffect(() => {
		(async () => {
			const [h] = await Promise.all([
				fetch("/api/health")
					.then((r) => r.json())
					.catch(() => null),
				refreshProviders(),
			]);
			setHealth(h);
			const prev = loadSelection();
			if (prev.provider) setSelected(prev.provider);
			try {
				const s = await fetchLlmSettings();
				if (s.provider) setSelected(s.provider);
			} catch {
				/* backend truth unavailable: local mirror stands */
			}
			setProbing(false);
		})();
	}, [refreshProviders]);

	async function handleCardsChanged() {
		await refreshProviders();
	}

	if (probing) return <PageLoading label="Loading settings…" />;

	return (
		<div className="mx-auto max-w-4xl space-y-4" data-testid="settings-page">
			<h2 className="text-2xl font-bold tracking-tight text-zinc-100">
				Settings
			</h2>

			<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
				<h3 className="text-sm font-semibold text-zinc-200">Backend</h3>
				<dl className="mt-2 space-y-1 font-mono text-xs text-zinc-400">
					<div className="flex gap-2">
						<dt className="w-28 shrink-0 text-zinc-500">service</dt>
						<dd>{health?.service ?? "—"}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="w-28 shrink-0 text-zinc-500">library root</dt>
						<dd className="break-all">{health?.root ?? "—"}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="w-28 shrink-0 text-zinc-500">discs found</dt>
						<dd>
							{health?.root_exists
								? "yes"
								: "no — set DIGIBIB_ROOT and restart the backend"}
						</dd>
					</div>
				</dl>
			</div>

			<LlmOnboarding mode="full" />
			<ActiveLlmCard />
			<LlmProviderCards
				providers={providers}
				probing={probing}
				selected={selected}
				onChanged={handleCardsChanged}
			/>
		</div>
	);
}
