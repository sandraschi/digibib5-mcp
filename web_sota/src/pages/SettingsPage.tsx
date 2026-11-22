/**
 * Settings: backend health + ActiveLlmCard + provider cards (AiSettings pattern).
 */
import { CheckCircle2, FolderOpen, HelpCircle, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ActiveLlmCard } from "@/components/ActiveLlmCard";
import { LibraryOnboardingModal } from "@/components/LibraryOnboardingModal";
import { LlmOnboarding } from "@/components/LlmOnboarding";
import { LlmProviderCards } from "@/components/LlmProviderCards";
import { PageLoading } from "@/components/PageLoading";
import {
	fetchLibrarySettings,
	type LibrarySettings,
	type LibraryTestResult,
	saveLibrarySettings,
	testLibraryRoot,
} from "@/lib/librarySettings";
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
	const [libSettings, setLibSettings] = useState<LibrarySettings | null>(null);
	const [rootInput, setRootInput] = useState("");
	const [testingRoot, setTestingRoot] = useState(false);
	const [savingRoot, setSavingRoot] = useState(false);
	const [testResult, setTestResult] = useState<LibraryTestResult | null>(null);
	const [libError, setLibError] = useState<string | null>(null);
	const [libSavedMsg, setLibSavedMsg] = useState<string | null>(null);
	const [showOnboarding, setShowOnboarding] = useState(false);

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
			const [h, lib] = await Promise.all([
				fetch("/api/health")
					.then((r) => r.json())
					.catch(() => null),
				fetchLibrarySettings().catch(() => null),
				refreshProviders(),
			]);
			setHealth(h);
			if (lib) {
				setLibSettings(lib);
				setRootInput(lib.root);
			} else if (h?.root) {
				setRootInput(h.root);
			}
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

	async function handleTestRoot() {
		setTestingRoot(true);
		setLibError(null);
		setLibSavedMsg(null);
		try {
			const res = await testLibraryRoot(rootInput);
			setTestResult(res);
		} catch (e) {
			setLibError(e instanceof Error ? e.message : "Test failed");
			setTestResult(null);
		} finally {
			setTestingRoot(false);
		}
	}

	async function handleConnectRoot() {
		setSavingRoot(true);
		setLibError(null);
		setLibSavedMsg(null);
		try {
			const updated = await saveLibrarySettings({
				root: rootInput,
				onboarded: true,
			});
			setLibSettings(updated);
			setRootInput(updated.root);
			setHealth((prev) => ({
				...prev,
				root: updated.root,
				root_exists: updated.root_exists,
			}));
			setLibSavedMsg(
				updated.volume_count > 0
					? `Connected — ${updated.volume_count} volume(s) active`
					: "Saved root (no readable volumes found there yet)",
			);
		} catch (e) {
			setLibError(e instanceof Error ? e.message : "Failed to connect library");
		} finally {
			setSavingRoot(false);
		}
	}

	if (probing) return <PageLoading label="Loading settings…" />;

	return (
		<div className="mx-auto max-w-4xl space-y-4" data-testid="settings-page">
			{showOnboarding && libSettings && (
				<LibraryOnboardingModal
					initial={libSettings}
					onDone={(updated) => {
						setLibSettings(updated);
						setRootInput(updated.root);
						setHealth((prev) => ({
							...prev,
							root: updated.root,
							root_exists: updated.root_exists,
						}));
						setShowOnboarding(false);
					}}
					onClose={() => setShowOnboarding(false)}
				/>
			)}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-2xl font-bold tracking-tight text-zinc-100">
					Settings
				</h2>
				{libSettings && (
					<button
						type="button"
						onClick={() => setShowOnboarding(true)}
						className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
					>
						<HelpCircle className="h-3.5 w-3.5 text-amber-400" />
						Welcome Guide
					</button>
				)}
			</div>

			<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
				<div className="flex items-center justify-between gap-2">
					<h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
						<FolderOpen className="h-4 w-4 text-amber-400" />
						Library Root &amp; Backend
					</h3>
					{libSettings && (
						<span className="rounded border border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
							source: {libSettings.source}
						</span>
					)}
				</div>

				<div className="mt-3 flex flex-wrap gap-2">
					<input
						type="text"
						value={rootInput}
						onChange={(e) => {
							setRootInput(e.target.value);
							setTestResult(null);
							setLibSavedMsg(null);
						}}
						placeholder="K:\Digitale Bibliothek\Bibliothek"
						data-testid="library-root-input"
						className="min-w-[260px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
					/>
					<button
						type="button"
						onClick={handleTestRoot}
						disabled={testingRoot || !rootInput.trim()}
						data-testid="library-root-test"
						className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
					>
						{testingRoot && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
						Test
					</button>
					<button
						type="button"
						onClick={handleConnectRoot}
						disabled={savingRoot || !rootInput.trim()}
						data-testid="library-root-connect"
						className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
					>
						{savingRoot && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
						Connect
					</button>
				</div>

				{testResult && (
					<div
						className={`mt-3 rounded-lg border p-3 text-xs ${
							testResult.ok
								? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
								: "border-amber-500/40 bg-amber-500/10 text-amber-200"
						}`}
					>
						<div className="flex items-center gap-2 font-medium">
							{testResult.ok ? (
								<CheckCircle2 className="h-4 w-4 text-emerald-400" />
							) : (
								<XCircle className="h-4 w-4 text-amber-400" />
							)}
							<span>
								{testResult.ok
									? `Found ${testResult.volume_count} readable volume(s)`
									: testResult.root_exists
										? "Folder exists, but no DB* volumes with DIGIBIB.TXT were found"
										: "Folder does not exist on disk"}
							</span>
						</div>
						{testResult.sample_volumes.length > 0 && (
							<div className="mt-1 truncate text-[11px] text-emerald-300/80">
								Sample:{" "}
								{testResult.sample_volumes
									.map((v) => `${v.id} (${v.title})`)
									.join(", ")}
							</div>
						)}
					</div>
				)}

				{libSavedMsg && (
					<div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
						{libSavedMsg}
					</div>
				)}
				{libError && (
					<div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">
						{libError}
					</div>
				)}

				<dl className="mt-3 space-y-1 font-mono text-xs text-zinc-400">
					<div className="flex gap-2">
						<dt className="w-28 shrink-0 text-zinc-500">service</dt>
						<dd>{health?.service ?? "—"}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="w-28 shrink-0 text-zinc-500">active root</dt>
						<dd className="break-all">{health?.root ?? "—"}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="w-28 shrink-0 text-zinc-500">discs found</dt>
						<dd>
							{libSettings
								? libSettings.volume_count > 0
									? `yes (${libSettings.volume_count} volumes)`
									: "no — set library root above and click Connect"
								: health?.root_exists
									? "yes"
									: "no — set library root above and click Connect"}
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
