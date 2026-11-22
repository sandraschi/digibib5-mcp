import { BookOpen, CheckCircle2, Disc, FolderOpen, Loader2, X, XCircle } from "lucide-react";
import { useState } from "react";
import {
	type LibrarySettings,
	type LibraryTestResult,
	saveLibrarySettings,
	testLibraryRoot,
} from "@/lib/librarySettings";

interface Props {
	initial: LibrarySettings;
	onDone: (updated: LibrarySettings) => void;
	onClose?: () => void;
}

export function LibraryOnboardingModal({ initial, onDone, onClose }: Props) {
	const [root, setRoot] = useState(initial.root);
	const [testing, setTesting] = useState(false);
	const [saving, setSaving] = useState(false);
	const [testResult, setTestResult] = useState<LibraryTestResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleTest() {
		setTesting(true);
		setError(null);
		try {
			const res = await testLibraryRoot(root);
			setTestResult(res);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Test failed");
			setTestResult(null);
		} finally {
			setTesting(false);
		}
	}

	async function handleConnect() {
		setSaving(true);
		setError(null);
		try {
			const updated = await saveLibrarySettings({ root, onboarded: true });
			onDone(updated);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save library root");
		} finally {
			setSaving(false);
		}
	}

	async function handleSkip() {
		setSaving(true);
		setError(null);
		try {
			const updated = await saveLibrarySettings({ onboarded: true });
			onDone(updated);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to dismiss onboarding");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
			data-testid="onboarding-modal"
		>
			<div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/20 text-amber-400">
							<BookOpen className="h-5 w-5" />
						</div>
						<div>
							<h2 className="text-xl font-semibold text-zinc-100">
								Welcome to Digibib5 Reader
							</h2>
							<p className="text-xs text-zinc-400">
								First-time setup &amp; library connection
							</p>
						</div>
					</div>
					{onClose && (
						<button
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
						>
							<X className="h-4 w-4" />
						</button>
					)}
				</div>

				{/* What this is */}
				<div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
					<p className="font-medium text-zinc-100">What is this?</p>
					<p className="mt-1 text-zinc-400">
						<strong className="text-zinc-200">digibib5-mcp</strong> is a modern
						reader and MCP server for Directmedia&apos;s classic{" "}
						<em>Digitale Bibliothek 5</em> CD-ROMs. It reverse-engineers the{" "}
						<code className="font-mono text-xs text-amber-300">.DKI</code>{" "}
						volume format so you can browse the table of contents, read flowing
						chapters, run full-text FTS5 searches, view embedded figures, and
						query your collection with AI tools — completely offline and free.
					</p>
				</div>

				{/* How to get the CD-ROMs */}
				<div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-300">
					<div className="flex items-center gap-2 font-medium text-zinc-100">
						<Disc className="h-4 w-4 text-sky-400" />
						<span>Where do the CD-ROMs come from?</span>
					</div>
					<p className="mt-1 text-xs text-zinc-400">
						No book content is bundled in this repo — you point it at your own
						Digitale Bibliothek volumes (each a folder like{" "}
						<code className="font-mono text-zinc-300">DB008\data\DIGIBIB.TXT</code>):
					</p>
					<ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-400">
						<li>
							<strong className="text-zinc-200">Your own discs / ISOs:</strong>{" "}
							Copy or mount your CD-ROMs into one parent folder (e.g.{" "}
							<code className="font-mono text-zinc-300">
								K:\Digitale Bibliothek\Bibliothek
							</code>
							).
						</li>
						<li>
							<strong className="text-zinc-200">Second-hand market:</strong>{" "}
							Original discs are widely available via antiquarian bookshops and
							online marketplaces.
						</li>
						<li>
							<strong className="text-zinc-200">Digital archives:</strong>{" "}
							Out-of-print editions are also preserved in public digital
							preservation libraries (e.g. Internet Archive).
						</li>
					</ul>
				</div>

				{/* Library root setup */}
				<div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
					<label
						htmlFor="onboarding-root"
						className="flex items-center gap-2 text-sm font-medium text-zinc-100"
					>
						<FolderOpen className="h-4 w-4 text-amber-400" />
						<span>Library Root Folder</span>
					</label>
					<p className="mt-1 text-xs text-zinc-400">
						Point this at the parent folder containing your{" "}
						<code className="font-mono">DB*</code> volume directories. You can
						change this anytime in Settings.
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<input
							id="onboarding-root"
							type="text"
							value={root}
							onChange={(e) => {
								setRoot(e.target.value);
								setTestResult(null);
							}}
							placeholder="K:\Digitale Bibliothek\Bibliothek"
							className="min-w-[260px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
						/>
						<button
							type="button"
							onClick={handleTest}
							disabled={testing || !root.trim()}
							className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
						>
							{testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
							Test
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
								<div className="mt-1.5 truncate text-[11px] text-emerald-300/80">
									Sample:{" "}
									{testResult.sample_volumes
										.map((v) => `${v.id} (${v.title})`)
										.join(", ")}
								</div>
							)}
						</div>
					)}

					{error && (
						<div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">
							{error}
						</div>
					)}
				</div>

				<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						onClick={handleSkip}
						disabled={saving}
						className="text-xs text-zinc-400 hover:text-zinc-200"
					>
						Skip for now (explore in sample mode)
					</button>
					<button
						type="button"
						onClick={handleConnect}
						disabled={saving || !root.trim()}
						className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
					>
						{saving && <Loader2 className="h-4 w-4 animate-spin" />}
						Connect &amp; Continue
					</button>
				</div>
			</div>
		</div>
	);
}
