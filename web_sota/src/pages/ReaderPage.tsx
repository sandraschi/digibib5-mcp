import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	api,
	type Figure,
	type GlobalSearchHit,
	type SearchHit,
	type TextResponse,
	type TocNode,
	type VolumeRef,
} from "../lib/api";

// ------------------------------------------------------------------ TOC tree

function TreeNode({
	node,
	activeIndex,
	onPick,
}: {
	node: TocNode;
	activeIndex: number | null;
	onPick: (n: TocNode) => void;
}) {
	const [open, setOpen] = useState(node.depth < 1);
	const hasKids =
		(node.children && node.children.length > 0) || !!node.children_count;
	const active = node.index === activeIndex;
	return (
		<li>
			<div
				className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm ${
					active
						? "bg-sky-600/30 text-sky-200"
						: "hover:bg-white/5 text-gray-300"
				}`}
			>
				<button
					type="button"
					className="w-4 shrink-0 text-gray-500 hover:text-gray-300"
					onClick={() => hasKids && setOpen((o) => !o)}
					aria-label={hasKids ? (open ? "collapse" : "expand") : undefined}
				>
					{hasKids ? (open ? "\u25be" : "\u25b8") : ""}
				</button>
				<button
					type="button"
					className="flex-1 truncate text-left"
					title={node.title}
					onClick={() => onPick(node)}
				>
					{node.title || "(untitled)"}
				</button>
			</div>
			{open && node.children && (
				<ul className="ml-4 border-l border-white/5 pl-2">
					{node.children.map((c) => (
						<TreeNode
							key={c.index}
							node={c}
							activeIndex={activeIndex}
							onPick={onPick}
						/>
					))}
				</ul>
			)}
		</li>
	);
}

// ------------------------------------------------------------------- app

export function ReaderPage() {
	const [searchParams] = useSearchParams();
	const [volumes, setVolumes] = useState<VolumeRef[]>([]);
	const [vid, setVid] = useState<string>("");
	const [tocTitle, setTocTitle] = useState("");
	const [toc, setToc] = useState<TocNode[]>([]);
	const [recordCount, setRecordCount] = useState(0);
	const [activeNode, setActiveNode] = useState<number | null>(null);
	const [content, setContent] = useState<TextResponse | null>(null);
	const [recInput, setRecInput] = useState("0");
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchHit[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [libraryRoot, setLibraryRoot] = useState("");
	const [descriptor, setDescriptor] = useState<Record<string, string> | null>(
		null,
	);
	const [showInfo, setShowInfo] = useState(false);
	const [showFigures, setShowFigures] = useState(false);
	const [figures, setFigures] = useState<Figure[]>([]);
	const [figureLevels, setFigureLevels] = useState<number[]>([]);
	const [figureLevel, setFigureLevel] = useState<number | null>(null);
	const [globalQuery, setGlobalQuery] = useState("");
	const [globalResults, setGlobalResults] = useState<GlobalSearchHit[] | null>(
		null,
	);
	const [indexedCount, setIndexedCount] = useState<number | null>(null);

	useEffect(() => {
		api
			.volumes()
			.then((r) => setVolumes(r.volumes))
			.catch((e) => setError(String(e)));
		fetch("/api/health")
			.then((r) => r.json())
			.then((h: { root?: string }) => {
				if (h.root) setLibraryRoot(h.root);
			})
			.catch(() => {});
	}, []);

	// Deep links (/reader?vol=DB008, /reader?q=term) are handled after
	// runSearch is defined, below.

	const loadVolume = useCallback(async (id: string) => {
		setVid(id);
		setToc([]);
		setContent(null);
		setActiveNode(null);
		setError(null);
		setResults(null);
		setQuery("");
		setDescriptor(null);
		setShowInfo(false);
		setShowFigures(false);
		setFigures([]);
		setFigureLevels([]);
		setFigureLevel(null);
		if (!id) return;
		setLoading(true);
		try {
			const t = await api.toc(id);
			setToc(t.toc);
			setTocTitle(t.title);
			setRecordCount(t.record_count);
			api
				.descriptor(id)
				.then((d) => setDescriptor(d.descriptor))
				.catch(() => {});
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	const loadFigures = useCallback(
		async (level?: number) => {
			if (!vid) return;
			setLoading(true);
			setError(null);
			try {
				const res = await api.images(vid, level);
				setFigures(res.images);
				setFigureLevels(res.levels);
				setFigureLevel(res.level);
				setShowFigures(true);
			} catch (e) {
				setError(String(e));
			} finally {
				setLoading(false);
			}
		},
		[vid],
	);

	const runGlobalSearch = useCallback(async (q: string) => {
		if (!q.trim()) {
			setGlobalResults(null);
			return;
		}
		setError(null);
		setLoading(true);
		try {
			const r = await api.searchAll(q.trim());
			setGlobalResults(r.results);
			setIndexedCount(r.indexed_volumes);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	const pickNode = useCallback(
		async (n: TocNode) => {
			setActiveNode(n.index);
			setError(null);
			setLoading(true);
			try {
				setContent(await api.nodeText(vid, n.index));
			} catch (e) {
				setError(String(e));
			} finally {
				setLoading(false);
			}
		},
		[vid],
	);

	const showRecord = useCallback(
		async (idx: number) => {
			if (!vid || idx < 0 || idx >= recordCount) return;
			setActiveNode(null);
			setRecInput(String(idx));
			setError(null);
			setLoading(true);
			try {
				setContent(await api.recordText(vid, idx));
			} catch (e) {
				setError(String(e));
			} finally {
				setLoading(false);
			}
		},
		[vid, recordCount],
	);

	const runSearch = useCallback(
		async (q: string, volumeId?: string) => {
			const target = volumeId ?? vid;
			if (!target || !q.trim()) {
				setResults(null);
				return;
			}
			setError(null);
			setLoading(true);
			try {
				const r = await api.search(target, q.trim());
				setResults(r.results);
			} catch (e) {
				setError(String(e));
			} finally {
				setLoading(false);
			}
		},
		[vid],
	);

	// Deep links: /reader?vol=DB008 and /reader?q=term (&vol= for context).
	useEffect(() => {
		const vol = searchParams.get("vol") || "";
		const q = searchParams.get("q") || "";
		if (!vol && !q) return;
		void (async () => {
			if (vol) await loadVolume(vol);
			if (q) {
				setQuery(q);
				await runSearch(q, vol || undefined);
			}
		})();
	}, [loadVolume, runSearch, searchParams]);

	const showHit = useCallback(
		async (h: SearchHit) => {
			if (!vid) return;
			setError(null);
			setLoading(true);
			try {
				if (h.node_index != null) {
					setActiveNode(h.node_index);
					setRecInput(String(h.record));
					setContent(await api.nodeText(vid, h.node_index));
				} else {
					await showRecord(h.record);
					return;
				}
			} catch (e) {
				setError(String(e));
			} finally {
				setLoading(false);
			}
		},
		[vid, showRecord],
	);

	const figLevels = content?.image_levels ?? [];
	const figThumb = figLevels.includes(2) ? 2 : figLevels[0];
	const figFull = figLevels[figLevels.length - 1];

	return (
		<div className="flex h-full flex-col" data-testid="reader-page">
			<header className="flex items-center gap-3 border-b border-white/10 bg-[#0e1420] px-4 py-2.5">
				<span className="text-lg font-semibold tracking-tight text-sky-300">
					Digibib5 Reader
				</span>
				<select
					className="ml-2 max-w-[48ch] rounded border border-white/10 bg-[#121a28] px-2 py-1 text-sm text-gray-200"
					value={vid}
					onChange={(e) => loadVolume(e.target.value)}
				>
					<option value="">Choose a CD-ROM volume...</option>
					{volumes.map((v) => (
						<option key={v.id} value={v.id}>
							{v.id} - {v.title}
						</option>
					))}
				</select>
				{vid && (
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => setShowInfo((v) => !v)}
							className={`rounded border px-2 py-1 text-xs ${
								showInfo
									? "border-sky-500/60 bg-sky-600/20 text-sky-200"
									: "border-white/10 text-gray-300 hover:bg-white/5"
							}`}
						>
							Info
						</button>
						<button
							type="button"
							onClick={() => {
								if (showFigures) {
									setShowFigures(false);
								} else {
									void loadFigures();
								}
							}}
							className={`rounded border px-2 py-1 text-xs ${
								showFigures
									? "border-sky-500/60 bg-sky-600/20 text-sky-200"
									: "border-white/10 text-gray-300 hover:bg-white/5"
							}`}
						>
							Figures
						</button>
					</div>
				)}
				<span className="ml-auto truncate text-xs text-gray-500" title={libraryRoot}>
					{volumes.length} discs - {libraryRoot || "DIGIBIB_ROOT"}
				</span>
			</header>
			<div className="flex min-h-0 flex-1">
				{/* TOC pane */}
				<aside className="flex w-[34%] min-w-[280px] max-w-[460px] flex-col border-r border-white/10 bg-[#0c1220]">
					<div className="border-b border-white/5 px-3 py-2">
						<div
							className="truncate text-sm font-medium text-gray-200"
							title={tocTitle}
						>
							{tocTitle || "Table of contents"}
						</div>
						{recordCount > 0 && (
							<>
								<div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
									<span>{recordCount} records</span>
									<span className="mx-1">-</span>
									<span>jump to #</span>
									<input
										className="w-16 rounded border border-white/10 bg-[#121a28] px-1 py-0.5 text-gray-200"
										value={recInput}
										onChange={(e) =>
											setRecInput(e.target.value.replace(/[^0-9]/g, ""))
										}
										onKeyDown={(e) =>
											e.key === "Enter" && showRecord(Number(recInput))
										}
									/>
									<button
										type="button"
										className="rounded bg-sky-700/50 px-1.5 py-0.5 text-sky-200 hover:bg-sky-700"
										onClick={() => showRecord(Number(recInput))}
									>
										go
									</button>
								</div>
								<div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
									<span>search</span>
									<input
										className="min-w-0 flex-1 rounded border border-white/10 bg-[#121a28] px-1 py-0.5 text-gray-200"
										placeholder="word, phrase, prefix* …"
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") void runSearch(query);
											if (e.key === "Escape") {
												setQuery("");
												setResults(null);
											}
										}}
									/>
									<button
										type="button"
										className="rounded bg-sky-700/50 px-1.5 py-0.5 text-sky-200 hover:bg-sky-700"
										onClick={() => void runSearch(query)}
									>
										go
									</button>
									{results != null && (
										<button
											type="button"
											className="rounded px-1.5 py-0.5 text-gray-400 hover:text-gray-200"
											title="Clear search"
											onClick={() => {
												setQuery("");
												setResults(null);
											}}
										>
											×
										</button>
									)}
								</div>
							</>
						)}
					</div>
					<div className="min-h-0 flex-1 overflow-auto p-2">
						{results != null ? (
							results.length === 0 ? (
								<p className="px-2 py-4 text-sm text-gray-500">
									No hits. Try fewer words or a prefix*.
								</p>
							) : (
								<ul className="space-y-1">
									{results.map((h) => (
										<li key={h.record}>
											<button
												type="button"
												className="w-full rounded px-2 py-1.5 text-left hover:bg-white/5"
												onClick={() => void showHit(h)}
											>
												<div className="truncate text-sm text-sky-200">
													{h.chapter ?? `Record #${h.record}`}
												</div>
												<div className="text-xs text-gray-500">
													record #{h.record}
												</div>
												<div className="mt-0.5 line-clamp-3 text-xs text-gray-400">
													{h.snippet}
												</div>
											</button>
										</li>
									))}
								</ul>
							)
						) : toc.length === 0 ? (
							<div className="space-y-3 px-2 py-3">
								{vid ? (
									<p className="text-sm text-gray-500">No table of contents.</p>
								) : (
									<>
										<p className="text-sm text-gray-500">
											Select a volume above, or search across indexed volumes:
										</p>
										<div className="flex items-center gap-1 text-xs text-gray-500">
											<input
												className="min-w-0 flex-1 rounded border border-white/10 bg-[#121a28] px-2 py-1 text-gray-200"
												placeholder="Search indexed volumes…"
												value={globalQuery}
												onChange={(e) => setGlobalQuery(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter")
														void runGlobalSearch(globalQuery);
												}}
											/>
											<button
												type="button"
												className="rounded bg-sky-700/50 px-2 py-1 text-sky-200 hover:bg-sky-700"
												onClick={() => void runGlobalSearch(globalQuery)}
											>
												go
											</button>
										</div>
										{globalResults != null && (
											<div className="space-y-1">
												<div className="text-[11px] text-gray-500">
													{globalResults.length} hits across {indexedCount ?? 0}{" "}
													indexed volume(s)
												</div>
												{globalResults.map((h) => (
													<button
														key={`${h.volume_id}-${h.record}`}
														type="button"
														className="w-full rounded px-2 py-1.5 text-left hover:bg-white/5"
														onClick={() => {
															void (async () => {
																await loadVolume(h.volume_id);
																setRecInput(String(h.record));
																setContent(
																	await api.recordText(h.volume_id, h.record),
																);
															})();
														}}
													>
														<div className="text-xs font-medium text-sky-300">
															{h.volume_id} · record #{h.record}
														</div>
														<div className="mt-0.5 line-clamp-2 text-xs text-gray-400">
															{h.snippet}
														</div>
													</button>
												))}
											</div>
										)}
									</>
								)}
							</div>
						) : (
							<ul>
								{toc.map((n) => (
									<TreeNode
										key={n.index}
										node={n}
										activeIndex={activeNode}
										onPick={pickNode}
									/>
								))}
							</ul>
						)}
					</div>
				</aside>

				{/* content pane */}
				<main className="min-h-0 flex-1 overflow-auto">
					<div className="mx-auto max-w-3xl px-6 py-5">
						{error && (
							<div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
								{error}
							</div>
						)}
						{showInfo && descriptor && (
							<div className="mb-5 rounded-lg border border-white/10 bg-[#0e1420] p-4">
								<div className="mb-2 flex items-center justify-between">
									<h2 className="text-sm font-semibold text-sky-300">
										Volume Metadata (DIGIBIB.TXT)
									</h2>
									<button
										type="button"
										onClick={() => setShowInfo(false)}
										className="text-xs text-gray-400 hover:text-gray-200"
									>
										Close
									</button>
								</div>
								<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
									{Object.entries(descriptor).map(([k, v]) => (
										<div key={k} className="contents">
											<dt className="text-gray-500">{k}</dt>
											<dd className="break-all text-gray-200">{v}</dd>
										</div>
									))}
								</dl>
							</div>
						)}
						{showFigures && (
							<div className="mb-5 rounded-lg border border-white/10 bg-[#0e1420] p-4">
								<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
									<h2 className="text-sm font-semibold text-sky-300">
										Volume Figures ({figures.length})
									</h2>
									<div className="flex items-center gap-2 text-xs">
										{figureLevels.length > 0 && (
											<select
												className="rounded border border-white/10 bg-[#121a28] px-2 py-0.5 text-gray-200"
												value={figureLevel ?? ""}
												onChange={(e) =>
													void loadFigures(Number(e.target.value))
												}
											>
												{figureLevels.map((lv) => (
													<option key={lv} value={lv}>
														Level {lv}
													</option>
												))}
											</select>
										)}
										<button
											type="button"
											onClick={() => setShowFigures(false)}
											className="text-gray-400 hover:text-gray-200"
										>
											Close
										</button>
									</div>
								</div>
								{figures.length === 0 ? (
									<p className="text-xs text-gray-500">
										No figures found in this volume.
									</p>
								) : (
									<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
										{figures.slice(0, 120).map((f) => (
											<a
												key={f.name}
												href={f.url}
												target="_blank"
												rel="noreferrer"
												className="group rounded border border-white/10 bg-[#121a28] p-2 hover:border-sky-500/50"
											>
												<img
													src={f.url}
													alt={f.name}
													loading="lazy"
													className="h-24 w-full rounded bg-white object-contain"
												/>
												<div className="mt-1 truncate font-mono text-[11px] text-gray-300 group-hover:text-sky-300">
													{f.name}
												</div>
											</a>
										))}
									</div>
								)}
							</div>
						)}
						{loading && <div className="text-sm text-gray-500">Loading...</div>}
						{!loading && !content && !error && (
							<div className="mt-20 text-center text-gray-500">
								<p className="text-lg">
									Pick an entry from the tree, search, or jump to a record.
								</p>
								<p className="mt-2 text-sm">
									Reverse-engineered reader for Directmedia's Digitale
									Bibliothek 5 discs.
								</p>
							</div>
						)}
						{content && (
							<article>
								<h1 className="mb-1 text-xl font-semibold text-gray-100">
									{content.title ?? `Record ${content.record_index}`}
								</h1>
								<div className="mb-4 flex items-center gap-3 text-xs text-gray-500">
									{content.node_index != null && (
										<span>node #{content.node_index}</span>
									)}
									{content.record != null && content.record_end != null && (
										<span>
											records #{content.record}-{content.record_end - 1}
											{content.records_total != null &&
												content.records_total > 1 && (
													<> ({content.records_total})</>
												)}
											{content.truncated && (
												<> - truncated, chapter continues</>
											)}
										</span>
									)}
									{content.record != null && content.record_end == null && (
										<span>record #{content.record}</span>
									)}
									{content.record_index != null && (
										<span>record #{content.record_index}</span>
									)}
								</div>
								{content.images != null &&
									content.images.length > 0 &&
									figLevels.length > 0 && (
										<div className="mb-4">
											<div className="mb-1 text-xs uppercase tracking-wide text-gray-500">
												Figures ({content.images.length})
											</div>
											<div className="flex flex-wrap gap-2">
												{content.images.map((name) => (
													<a
														key={name}
														href={api.imageUrl(vid, figFull, name)}
														target="_blank"
														rel="noreferrer"
														title={`${name} - open full size`}
													>
														<img
															src={api.imageUrl(vid, figThumb, name)}
															alt={name}
															loading="lazy"
															className="h-20 rounded border border-white/10 bg-white object-cover hover:border-sky-500/50"
														/>
													</a>
												))}
											</div>
										</div>
									)}
								{content.text?.trim() ? (
									<div className="record-prose text-gray-200" lang="de">
										{content.text}
									</div>
								) : (
									<div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
										No text for this node. Try the "jump to #" record browser on
										the left to read records directly.
									</div>
								)}
								<p className="mt-6 border-t border-white/5 pt-3 text-xs text-gray-600">
									Text decode is v2 (flowing paragraphs, heads dropped) -
									readable but not yet byte-faithful. A chapter shows all its
									records; the volume root is capped at 100.
								</p>
							</article>
						)}
					</div>
				</main>
			</div>
		</div>
	);
}
