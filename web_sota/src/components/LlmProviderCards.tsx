import { useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete } from "@/api/client";
import {
	installStatus,
	type ProviderInfo,
	startInstall,
	testProvider,
} from "@/lib/llm";

type Props = {
	providers: ProviderInfo[];
	probing: boolean;
	selected: string;
	onChanged: (providerId: string) => Promise<void> | void;
};

export function LlmProviderCards({
	providers,
	probing,
	selected,
	onChanged,
}: Props) {
	const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
	const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
	const [cardMsg, setCardMsg] = useState<Record<string, string>>({});
	const [installing, setInstalling] = useState(false);
	const [installMsg, setInstallMsg] = useState<string | null>(null);

	const localProviders = providers.filter((p) => p.kind === "local");
	const cloudProviders = providers.filter((p) => p.kind === "cloud");

	function statusDot(p: ProviderInfo) {
		if (p.kind === "local") {
			if (probing)
				return (
					<span className="h-2 w-2 rounded-full bg-zinc-500 animate-pulse" />
				);
			return p.detected ? (
				<span className="h-2 w-2 rounded-full bg-green-500" />
			) : (
				<span className="h-2 w-2 rounded-full bg-zinc-600" />
			);
		}
		return p.configured ? (
			<span className="h-2 w-2 rounded-full bg-green-500" />
		) : (
			<span className="h-2 w-2 rounded-full bg-amber-500" />
		);
	}

	function statusText(p: ProviderInfo): string {
		if (p.kind === "local") {
			if (probing) return "Probing…";
			return p.detected
				? `Detected · ${p.models?.length ?? 0} models`
				: "Not found";
		}
		return p.configured ? "Key configured" : "Missing key";
	}

	async function saveKey(id: string) {
		const key = keyInputs[id]?.trim();
		if (!key) return;
		setCardMsg((m) => ({ ...m, [id]: "Saving…" }));
		try {
			const { saveLlmSettings } = await import("@/lib/llm");
			await saveLlmSettings({ provider: id, model: "", api_key: key });
			setKeyInputs((k) => ({ ...k, [id]: "" }));
			await onChanged(id);
			setCardMsg((m) => ({ ...m, [id]: "Key saved." }));
		} catch (e) {
			setCardMsg((m) => ({
				...m,
				[id]: e instanceof Error ? e.message : String(e),
			}));
		}
	}

	async function clearKey(id: string) {
		setCardMsg((m) => ({ ...m, [id]: "Clearing…" }));
		try {
			await apiDelete(
				`/api/settings/llm/key?provider=${encodeURIComponent(id)}`,
			);
			await onChanged(id);
			setCardMsg((m) => ({ ...m, [id]: "Key cleared." }));
		} catch (e) {
			setCardMsg((m) => ({
				...m,
				[id]: e instanceof Error ? e.message : String(e),
			}));
		}
	}

	async function runTest(id: string) {
		setCardMsg((m) => ({ ...m, [id]: "Testing…" }));
		try {
			const typed = keyInputs[id]?.trim() || undefined;
			const t = await testProvider(id, typed);
			if (t.ok) {
				setCardMsg((m) => ({
					...m,
					[id]: `Key valid — ${t.models.length} live model(s).${typed ? " Save key to keep it." : ""}`,
				}));
			} else {
				setCardMsg((m) => ({
					...m,
					[id]: t.note || t.error || "Not reachable — check the endpoint.",
				}));
			}
		} catch (e) {
			setCardMsg((m) => ({
				...m,
				[id]: e instanceof Error ? e.message : String(e),
			}));
		}
	}

	async function installOllama() {
		setInstalling(true);
		setInstallMsg("Starting winget install…");
		try {
			await startInstall("ollama");
			for (let i = 0; i < 120; i++) {
				await new Promise((r) => setTimeout(r, 5000));
				const st = await installStatus("ollama");
				if (st.state === "done") {
					setInstallMsg("Installed. Re-probing…");
					await onChanged("ollama");
					setInstallMsg(
						"Ollama installed and detected. Pull a model: ollama pull qwen3:32b",
					);
					break;
				}
				if (st.state === "error") {
					setInstallMsg(
						`Install failed: ${(st.output ?? "").slice(-300) || "see backend logs"}`,
					);
					break;
				}
				setInstallMsg(`Installing… (${i * 5 + 5}s)`);
			}
		} catch (e) {
			setInstallMsg(e instanceof Error ? e.message : String(e));
		} finally {
			setInstalling(false);
		}
	}

	return (
		<div className="grid gap-3 md:grid-cols-2">
			{localProviders.length > 0 && (
				<div className="space-y-3">
					<p className="text-xs font-medium text-zinc-500">
						Local engines (free)
					</p>
					{localProviders.map((p) => (
						<div
							key={p.id}
							data-testid={`llm-provider-card-${p.id}`}
							className={`space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${p.id === selected ? "border-blue-500/50" : ""}`}
						>
							<div className="flex items-center gap-2">
								{statusDot(p)}
								<span className="text-sm font-semibold text-zinc-100">
									{p.label}
								</span>
								<span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
									local · free
								</span>
								<span className="ml-auto text-xs text-zinc-500">
									{statusText(p)}
								</span>
							</div>
							{p.id === "ollama" && !p.detected && !probing && (
								<div className="space-y-2 rounded border border-zinc-800 px-2 py-1.5 text-xs text-zinc-400">
									<p>
										Not running. Manual:{" "}
										<code className="font-mono">
											winget install -e --id Ollama.Ollama
										</code>{" "}
										then{" "}
										<code className="font-mono">ollama pull qwen3:32b</code> —
										or see the{" "}
										<Link to="/help" className="underline">
											Help page
										</Link>
										.
									</p>
									<div className="flex items-center gap-2">
										<button
											type="button"
											data-testid="llm-install-ollama"
											disabled={installing}
											onClick={() => void installOllama()}
											className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
										>
											{installing ? "Installing…" : "Install Ollama now"}
										</button>
										{installMsg && <span>{installMsg}</span>}
									</div>
								</div>
							)}
							<div className="flex gap-2">
								<button
									type="button"
									data-testid={`llm-test-${p.id}`}
									onClick={() => void runTest(p.id)}
									className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
								>
									Test
								</button>
								{cardMsg[p.id] && (
									<span className="self-center text-xs text-zinc-500">
										{cardMsg[p.id]}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{cloudProviders.length > 0 && (
				<div className="space-y-3">
					<p className="text-xs font-medium text-zinc-500">Cloud (API key)</p>
					{cloudProviders.map((p) => (
						<div
							key={p.id}
							data-testid={`llm-provider-card-${p.id}`}
							className={`space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${p.id === selected ? "border-blue-500/50" : ""}`}
						>
							<div className="flex items-center gap-2">
								{statusDot(p)}
								<span className="text-sm font-semibold text-zinc-100">
									{p.label}
								</span>
								<span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
									cloud · paid
								</span>
								<span className="ml-auto text-xs text-zinc-500">
									{statusText(p)}
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<input
									type={showKeys[p.id] ? "text" : "password"}
									value={keyInputs[p.id] ?? ""}
									onChange={(e) =>
										setKeyInputs((k) => ({ ...k, [p.id]: e.target.value }))
									}
									placeholder={
										p.configured ? "•••••••• configured" : `Paste ${p.key_env}`
									}
									aria-label={`${p.label} API key`}
									data-testid={`llm-key-${p.id}`}
									className="min-w-40 flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100"
								/>
								<button
									type="button"
									onClick={() =>
										setShowKeys((s) => ({ ...s, [p.id]: !s[p.id] }))
									}
									className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
								>
									{showKeys[p.id] ? "Hide" : "Show"}
								</button>
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									disabled={!keyInputs[p.id]?.trim()}
									onClick={() => void saveKey(p.id)}
									className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
								>
									Save key
								</button>
								{p.configured && (
									<button
										type="button"
										onClick={() => void clearKey(p.id)}
										className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
									>
										Clear
									</button>
								)}
								<button
									type="button"
									data-testid={`llm-test-${p.id}`}
									onClick={() => void runTest(p.id)}
									className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
								>
									Test
								</button>
								{cardMsg[p.id] && (
									<span className="self-center text-xs text-zinc-500">
										{cardMsg[p.id]}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
