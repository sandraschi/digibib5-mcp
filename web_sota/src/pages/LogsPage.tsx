/**
 * Backend log viewer: filter, text search, auto-scroll. Polls /api/logs.
 */

import {
	AlertCircle,
	CheckCircle2,
	Info,
	RefreshCw,
	Search,
	Terminal,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface LogEntry {
	timestamp: string;
	level: string;
	message: string;
	source?: string;
}

const LEVEL_ICONS: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	info: Info,
	warn: AlertCircle,
	error: XCircle,
	debug: Terminal,
	success: CheckCircle2,
};

const LEVEL_COLORS: Record<string, string> = {
	info: "text-blue-400",
	warn: "text-amber-400",
	error: "text-red-400",
	debug: "text-zinc-500",
	success: "text-green-400",
};

const LEVEL_BG: Record<string, string> = {
	info: "border-blue-500/20 bg-blue-500/10",
	warn: "border-amber-500/20 bg-amber-500/10",
	error: "border-red-500/20 bg-red-500/10",
	debug: "border-zinc-700/50 bg-zinc-800/50",
	success: "border-green-500/20 bg-green-500/10",
};

export function LogsPage() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [levelFilter, setLevelFilter] = useState("all");
	const [search, setSearch] = useState("");
	const [autoScroll, setAutoScroll] = useState(true);
	const [loading, setLoading] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);

	const fetchLogs = useCallback(async () => {
		try {
			const r = await fetch("/api/logs?limit=200");
			if (!r.ok) return;
			const data = (await r.json()) as { logs?: LogEntry[] };
			setLogs(data.logs ?? []);
		} catch {
			/* backend down */
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchLogs();
		const t = setInterval(() => void fetchLogs(), 10_000);
		return () => clearInterval(t);
	}, [fetchLogs]);

	const handleScroll = useCallback(() => {
		if (!scrollRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		setAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
	}, []);

	const filtered = logs.filter((entry) => {
		if (levelFilter !== "all" && entry.level !== levelFilter) return false;
		if (search && !entry.message.toLowerCase().includes(search.toLowerCase()))
			return false;
		return true;
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever the visible list changes
	useEffect(() => {
		if (autoScroll && scrollRef.current)
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
	}, [filtered, autoScroll]);

	const levels = ["all", ...new Set(logs.map((l) => l.level))];

	return (
		<div
			data-testid="logs-page"
			className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col"
		>
			<div
				className="mb-4 flex items-center justify-between"
				data-testid="logs-controls"
			>
				<h2 className="flex items-center gap-3 text-2xl font-bold text-zinc-100">
					<Terminal className="text-zinc-400" /> Logs
				</h2>
				<div className="flex items-center gap-3">
					<div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
						{levels.map((lv) => (
							<button
								key={lv}
								type="button"
								onClick={() => setLevelFilter(lv)}
								className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
									levelFilter === lv
										? "bg-zinc-700 text-zinc-200"
										: "text-zinc-500 hover:text-zinc-300"
								}`}
							>
								{lv === "all" ? "All" : lv}
								{lv !== "all" && (
									<span className="ml-1 opacity-60">
										{logs.filter((e) => e.level === lv).length}
									</span>
								)}
							</button>
						))}
					</div>
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search logs…"
							data-testid="logs-search"
							className="w-48 rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
						/>
					</div>
					<button
						type="button"
						onClick={() => void fetchLogs()}
						disabled={loading}
						className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
						title="Refresh"
					>
						<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
					</button>
					<label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500">
						<input
							type="checkbox"
							checked={autoScroll}
							onChange={(e) => setAutoScroll(e.target.checked)}
							className="rounded border-zinc-600 bg-zinc-900"
						/>
						Auto-scroll
					</label>
				</div>
			</div>

			<div
				data-testid="logs-entries"
				ref={scrollRef}
				onScroll={handleScroll}
				className="flex-1 space-y-0.5 overflow-y-auto font-mono text-xs"
			>
				{filtered.length === 0 && (
					<div className="flex h-full items-center justify-center text-sm text-zinc-500">
						{loading ? "Loading logs…" : "No matching log entries."}
					</div>
				)}
				{filtered.map((entry, i) => {
					const Icon = LEVEL_ICONS[entry.level] ?? Info;
					const color = LEVEL_COLORS[entry.level] ?? "text-zinc-400";
					const bg =
						LEVEL_BG[entry.level] ?? "border-zinc-800/30 bg-zinc-800/30";
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: append-only ring, never reordered
							key={i}
							className={`flex items-start gap-3 rounded border px-4 py-1.5 ${bg}`}
						>
							<Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
							<span className="w-20 shrink-0 text-zinc-500">
								{entry.timestamp?.slice(11, 23) ?? ""}
							</span>
							{entry.source && (
								<span className="w-24 shrink-0 truncate text-zinc-600">
									{entry.source}
								</span>
							)}
							<span className={`${color} break-words`}>{entry.message}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
