/**
 * Help page: overview / wrappee / api / troubleshoot / faq tabs.
 * Every port, endpoint, and fix below is verified against the live code.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

const TABS = [
	{
		id: "overview",
		label: "Overview",
		desc: "What this app is and where everything lives",
	},
	{
		id: "wrappee",
		label: "Library & wrappee",
		desc: "Your discs, the backend, and how to verify them",
	},
	{
		id: "api",
		label: "API & ports",
		desc: "Ports, env vars, and every endpoint",
	},
	{
		id: "troubleshoot",
		label: "Fix errors",
		desc: "Symptom → cause → exact fix",
	},
	{ id: "faq", label: "FAQ", desc: "Asked questions, short answers" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TROUBLE: Array<{ symptom: string; cause: string; fix: string }> = [
	{
		symptom: "Volume list is empty after startup",
		cause: "2026-10-26: DIGIBIB_ROOT pointed elsewhere or discs unmounted.",
		fix: "Set DIGIBIB_ROOT to the folder holding the DB* volumes and restart the backend (stop.bat, then start.bat). Verify: GET /api/health shows root_exists true.",
	},
	{
		symptom: "Chapter text does not match the TOC entry",
		cause: "Fixed 2026-10-26: pre-0.1.1 builds read the wrong TREE.DKA window.",
		fix: "Pull latest and rebuild the index: delete data/search.db, reload the volume, search again.",
	},
	{
		symptom: "Chapter shows one page instead of the whole text",
		cause: "Fixed 2026-10-26: pre-0.1.1 node_text returned a single record.",
		fix: "Pull latest. node_text now returns the full extent with record/record_end.",
	},
	{
		symptom: "First search takes ~10 seconds",
		cause: "Expected: the FTS cache builds by decoding all records once.",
		fix: "Wait once per volume. Repeats are instant (data/search.db).",
	},
	{
		symptom: "Spaced dashes or quotes look wrong",
		cause: "Fixed 2026-10-26: codec v2 reflow, head-drop, de-hyphenation.",
		fix: "Pull latest. Remaining nits: report the volume + record number as an issue.",
	},
	{
		symptom: "Figure thumbnail 404s at full size",
		cause: "Known: 5 of DB008's 53 figures lack a level-4 scan.",
		fix: "Expected — the strip uses a lower level automatically.",
	},
	{
		symptom: "`just ci` fails on ruff format",
		cause: "Vendored or hand-written files drift from ruff format.",
		fix: "Run just fix, re-run just ci.",
	},
];

const FAQS: Array<{ q: string; a: string }> = [
	{
		q: "Where is my data?",
		a: "Your discs stay where they are (DIGIBIB_ROOT). The only writes are data/search.db (FTS cache) and data/llm_keys.json + data/llm_settings.json (chat keys, 0600) inside the repo.",
	},
	{
		q: "How do I point at a different library?",
		a: "Set DIGIBIB_ROOT and restart the backend. Per-request override: append ?root=<path> to any /api URL.",
	},
	{
		q: "How do I rebuild the search index?",
		a: "Delete data/search.db and search once — it rebuilds automatically.",
	},
	{
		q: "How do clients connect (MCP)?",
		a: "Stdio: uv run digibib5-mcp. HTTP MCP is not served; REST is on 14115, proxied at /api by the reader (14114).",
	},
	{
		q: "Which service restarts after a backend code change?",
		a: "Restart the Starlette backend (stop.bat + start.bat). Never kill the child process of an NSSM service; use sc.exe stop/start and verify a new PID owns the port.",
	},
	{
		q: "Where are the logs?",
		a: "The Logs page (ring buffer, newest last) and the backend console. MCP server logs: Claude Desktop log dir.",
	},
	{
		q: "Is there a light mode?",
		a: "Yes, the Sun/Moon button in the topbar (experimental invert filter, choice persists). Accent colors may look off in light mode — that is a known artifact of the inversion.",
	},
	{
		q: "Do I need an account or API key?",
		a: "No for reading/searching/figures. Only the Chat page needs a local LLM (Ollama/LM Studio, free) or a cloud key you paste in Settings.",
	},
];

export function HelpPage() {
	const [tab, setTab] = useState<TabId>("overview");
	const [fixFilter, setFixFilter] = useState("");
	const [faqFilter, setFaqFilter] = useState("");
	const [openFaq, setOpenFaq] = useState<string | null>(null);

	const fixes = TROUBLE.filter((e) =>
		`${e.symptom} ${e.cause} ${e.fix}`
			.toLowerCase()
			.includes(fixFilter.toLowerCase()),
	);
	const faqs = FAQS.filter((e) =>
		`${e.q} ${e.a}`.toLowerCase().includes(faqFilter.toLowerCase()),
	);

	return (
		<div className="mx-auto max-w-4xl space-y-4">
			<h2 className="text-2xl font-bold tracking-tight text-zinc-100">Help</h2>
			<nav
				data-testid="help-tabs"
				className="flex gap-1 border-b border-zinc-800"
			>
				{TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						data-testid={`help-tab-${t.id}`}
						onClick={() => setTab(t.id)}
						title={t.desc}
						className={`border-b-2 px-3 py-2 text-sm transition-colors ${
							tab === t.id
								? "border-amber-400 text-amber-300"
								: "border-transparent text-zinc-500 hover:text-zinc-300"
						}`}
					>
						{t.label}
					</button>
				))}
			</nav>

			{tab === "overview" && (
				<div className="space-y-3 text-sm text-zinc-300">
					<p>
						digibib5-mcp reads your Digitale Bibliothek CD-ROMs: table of
						contents, flowing decoded chapters, full-text search with chapter
						snippets, and the embedded figures — in a reader webapp, over REST,
						and over MCP for AI clients.
					</p>
					<ul className="list-disc space-y-1 pl-5 text-zinc-400">
						<li>
							Reader UI on port 14114 (this page), REST backend on 14115
							(proxied at /api).
						</li>
						<li>
							FastMCP stdio server: one{" "}
							<code className="font-mono">digibib</code> portmanteau tool.
						</li>
						<li>
							Pages: Dashboard (library KPIs), Reader (tree + search + figures),
							Tools (live op harness), Chat (local/cloud LLM), Settings (backend
							+ AI), Logs (ring buffer), Help (this page).
						</li>
					</ul>
				</div>
			)}

			{tab === "wrappee" && (
				<div className="space-y-3 text-sm text-zinc-300">
					<p>
						The wrappee is your <strong>disc library</strong>, not an app:
						folders like <code className="font-mono">DB008\data\</code> with{" "}
						<code className="font-mono">TREE.DKI</code>,{" "}
						<code className="font-mono">TREE.DKA</code>,{" "}
						<code className="font-mono">TEXT.DKI</code>,{" "}
						<code className="font-mono">IMAGES\</code>. It lives wherever you
						mounted it (default{" "}
						<code className="font-mono">K:\Digitale Bibliothek\Bibliothek</code>
						); the backend only reads it.
					</p>
					<ul className="list-disc space-y-1 pl-5 text-zinc-400">
						<li>
							Verify reachability: Settings page backend card shows the root and
							whether discs were found.
						</li>
						<li>
							Onboarding: docs/ONBOARDING.md (first-timer setup, costs: none,
							sanity check).
						</li>
						<li>
							No account, no key, no network — reading, search, and figures work
							fully offline.
						</li>
					</ul>
				</div>
			)}

			{tab === "api" && (
				<div className="space-y-4 text-sm">
					<div>
						<h3 className="mb-2 font-semibold text-zinc-200">Ports</h3>
						<table className="w-full text-left text-xs text-zinc-400">
							<thead>
								<tr className="border-b border-zinc-800 text-zinc-500">
									<th className="py-1 pr-4">Port</th>
									<th className="py-1 pr-4">Owner</th>
									<th className="py-1">Notes</th>
								</tr>
							</thead>
							<tbody>
								<tr className="border-b border-zinc-800/50">
									<td className="py-1 pr-4 font-mono">14114</td>
									<td className="py-1 pr-4">Vite reader</td>
									<td className="py-1">this UI; proxies /api to 14115</td>
								</tr>
								<tr className="border-b border-zinc-800/50">
									<td className="py-1 pr-4 font-mono">14115</td>
									<td className="py-1 pr-4">Starlette backend</td>
									<td className="py-1">
										JSON REST; DIGIBIB_API_PORT overrides
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<div>
						<h3 className="mb-2 font-semibold text-zinc-200">Environment</h3>
						<table className="w-full text-left text-xs text-zinc-400">
							<thead>
								<tr className="border-b border-zinc-800 text-zinc-500">
									<th className="py-1 pr-4">Variable</th>
									<th className="py-1">Effect</th>
								</tr>
							</thead>
							<tbody>
								<tr className="border-b border-zinc-800/50">
									<td className="py-1 pr-4 font-mono">DIGIBIB_ROOT</td>
									<td className="py-1">
										library root (unset default: K:\Digitale
										Bibliothek\Bibliothek)
									</td>
								</tr>
								<tr className="border-b border-zinc-800/50">
									<td className="py-1 pr-4 font-mono">DIGIBIB_API_PORT</td>
									<td className="py-1">backend port (default 14115)</td>
								</tr>
								<tr>
									<td className="py-1 pr-4 font-mono">DIGIBIB_CACHE_DIR</td>
									<td className="py-1">
										FTS + LLM keystore dir (default repo data/)
									</td>
								</tr>
							</tbody>
						</table>
					</div>
					<div>
						<h3 className="mb-2 font-semibold text-zinc-200">
							Endpoints (all exist — try them)
						</h3>
						<ul className="space-y-1 font-mono text-xs text-zinc-400">
							{[
								"GET /api/health",
								"GET /api/volumes",
								"GET /api/stats",
								"GET /api/logs?limit=200",
								"GET /api/tools (+ /{name}, POST /{name}/run)",
								"GET /api/volume/{id}/toc",
								"GET /api/volume/{id}/node/{n}/text",
								"GET /api/volume/{id}/search?q=",
								"GET /api/volume/{id}/images",
								"GET /api/llm/providers (+ models/test/chat/stream/gpus/settings/onboarding/install)",
							].map((e) => (
								<li key={e}>{e}</li>
							))}
						</ul>
					</div>
					<p className="text-xs text-zinc-500">
						Start/restart: <code className="font-mono">stop.bat</code>, then{" "}
						<code className="font-mono">start.bat</code> (kills the port owner
						first). Never kill an NSSM child process — use the service manager
						and verify a new PID owns the port. Full install:{" "}
						<Link to="/settings" className="text-blue-400 hover:underline">
							Settings
						</Link>
						, <code className="font-mono">docs/ONBOARDING.md</code>.
					</p>
				</div>
			)}

			{tab === "troubleshoot" && (
				<div className="space-y-3">
					<input
						value={fixFilter}
						onChange={(e) => setFixFilter(e.target.value)}
						placeholder="Filter fixes…"
						data-testid="help-search"
						className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
					/>
					<div data-testid="help-fixes" className="space-y-2">
						{fixes.map((f) => (
							<div
								key={f.symptom}
								className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm"
							>
								<p className="font-medium text-zinc-100">“{f.symptom}”</p>
								<p className="mt-1 text-zinc-400">
									<span className="text-zinc-500">Cause: </span>
									{f.cause}
								</p>
								<p className="mt-1 text-zinc-300">
									<span className="text-zinc-500">Fix: </span>
									{f.fix}
								</p>
							</div>
						))}
						{fixes.length === 0 && (
							<p className="text-sm text-zinc-500">No fixes match.</p>
						)}
					</div>
				</div>
			)}

			{tab === "faq" && (
				<div className="space-y-3">
					<input
						value={faqFilter}
						onChange={(e) => setFaqFilter(e.target.value)}
						placeholder="Filter questions…"
						data-testid="help-search"
						className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
					/>
					<div data-testid="help-faq" className="space-y-2">
						{faqs.map((f) => (
							<div
								key={f.q}
								data-testid="faq-item"
								className="rounded-lg border border-zinc-800 bg-zinc-900"
							>
								<button
									type="button"
									onClick={() => setOpenFaq(openFaq === f.q ? null : f.q)}
									className="w-full px-3 py-2 text-left text-sm font-medium text-zinc-100"
								>
									{f.q}
								</button>
								{openFaq === f.q && (
									<p className="px-3 pb-3 text-sm text-zinc-400">{f.a}</p>
								)}
							</div>
						))}
						{faqs.length === 0 && (
							<p className="text-sm text-zinc-500">No questions match.</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
