/**
 * Dashboard: hero + onboarding cue, library KPIs, volume cards.
 * MOCK-until-onboarded: sample KPIs show with MOCK badges only while no
 * real volume is detected; they clear the moment volumes appear.
 */

import { motion } from "framer-motion";
import {
	BookOpen,
	Database,
	FileText,
	Image as ImageIcon,
	Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isOnboardedLibrary, MOCK_KPIS } from "@/lib/mockOnboarding";

interface Stats {
	volumes: number;
	total_records: number;
	total_figures: number;
	index_bytes: number;
}

interface Volume {
	id: string;
	title: string;
}

const KPI_DEFS = [
	{
		key: "volumes",
		label: "Volumes",
		icon: Database,
		color: "#3b82f6",
		testid: "kpi-volumes",
	},
	{
		key: "records",
		label: "Records",
		icon: FileText,
		color: "#22c55e",
		testid: "kpi-records",
	},
	{
		key: "figures",
		label: "Figures",
		icon: ImageIcon,
		color: "#f59e0b",
		testid: "kpi-figures",
	},
	{
		key: "index",
		label: "Index MB",
		icon: Search,
		color: "#a855f7",
		testid: "kpi-index",
	},
] as const;

function formatMB(bytes: number): string {
	return (bytes / 1048576).toFixed(1);
}

export function Dashboard() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [volumes, setVolumes] = useState<Volume[]>([]);
	const [root, setRoot] = useState("");

	useEffect(() => {
		(async () => {
			try {
				const [s, v, h] = await Promise.all([
					fetch("/api/stats").then((r) => r.json()),
					fetch("/api/volumes").then((r) => r.json()),
					fetch("/api/health").then((r) => r.json()),
				]);
				setStats(s);
				setVolumes(v.volumes ?? []);
				setRoot(h.root ?? "");
			} catch {
				/* offline — Shell dot shows it */
			}
		})();
	}, []);

	const onboarded = isOnboardedLibrary(volumes.length);
	const kpis = onboarded
		? {
				volumes: stats?.volumes ?? 0,
				records: stats?.total_records ?? 0,
				figures: stats?.total_figures ?? 0,
				index: stats ? formatMB(stats.index_bytes) : "0.0",
			}
		: {
				volumes: MOCK_KPIS.volumes,
				records: MOCK_KPIS.records,
				figures: MOCK_KPIS.figures,
				index: "—",
			};

	return (
		<div data-testid="dashboard" className="mx-auto max-w-6xl space-y-6">
			{/* Hero */}
			<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
							Digitale Bibliothek, readable again
						</h1>
						<p className="mt-1 text-sm text-zinc-400">
							Browse the table of contents, read flowing chapters, search the
							full text, view the figures — from your own CD-ROMs.
						</p>
					</div>
					<Link
						to="/reader"
						className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
					>
						<BookOpen className="h-4 w-4" /> Open reader
					</Link>
				</div>
				{!onboarded && (
					<div
						className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4"
						data-testid="mock-data-banner"
					>
						<p className="text-sm text-red-200">
							<span
								data-testid="mock-badge"
								className="mr-2 rounded border border-dashed border-red-400/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300"
							>
								Mock
							</span>
							No library detected{root ? ` at ${root}` : ""} — showing sample
							numbers until your discs are found. Set{" "}
							<code className="font-mono">DIGIBIB_ROOT</code> and restart the
							backend.
						</p>
						<Link
							to="/settings"
							data-testid="onboarding-cue"
							className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 md:w-auto"
						>
							Complete onboarding — connect your library
						</Link>
					</div>
				)}
			</div>

			{/* KPIs */}
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{KPI_DEFS.map(({ key, label, icon: Icon, color, testid }, i) => (
					<motion.div
						key={key}
						data-testid={testid}
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: i * 0.05 }}
						className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
					>
						<div className="flex items-center justify-between">
							<div
								className="flex h-8 w-8 items-center justify-center rounded-lg"
								style={{
									background: `${color}20`,
									border: `1px solid ${color}40`,
								}}
							>
								<Icon className="h-4 w-4" style={{ color }} />
							</div>
							{!onboarded && (
								<span
									data-testid="mock-badge"
									className="rounded border border-dashed border-red-400/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300"
								>
									Mock
								</span>
							)}
						</div>
						<div className="mt-3 font-mono text-2xl font-semibold text-zinc-100">
							{String(kpis[key])}
						</div>
						<div className="mt-1 text-xs text-zinc-500">{label}</div>
					</motion.div>
				))}
			</div>

			{/* Volumes */}
			<div className="rounded-xl border border-zinc-800 bg-zinc-900">
				<div className="border-b border-zinc-800 px-5 py-4">
					<span className="text-sm font-semibold text-zinc-100">Volumes</span>
				</div>
				<div className="divide-y divide-zinc-800">
					{volumes.length === 0 && (
						<div className="px-5 py-8 text-center text-sm text-zinc-500">
							No volumes found. Point DIGIBIB_ROOT at your Digitale Bibliothek
							folder.
						</div>
					)}
					{volumes.map((v) => (
						<Link
							key={v.id}
							to={`/reader?vol=${encodeURIComponent(v.id)}`}
							className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-800/40"
						>
							<BookOpen className="h-4 w-4 shrink-0 text-amber-400" />
							<div className="min-w-0">
								<div className="truncate text-sm font-medium text-zinc-200">
									<span className="mr-2 font-mono text-xs text-zinc-500">
										{v.id}
									</span>
									{v.title}
								</div>
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
