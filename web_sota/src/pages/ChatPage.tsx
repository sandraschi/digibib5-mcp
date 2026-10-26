/**
 * Chat over a local or cloud LLM about the Digitale Bibliothek collection.
 * Skill-first with a built-in digibib fallback (the server exposes no skills).
 * History persists in localStorage; streaming via the backend proxy.
 */

import { Bot, Download, Eraser, Send, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LlmPageGate } from "@/components/LlmPageGate";
import { streamChat } from "@/lib/llm";
import { fetchOllamaModels, pickPreferredModel } from "@/lib/model-preference";
import { useLlm } from "@/store/llm";

const HISTORY_KEY = "digibib5-chat-history";
const PERSONALITY_KEY = "digibib5-chat-personality";
const MAX_HISTORY = 100;

const PERSONALITIES: Record<string, string> = {
	"Hoffmann Scholar":
		"You are a scholar of German Romanticism helping a reader of E.T.A. Hoffmann and contemporaries. Answer precisely, cite works by title, and distinguish the text from its critical reception.",
	"Text Detective":
		"You help locate passages, motifs, and references across the Digitale Bibliothek volumes. Suggest exact search terms the reader can type into the reader's search box.",
	"Quick Summarizer":
		"Keep responses to 2-3 sentences. Focus on key facts only.",
	Custom: "Custom prompt — editable below.",
};

const EXAMPLE_PROMPTS = [
	{
		group: "Library",
		prompts: [
			"What volumes are in this library?",
			"Which volume contains Der Sandmann?",
			"How is the table of contents organized?",
		],
	},
	{
		group: "Reading",
		prompts: [
			"Summarize what Der Sandmann is about",
			"Who is Nathanael writing to at the start?",
			"What are the Elixiere des Teufels?",
		],
	},
	{
		group: "Research",
		prompts: [
			"Suggest search terms for doppelganger motifs",
			"How do I find all mentions of a character?",
			"What figures are in the Bilddokumente chapter?",
		],
	},
];

const SKILL_FALLBACK =
	"You are an assistant for digibib5-mcp, a reader for Digitale Bibliothek CD-ROMs. " +
	"The reader exposes volumes, a table of contents, decoded chapter text, full-text search with chapter context, " +
	"and figure scans. Answer about the collection and help the user read and search it.";

interface Message {
	role: "user" | "assistant";
	content: string;
	ts?: string;
}

function loadHistory(): Message[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		return raw ? (JSON.parse(raw) as Message[]) : [];
	} catch {
		return [];
	}
}

function buildSystemPrompt(
	personalityId: string,
	customPrompt: string,
): string {
	const role =
		PERSONALITIES[personalityId] || PERSONALITIES["Hoffmann Scholar"];
	if (personalityId === "Custom") return customPrompt || SKILL_FALLBACK;
	return `${SKILL_FALLBACK}\n\n---\n\n## Role\n${role}`;
}

function ChatInner() {
	const { provider, model, setPair } = useLlm();
	const [chat, setChat] = useState<Message[]>(() => loadHistory());
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [personality, setPersonality] = useState(() => {
		try {
			return localStorage.getItem(PERSONALITY_KEY) || "Hoffmann Scholar";
		} catch {
			return "Hoffmann Scholar";
		}
	});
	const [customPrompt, setCustomPrompt] = useState("");
	const [providerOk, setProviderOk] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const initRef = useRef(false);

	// Resolve the startup default once: stored choice wins, else resident-first.
	// Later user picks are authoritative — never re-resolve.
	useEffect(() => {
		if (initRef.current) return;
		initRef.current = true;
		(async () => {
			try {
				const st = await fetchOllamaModels();
				const pick = pickPreferredModel(st.loaded, st.installed, null);
				if (pick && !model) setPair(provider || "ollama", pick);
				setProviderOk(st.installed.length > 0);
			} catch {
				/* offline */
			}
		})();
	}, [provider, model, setPair]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll on every new message by design
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [chat.length]);

	const sendMessage = useCallback(
		async (text: string) => {
			if (!text.trim() || streaming) return;
			const userMsg: Message = {
				role: "user",
				content: text.trim(),
				ts: new Date().toISOString(),
			};
			const updated = [...chat, userMsg].slice(-MAX_HISTORY);
			setChat(updated);
			setStreaming(true);
			const partial: Message = {
				role: "assistant",
				content: "",
				ts: new Date().toISOString(),
			};
			setChat((prev) => [...prev, partial]);
			const history = [...updated]
				.slice(-20)
				.map((m) => ({ role: m.role, content: m.content }));
			const system = buildSystemPrompt(personality, customPrompt);
			try {
				await streamChat(
					provider || "ollama",
					model,
					[{ role: "system", content: system }, ...history],
					(delta) => {
						partial.content += delta;
						setChat((prev) => {
							const c = [...prev];
							c[c.length - 1] = { ...partial };
							return c;
						});
					},
				);
				const final = [...updated, { ...partial }].slice(-MAX_HISTORY);
				setChat(final);
				try {
					localStorage.setItem(HISTORY_KEY, JSON.stringify(final));
				} catch {
					/* quota */
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				const final = [
					...updated,
					{
						role: "assistant" as const,
						content: `Error: ${msg}`,
						ts: new Date().toISOString(),
					},
				].slice(-MAX_HISTORY);
				setChat(final);
				try {
					localStorage.setItem(HISTORY_KEY, JSON.stringify(final));
				} catch {
					/* quota */
				}
			}
			setStreaming(false);
		},
		[chat, streaming, personality, customPrompt, provider, model],
	);

	const handleSend = () => {
		if (!input.trim()) return;
		void sendMessage(input.trim());
		setInput("");
	};

	const handleClear = () => {
		setChat([]);
		try {
			localStorage.removeItem(HISTORY_KEY);
		} catch {
			/* ignore */
		}
	};

	const handleExport = () => {
		if (chat.length === 0) return;
		const lines = chat.map(
			(m) =>
				`[${m.ts || "no-ts"}] ${m.role === "user" ? "You" : "AI"}: ${m.content}`,
		);
		const blob = new Blob([lines.join("\n\n---\n\n")], { type: "text/plain" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `digibib5-chat-${new Date().toISOString().slice(0, 10)}.txt`;
		a.click();
	};

	return (
		<div
			data-testid="chat-page"
			className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col space-y-4"
		>
			<div
				className="flex items-center justify-between"
				data-testid="chat-controls"
			>
				<div className="flex items-center gap-3">
					<h2 className="text-2xl font-bold tracking-tight text-white">Chat</h2>
					<span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
						skill:digibib-builtin
					</span>
				</div>
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5 text-xs text-zinc-500">
						<div
							className={`h-1.5 w-1.5 rounded-full ${providerOk ? "bg-green-500" : "bg-red-500"}`}
						/>
						<span>
							{provider || "ollama"} · {model || "no model"}
						</span>
					</div>
					<select
						data-testid="personality-select"
						value={personality}
						onChange={(e) => {
							setPersonality(e.target.value);
							try {
								localStorage.setItem(PERSONALITY_KEY, e.target.value);
							} catch {
								/* ignore */
							}
						}}
						className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100"
					>
						{Object.keys(PERSONALITIES).map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
					<button
						type="button"
						data-testid="chat-export"
						onClick={handleExport}
						disabled={chat.length === 0}
						className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
					>
						<Download size={12} /> Export
					</button>
					<button
						type="button"
						data-testid="chat-clear"
						onClick={handleClear}
						disabled={chat.length === 0}
						className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
					>
						<Eraser size={12} /> Clear
					</button>
				</div>
			</div>

			{personality === "Custom" && (
				<textarea
					className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
					rows={2}
					placeholder="Enter your custom system prompt…"
					value={customPrompt}
					onChange={(e) => setCustomPrompt(e.target.value)}
				/>
			)}

			<div
				data-testid="chat-messages"
				className="flex-1 space-y-4 overflow-y-auto pr-2"
			>
				{chat.length === 0 && (
					<div className="pt-8 text-center text-sm text-zinc-500">
						<Bot className="mx-auto mb-3 h-12 w-12 opacity-20" />
						<p>Ask about the Digitale Bibliothek collection.</p>
						<p className="mt-1 text-xs text-zinc-600">
							Personality: {personality}
						</p>
						<div
							data-testid="example-prompts"
							className="mx-auto mt-6 max-w-lg space-y-3"
						>
							{EXAMPLE_PROMPTS.map((group) => (
								<div key={group.group}>
									<p className="mb-1.5 px-1 text-left text-[10px] uppercase tracking-wider text-zinc-600">
										{group.group}
									</p>
									<div className="flex flex-wrap justify-center gap-1.5">
										{group.prompts.map((p) => (
											<button
												key={p}
												type="button"
												onClick={() => setInput(p)}
												className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
											>
												{p}
											</button>
										))}
									</div>
								</div>
							))}
						</div>
					</div>
				)}
				{chat.map((msg, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: chat is append-only, never reordered
						key={i}
						className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
					>
						<div
							className={`flex max-w-[80%] gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
						>
							<div
								className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
									msg.role === "user"
										? "border-zinc-700 bg-zinc-800"
										: "border-blue-800 bg-blue-900/20"
								}`}
							>
								{msg.role === "user" ? (
									<User size={14} className="text-zinc-400" />
								) : (
									<Bot size={14} className="text-blue-400" />
								)}
							</div>
							<div
								className={`whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
									msg.role === "user"
										? "bg-blue-600/20 text-slate-200"
										: "border border-zinc-800 bg-zinc-900/50 text-zinc-300"
								}`}
							>
								{msg.content ||
									(i === chat.length - 1 && streaming ? (
										<span className="animate-pulse">…</span>
									) : (
										""
									))}
							</div>
						</div>
					</div>
				))}
				<div ref={bottomRef} />
			</div>

			<div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
				<input
					data-testid="chat-input"
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						}
					}}
					placeholder="Ask about the collection…"
					disabled={streaming || !model}
					className="flex-1 bg-transparent text-sm text-slate-200 placeholder-zinc-500 outline-none disabled:opacity-50"
				/>
				<button
					data-testid="chat-send"
					type="button"
					onClick={handleSend}
					disabled={streaming || !input.trim() || !model}
					className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white transition-all hover:bg-blue-500 disabled:bg-zinc-700"
				>
					<Send size={14} />
				</button>
			</div>
		</div>
	);
}

export function ChatPage() {
	return (
		<LlmPageGate>
			<ChatInner />
		</LlmPageGate>
	);
}
