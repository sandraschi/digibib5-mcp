/**
 * Blocks Chat (and similar) until LLM providers/settings are reachable.
 * Shows fleet-standard loading instead of a blank page.
 *
 * Copy beside PageLoading.tsx; wire Chat route:
 *   <LlmPageGate><ChatPage /></LlmPageGate>
 *
 * Requires lib/llm.ts (templates/llm/lib-llm.ts) and GET /api/llm/providers.
 */
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
	fetchLlmSettings,
	fetchProviders,
	isOnboarded,
	loadSelection,
} from "@/lib/llm";
import { PageLoading } from "./PageLoading";

type GateState = "loading" | "ready" | "needs-setup" | "error";

type Props = {
	children: ReactNode;
	settingsPath?: string;
};

export function LlmPageGate({ children, settingsPath = "/settings" }: Props) {
	const [state, setState] = useState<GateState>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				await fetchProviders();
				const settings = await fetchLlmSettings().catch(() => null);
				const sel = loadSelection();
				const hasModel =
					Boolean(settings?.model?.trim()) ||
					Boolean(sel.model?.trim()) ||
					isOnboarded();
				if (!cancelled) setState(hasModel ? "ready" : "needs-setup");
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : String(e));
					setState("error");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (state === "loading") {
		return (
			<PageLoading
				label="Loading LLM configuration…"
				testId="llm-page-loading"
			/>
		);
	}

	if (state === "needs-setup") {
		return (
			<div
				className="mx-auto max-w-lg space-y-4 rounded-lg border border-slate-800 bg-slate-950/60 p-6"
				data-testid="llm-needs-setup"
			>
				<h2 className="text-lg font-semibold text-white">
					Choose a local LLM first
				</h2>
				<p className="text-sm text-slate-400">
					Chat needs a provider and model. Open Settings, pick Ollama or another
					local endpoint, save, then return here.
				</p>
				<Link
					to={settingsPath}
					className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
					data-testid="llm-gate-settings-link"
				>
					Open Settings
				</Link>
			</div>
		);
	}

	if (state === "error") {
		return (
			<div className="space-y-3 rounded-lg border border-red-900/50 bg-red-950/20 p-6">
				<p className="text-sm text-red-200">
					Could not reach LLM endpoints: {error ?? "unknown error"}
				</p>
				<Link
					to={settingsPath}
					className="text-sm text-blue-400 hover:underline"
				>
					Check Settings
				</Link>
			</div>
		);
	}

	return <>{children}</>;
}
