/**
 * Single-operation runner for the digibib portmanteau.
 * Schema comes live from GET /api/tools/{name}; Run posts to /api/tools/{name}/run.
 */

import { ArrowLeft, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
	cleanArgs,
	emptyArgs,
	type JsonSchema,
	schemaType,
	type ToolMeta,
	toolCategory,
} from "@/lib/tool-schema";

function fieldValue(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "boolean" || typeof value === "number")
		return String(value);
	return JSON.stringify(value);
}

export function DigibibToolRunner() {
	const { name } = useParams();
	const toolName = name ? decodeURIComponent(name) : "";
	const [tool, setTool] = useState<ToolMeta | null>(null);
	const [values, setValues] = useState<Record<string, unknown>>({});
	const [loading, setLoading] = useState(true);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<unknown>(null);

	const load = useCallback(async () => {
		if (!toolName) return;
		setLoading(true);
		try {
			const data = await api.toolDetail(toolName);
			setTool(data.tool);
			setValues(emptyArgs(data.tool.parameters));
			setError(null);
			setResult(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load tool");
			setTool(null);
		} finally {
			setLoading(false);
		}
	}, [toolName]);

	useEffect(() => {
		void load();
	}, [load]);

	const properties = useMemo(
		() => Object.entries(tool?.parameters?.properties || {}),
		[tool],
	);
	const required = useMemo(
		() => new Set(tool?.parameters?.required || []),
		[tool],
	);

	const run = async () => {
		if (!tool) return;
		setRunning(true);
		setError(null);
		try {
			const arguments_ = cleanArgs(tool.parameters, values);
			const data = await api.runTool(tool.name, arguments_);
			setResult(data.result);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Invoke failed");
			setResult(null);
		} finally {
			setRunning(false);
		}
	};

	if (loading) {
		return (
			<div
				className="flex min-h-[320px] items-center justify-center"
				data-testid="tool-runner-loading"
			>
				<Loader2 className="h-8 w-8 animate-spin text-blue-500" />
			</div>
		);
	}

	if (!tool) {
		return (
			<div className="mx-auto max-w-3xl space-y-4">
				<Link
					to="/tools"
					className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
				>
					<ArrowLeft className="h-4 w-4" /> Tools
				</Link>
				<div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4">
					<p className="text-sm text-red-200">{error ?? "Tool not found"}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<Link
						to="/tools"
						className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
					>
						<ArrowLeft className="h-4 w-4" /> Tools
					</Link>
					<h2 className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">
						{tool.name}
					</h2>
					<p className="mt-1 text-sm text-zinc-400">
						{toolCategory(tool.name)}
					</p>
				</div>
				<Link
					to="/reader"
					className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
				>
					Reader
				</Link>
			</div>

			<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
				<h3 className="font-semibold text-white">Parameters</h3>
				<p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">
					{(tool.description || "No description").slice(0, 600)}
				</p>
				<div className="mt-4 space-y-4">
					{properties.length === 0 ? (
						<p className="text-sm text-zinc-500">
							No parameters. Run with empty arguments.
						</p>
					) : (
						properties.map(([key, schema]) => (
							<Field
								key={key}
								name={key}
								schema={schema}
								required={required.has(key)}
								value={values[key]}
								onChange={(next) =>
									setValues((prev) => ({ ...prev, [key]: next }))
								}
							/>
						))
					)}
					<button
						type="button"
						onClick={() => void run()}
						disabled={running}
						data-testid="tool-runner-run"
						className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
					>
						{running ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Play className="h-4 w-4" />
						)}
						{running ? "Running…" : "Run tool"}
					</button>
					{error ? <p className="text-sm text-red-400">{error}</p> : null}
				</div>
			</div>

			<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
				<h3 className="font-semibold text-white">Result</h3>
				<div className="mt-3">
					{result == null ? (
						<p className="text-sm text-zinc-500">Not run yet</p>
					) : (
						<pre
							data-testid="tool-runner-result"
							className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/60 p-4 font-mono text-xs text-zinc-300"
						>
							{typeof result === "string"
								? result
								: JSON.stringify(result, null, 2)}
						</pre>
					)}
				</div>
			</div>
		</div>
	);
}

function Field({
	name,
	schema,
	required,
	value,
	onChange,
}: {
	name: string;
	schema: JsonSchema;
	required: boolean;
	value: unknown;
	onChange: (value: unknown) => void;
}) {
	const kind = schemaType(schema);
	const label = `${name}${required ? " *" : ""}`;
	if (kind === "boolean") {
		return (
			<label className="flex items-center gap-2 text-sm text-zinc-200">
				<input
					type="checkbox"
					checked={Boolean(value)}
					onChange={(e) => onChange(e.target.checked)}
				/>
				<span>
					{label}
					{schema.description ? (
						<span className="block text-xs text-zinc-500">
							{schema.description}
						</span>
					) : null}
				</span>
			</label>
		);
	}
	if (schema.enum && schema.enum.length > 0) {
		return (
			<div className="grid gap-2">
				<label htmlFor={`field-${name}`} className="text-sm text-zinc-300">
					{label}
				</label>
				{schema.description ? (
					<p className="text-xs text-zinc-500">{schema.description}</p>
				) : null}
				<select
					id={`field-${name}`}
					value={fieldValue(value)}
					onChange={(e) => onChange(e.target.value)}
					className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200"
				>
					{!required ? <option value="">—</option> : null}
					{schema.enum.map((item) => (
						<option key={String(item)} value={String(item)}>
							{String(item)}
						</option>
					))}
				</select>
			</div>
		);
	}
	if (kind === "object" || kind === "array") {
		return (
			<div className="grid gap-2">
				<label htmlFor={`field-${name}`} className="text-sm text-zinc-300">
					{label}
				</label>
				{schema.description ? (
					<p className="text-xs text-zinc-500">{schema.description}</p>
				) : null}
				<textarea
					id={`field-${name}`}
					value={fieldValue(value)}
					onChange={(e) => onChange(e.target.value)}
					rows={kind === "object" ? 4 : 3}
					placeholder={kind === "object" ? "{}" : "one, two or JSON array"}
					className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-200"
				/>
			</div>
		);
	}
	return (
		<div className="grid gap-2">
			<label htmlFor={`field-${name}`} className="text-sm text-zinc-300">
				{label}
			</label>
			{schema.description ? (
				<p className="text-xs text-zinc-500">{schema.description}</p>
			) : null}
			<input
				id={`field-${name}`}
				type={kind === "integer" || kind === "number" ? "number" : "text"}
				value={fieldValue(value)}
				onChange={(e) => onChange(e.target.value)}
				className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
			/>
		</div>
	);
}
