/**
 * MCP tool catalog: the single `digibib` portmanteau, drilled down into its
 * operations. Tool list comes live from GET /api/tools (derived from the
 * server function itself) — never hardcoded here.
 */

import { AlertCircle, Loader2, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { CATEGORY_ORDER, type ToolMeta, toolCategory } from "@/lib/tool-schema";

function normalizeTools(raw: unknown): ToolMeta[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((item) => {
		if (typeof item === "string") return { name: item, description: "" };
		return item as ToolMeta;
	});
}

export function DigibibToolsPage() {
	const [tools, setTools] = useState<ToolMeta[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");

	useEffect(() => {
		(async () => {
			try {
				const data = await api.tools();
				setTools(normalizeTools(data.tools));
			} catch (e) {
				console.error("Failed to fetch tools", e);
			} finally {
				setLoading(false);
			}
		})();
	}, []);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return tools;
		return tools.filter((tool) => {
			const hay =
				`${tool.name} ${tool.description || ""} ${toolCategory(tool.name)}`.toLowerCase();
			return hay.includes(q);
		});
	}, [tools, search]);

	const groups = useMemo(() => {
		const map = new Map<string, ToolMeta[]>();
		for (const tool of filtered) {
			const cat = toolCategory(tool.name);
			const list = map.get(cat) || [];
			list.push(tool);
			map.set(cat, list);
		}
		const order = [...CATEGORY_ORDER];
		for (const key of map.keys()) {
			if (!order.includes(key)) order.push(key);
		}
		return order
			.filter((cat) => map.has(cat))
			.map((cat) => [cat, map.get(cat) || []] as const);
	}, [filtered]);

	return (
		<div className="mx-auto max-w-6xl space-y-6" data-testid="tools-page">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-bold tracking-tight text-zinc-100">
						MCP tool harness
					</h2>
					<p className="max-w-2xl text-sm text-zinc-400">
						{loading
							? "Loading…"
							: `${filtered.length} of ${tools.length} operations`}{" "}
						from the same <code className="font-mono">digibib</code> portmanteau
						AI clients use. Pick a card, fill the generated form, click Run.
					</p>
				</div>
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Filter operations…"
					data-testid="tools-search"
					className="max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
				/>
			</div>

			<div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-500">
				One MCP tool (<code className="font-mono">digibib</code>), seven
				operations. Each card runs the live backend endpoint — the same code
				path as the MCP server.
			</div>

			{loading ? (
				<div
					className="flex items-center justify-center p-12"
					data-testid="tools-loading"
				>
					<Loader2 className="h-8 w-8 animate-spin text-blue-500" />
				</div>
			) : (
				groups.map(([category, items]) => (
					<div key={category} className="space-y-3">
						<h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
							{category}
						</h3>
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{items.map((tool) => (
								<div
									key={tool.name}
									className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:bg-zinc-900/60"
								>
									<div className="flex items-center justify-between gap-2 pb-2">
										<span className="break-all font-mono text-sm font-semibold text-zinc-100">
											{tool.name}
										</span>
										<Wrench className="h-4 w-4 shrink-0 text-blue-500" />
									</div>
									<p className="min-h-10 text-xs text-zinc-400">
										{(tool.description || "digibib operation").slice(0, 160)}
									</p>
									<div className="mt-3 flex gap-2">
										<Link
											to={`/tools/${encodeURIComponent(tool.name)}`}
											data-testid={`tool-run-${tool.name}`}
											className="inline-flex flex-1 items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
										>
											Run tool
										</Link>
										<Link
											to="/reader"
											className="inline-flex items-center justify-center rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
										>
											Reader
										</Link>
									</div>
								</div>
							))}
						</div>
					</div>
				))
			)}

			{!loading && filtered.length === 0 && (
				<div
					className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 p-12"
					data-testid="tools-empty"
				>
					<AlertCircle className="mb-2 h-8 w-8 text-zinc-600" />
					<p className="text-zinc-500">No operations match</p>
				</div>
			)}
		</div>
	);
}
