// Typed client for the digibib5 REST backend (proxied at /api by Vite).
import type { ToolMeta } from "./tool-schema";

export interface VolumeRef {
	id: string;
	title: string;
}

export interface TocNode {
	index: number;
	title: string;
	depth: number;
	record: number | null;
	children?: TocNode[];
	children_count?: number;
}

export interface TocResponse {
	success: boolean;
	volume_id: string;
	title: string;
	node_count: number;
	record_count: number;
	toc: TocNode[];
}

export interface TextResponse {
	success: boolean;
	volume_id: string;
	node_index?: number;
	record_index?: number;
	title?: string;
	record?: number | null;
	record_end?: number | null;
	records_total?: number;
	truncated?: boolean;
	images?: string[] | null;
	image_levels?: number[] | null;
	text: string;
	error?: string;
}

export interface Figure {
	name: string;
	width: number | null;
	height: number | null;
	bpp: number | null;
	bytes: number;
	level?: number;
	url: string;
}

export interface ImagesResponse {
	success: boolean;
	volume_id: string;
	levels: number[];
	level: number | null;
	count: number;
	images: Figure[];
}

export interface SearchHit {
	record: number;
	node_index: number | null;
	chapter: string | null;
	snippet: string;
}

export interface SearchResponse {
	success: boolean;
	volume_id: string;
	query: string;
	count: number;
	results: SearchHit[];
}

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
	const r = await fetch(url, init);
	const data = (await r.json()) as T;
	if (!r.ok) {
		const err = (data as { error?: string }).error ?? `HTTP ${r.status}`;
		throw new Error(err);
	}
	return data;
}

export const api = {
	volumes: () =>
		getJSON<{ success: boolean; count: number; volumes: VolumeRef[] }>(
			"/api/volumes",
		),
	descriptor: (vid: string) =>
		getJSON<{
			success: boolean;
			volume_id: string;
			title: string;
			descriptor: Record<string, string>;
		}>(`/api/volume/${encodeURIComponent(vid)}/descriptor`),
	toc: (vid: string) =>
		getJSON<TocResponse>(`/api/volume/${encodeURIComponent(vid)}/toc`),
	nodeText: (vid: string, idx: number) =>
		getJSON<TextResponse>(
			`/api/volume/${encodeURIComponent(vid)}/node/${idx}/text`,
		),
	recordText: (vid: string, idx: number) =>
		getJSON<TextResponse>(
			`/api/volume/${encodeURIComponent(vid)}/record/${idx}/text`,
		),
	search: (vid: string, q: string, limit = 20) =>
		getJSON<SearchResponse>(
			`/api/volume/${encodeURIComponent(vid)}/search?q=${encodeURIComponent(q)}&limit=${limit}`,
		),
	images: (vid: string, level?: number) =>
		getJSON<ImagesResponse>(
			`/api/volume/${encodeURIComponent(vid)}/images${level != null ? `?level=${level}` : ""}`,
		),
	imageUrl: (vid: string, level: number, name: string) =>
		`/api/volume/${encodeURIComponent(vid)}/image/${level}/${encodeURIComponent(name)}`,
	tools: () =>
		getJSON<{ success: boolean; count: number; tools: ToolMeta[] }>(
			"/api/tools",
		),
	toolDetail: (name: string) =>
		getJSON<{ success: boolean; tool: ToolMeta }>(
			`/api/tools/${encodeURIComponent(name)}`,
		),
	runTool: (name: string, args: Record<string, unknown>) =>
		getJSON<{ success: boolean; result: unknown }>(
			`/api/tools/${encodeURIComponent(name)}/run`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ arguments: args }),
			},
		),
};
