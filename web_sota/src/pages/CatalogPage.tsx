import { BookOpen, CheckCircle2, Library, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/api/client";
import { PageLoading } from "@/components/PageLoading";

interface CatalogEntry {
	id: string;
	title: string;
	category: string;
	language: string;
	summary: string;
	installed: boolean;
}

interface CatalogResponse {
	success: boolean;
	count: number;
	installed_count: number;
	categories: string[];
	volumes: CatalogEntry[];
}

export function CatalogPage() {
	const [entries, setEntries] = useState<CatalogEntry[]>([]);
	const [categories, setCategories] = useState<string[]>([]);
	const [installedCount, setInstalledCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState("All");
	const [installedOnly, setInstalledOnly] = useState(false);

	useEffect(() => {
		apiGet<CatalogResponse>("/api/catalog")
			.then((res) => {
				setEntries(res.volumes);
				setCategories(res.categories);
				setInstalledCount(res.installed_count);
			})
			.catch((e) =>
				setError(e instanceof Error ? e.message : "Failed to load catalog"),
			)
			.finally(() => setLoading(false));
	}, []);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return entries.filter((e) => {
			if (installedOnly && !e.installed) return false;
			if (category !== "All" && e.category !== category) return false;
			if (!q) return true;
			return (
				e.id.toLowerCase().includes(q) ||
				e.title.toLowerCase().includes(q) ||
				e.summary.toLowerCase().includes(q) ||
				e.category.toLowerCase().includes(q)
			);
		});
	}, [entries, query, category, installedOnly]);

	if (loading) return <PageLoading label="Loading CD-ROM catalog…" />;

	return (
		<div className="mx-auto max-w-6xl space-y-5" data-testid="catalog-page">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-100">
						<Library className="h-6 w-6 text-amber-400" />
						CD-ROM Catalog
					</h2>
					<p className="mt-1 text-sm text-zinc-400">
						{filtered.length} of {entries.length} volumes shown ·{" "}
						{installedCount} installed in your library root.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
						<input
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Filter by title, author, topic…"
							data-testid="catalog-search"
							className="w-64 rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-8 pr-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
						/>
					</div>
					<label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
						<input
							type="checkbox"
							checked={installedOnly}
							onChange={(e) => setInstalledOnly(e.target.checked)}
							className="accent-amber-500"
						/>
						Installed only
					</label>
				</div>
			</div>

			{/* Category pills */}
			<div className="flex flex-wrap gap-1.5">
				{["All", ...categories].map((cat) => (
					<button
						key={cat}
						type="button"
						onClick={() => setCategory(cat)}
						className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
							category === cat
								? "bg-amber-600 text-white"
								: "border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
						}`}
					>
						{cat}
					</button>
				))}
			</div>

			{error && (
				<div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
					{error}
				</div>
			)}

			{filtered.length === 0 ? (
				<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
					No volumes match your filter.
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2">
					{filtered.map((vol) => (
						<div
							key={vol.id}
							className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
						>
							<div>
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
											{vol.id}
										</span>
										<span className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
											{vol.category}
										</span>
										<span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-500">
											{vol.language}
										</span>
									</div>
									{vol.installed ? (
										<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
											<CheckCircle2 className="h-3 w-3" />
											Installed
										</span>
									) : (
										<span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500">
											Not installed
										</span>
									)}
								</div>
								<h3 className="mt-2.5 text-base font-semibold text-zinc-100">
									{vol.title}
								</h3>
								<p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
									{vol.summary}
								</p>
							</div>
							{vol.installed && (
								<div className="mt-4 flex justify-end border-t border-zinc-800/80 pt-3">
									<Link
										to={`/reader?vol=${encodeURIComponent(vol.id)}`}
										className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
									>
										<BookOpen className="h-3.5 w-3.5" />
										Open in Reader
									</Link>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
