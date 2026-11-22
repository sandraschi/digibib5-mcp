import { apiGet, apiPost } from "@/api/client";

export interface LibrarySettings {
	success: boolean;
	root: string;
	root_exists: boolean;
	volume_count: number;
	source: "explicit" | "saved" | "env" | "default";
	onboarded: boolean;
}

export interface LibraryTestResult {
	success: boolean;
	ok: boolean;
	root: string;
	root_exists: boolean;
	volume_count: number;
	sample_volumes: { id: string; title: string }[];
}

export function fetchLibrarySettings(): Promise<LibrarySettings> {
	return apiGet<LibrarySettings>("/api/settings/library");
}

export function testLibraryRoot(root: string): Promise<LibraryTestResult> {
	return apiPost<LibraryTestResult>("/api/settings/library/test", { root });
}

export function saveLibrarySettings(payload: {
	root?: string;
	onboarded?: boolean;
}): Promise<LibrarySettings> {
	return apiPost<LibrarySettings>("/api/settings/library", payload);
}
