/**
 * SOTA AppLayout / Shell Template (2026)
 *
 * Fleet-standard sidebar + topbar layout.
 * Drop into any webapp. Customize NAV items and constants marked CUSTOMIZE.
 *
 * Requires: react, react-router-dom, lucide-react, framer-motion, zustand, clsx
 * Also requires: useZoom() hook and CSS variables in index.css (see companion files)
 */

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
	/* CUSTOMIZE: import icons used in nav */
	BookOpen,
	ChevronLeft,
	ChevronRight,
	HelpCircle,
	LayoutDashboard,
	MessageSquare,
	Moon,
	Search,
	Settings,
	Sun,
	Terminal,
	Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { create } from "zustand";
import { version as appVersion } from "../../package.json";
import { useZoom } from "../hooks/useZoom";

/* ── Connection store ─────────────────────────────────────────────────────── */

export const useConnection = create<{
	state: "connecting" | "connected" | "offline" | "error";
	lastError: string | null;
}>(() => ({ state: "connecting", lastError: null }));

/* ── Health polling ────────────────────────────────────────────────────────── */

const HEALTH_BACKOFF = [1, 2, 4, 8, 16, 30];

/* Same origin: Vite proxies /api to the backend. */
const HEALTH_URL = "/api/health";

/* ── Navigation items ──────────────────────────────────────────────────────── */

/* CUSTOMIZE: add/remove nav items for this repo */
const NAV = [
	{ to: "/", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/reader", label: "Reader", icon: BookOpen },
	{ to: "/tools", label: "Tools", icon: Wrench },
	{ to: "/chat", label: "Chat", icon: MessageSquare },
	{ to: "/settings", label: "Settings", icon: Settings },
	{ to: "/logs", label: "Logs", icon: Terminal },
	{ to: "/help", label: "Help", icon: HelpCircle },
];

const PAGE_TITLES: Record<string, string> = {
	"/": "Dashboard",
	"/reader": "Reader",
	"/tools": "Tools",
	"/chat": "Chat",
	"/settings": "Settings",
	"/logs": "Logs",
	"/help": "Help",
};

/* ── Shell component ───────────────────────────────────────────────────────── */

export function Shell({ children }: { children: React.ReactNode }) {
	useZoom();
	const navigate = useNavigate();
	const [collapsed, setCollapsed] = useState(false);
	const [topSearch, setTopSearch] = useState("");
	// EXPERIMENTAL light mode (invert hack): dark is the default; opt-in
	// choice persists in localStorage. See index.css invert block.
	const [light, setLight] = useState(false);
	useEffect(() => {
		let initial = false;
		try {
			initial = localStorage.getItem("digibib5-mcp-light-mode") === "light";
		} catch {
			/* private mode */
		}
		setLight(initial);
		document.documentElement.classList.toggle("dark", !initial);
	}, []);

	function toggleTheme() {
		setLight((prev) => {
			const next = !prev;
			document.documentElement.classList.toggle("dark", !next);
			try {
				localStorage.setItem(
					"digibib5-mcp-light-mode",
					next ? "light" : "dark",
				);
			} catch {
				/* private mode */
			}
			return next;
		});
	}
	const location = useLocation();
	const attemptRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	// Exponential backoff health check
	const tick = useCallback(async () => {
		try {
			const r = await fetch(HEALTH_URL, {
				signal: AbortSignal.timeout(5000),
			});
			if (r.ok) {
				useConnection.setState({ state: "connected" });
				attemptRef.current = 0;
			} else {
				useConnection.setState({
					state: "offline",
					lastError: `HTTP ${r.status}`,
				});
			}
		} catch (e) {
			useConnection.setState({
				state: "offline",
				lastError: (e as Error).message,
			});
		}
		attemptRef.current = Math.min(
			++attemptRef.current,
			HEALTH_BACKOFF.length - 1,
		);
		timerRef.current = setTimeout(
			tick,
			HEALTH_BACKOFF[attemptRef.current] * 1000,
		);
	}, []);

	useEffect(() => {
		tick();
		return () => clearTimeout(timerRef.current);
	}, [tick]);

	const { state, lastError } = useConnection();
	const statusColor =
		state === "connected"
			? "bg-green-500"
			: state === "connecting"
				? "bg-amber-500"
				: "bg-red-500";
	const statusLabel =
		state === "connected"
			? "Connected"
			: state === "connecting"
				? "Connecting..."
				: `Offline${lastError ? ` (${lastError.slice(0, 60)})` : ""}`;

	return (
		<div className="flex h-screen overflow-hidden bg-zinc-950">
			{/* Sidebar */}
			<motion.aside
				animate={{ width: collapsed ? 64 : 220 }}
				transition={{ type: "spring", stiffness: 400, damping: 40 }}
				className="flex-shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-900 z-40"
			>
				{/* Logo area */}
				<div className="flex items-center gap-3 px-4 py-5 border-b border-zinc-800">
					<div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/20 border border-amber-500/30 flex-shrink-0">
						<BookOpen className="w-4 h-4 text-amber-400" />
					</div>
					<AnimatePresence>
						{!collapsed && (
							<motion.div
								initial={{ opacity: 0, x: -8 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -8 }}
								className="overflow-hidden"
							>
								<div className="text-sm font-semibold text-zinc-100 leading-tight">
									digibib5-mcp
								</div>
								<div className="text-xs text-zinc-500">v{appVersion}</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Collapse toggle — at TOP per fleet standard */}
				<button
					type="button"
					onClick={() => setCollapsed((c) => !c)}
					className="mx-2 mb-1 p-2 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-800 transition-colors"
					title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{collapsed ? (
						<ChevronRight className="w-4 h-4" />
					) : (
						<ChevronLeft className="w-4 h-4" />
					)}
				</button>

				{/* Navigation */}
				<nav className="flex-1 py-1 px-2 flex flex-col gap-0.5 overflow-y-auto">
					{NAV.map(({ to, label, icon: Icon }) => (
						<NavLink
							key={to}
							to={to}
							end={to === "/"}
							className={({ isActive }) =>
								clsx(
									"flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
									isActive
										? "bg-amber-500/10 text-amber-400"
										: "text-zinc-400 hover:bg-zinc-800",
								)
							}
							title={collapsed ? label : undefined}
						>
							<Icon className="w-4 h-4 flex-shrink-0" />
							<AnimatePresence>
								{!collapsed && (
									<motion.span
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										className="truncate"
									>
										{label}
									</motion.span>
								)}
							</AnimatePresence>
						</NavLink>
					))}
				</nav>
			</motion.aside>

			{/* Main area */}
			<div className="flex-1 flex flex-col overflow-hidden">
				{/* Topbar: search, logs, help, theme, status (no login avatar:
				    no accounts in this app) */}
				<header
					className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0"
					data-testid="topbar"
				>
					<div className="flex items-center gap-4 min-w-0">
						<span
							className="text-sm font-medium text-zinc-400 truncate"
							data-testid="topbar-title"
						>
							{PAGE_TITLES[location.pathname] ?? "digibib5-mcp"}
						</span>
						<form
							className="hidden md:flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1"
							onSubmit={(e) => {
								e.preventDefault();
								if (topSearch.trim())
									navigate(`/reader?q=${encodeURIComponent(topSearch.trim())}`);
							}}
						>
							<Search className="h-3.5 w-3.5 text-zinc-500" />
							<input
								value={topSearch}
								onChange={(e) => setTopSearch(e.target.value)}
								placeholder="Search library…"
								data-testid="topbar-search"
								className="w-40 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
							/>
						</form>
					</div>
					<div className="flex items-center gap-4">
						<NavLink
							to="/logs"
							title="Logs"
							data-testid="topbar-logs"
							className="text-zinc-500 hover:text-zinc-300"
						>
							<Terminal className="h-4 w-4" />
						</NavLink>
						<NavLink
							to="/help"
							title="Help"
							data-testid="topbar-help"
							className="text-zinc-500 hover:text-zinc-300"
						>
							<HelpCircle className="h-4 w-4" />
						</NavLink>
						<button
							type="button"
							onClick={toggleTheme}
							title={light ? "Switch to dark mode" : "Switch to light mode"}
							data-testid="topbar-theme"
							className="text-zinc-500 hover:text-zinc-300"
						>
							{light ? (
								<Moon className="h-4 w-4" />
							) : (
								<Sun className="h-4 w-4" />
							)}
						</button>
						<div data-testid="backend-dot" className="flex items-center gap-2">
							<div
								className={`w-2 h-2 rounded-full ${statusColor} animate-pulse`}
							/>
							<span className="text-xs text-zinc-500">{statusLabel}</span>
						</div>
					</div>
				</header>

				{/* Page content */}
				<main className="flex-1 overflow-y-auto p-6">
					<motion.div
						key={location.pathname}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.18 }}
					>
						{children}
					</motion.div>
				</main>
			</div>
		</div>
	);
}
