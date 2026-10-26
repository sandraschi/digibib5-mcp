/** Minimal type shims for optional Tauri APIs (dev-browser safe dynamic imports). */
declare module "@tauri-apps/api/window" {
	export function getCurrentWindow(): {
		setZoom: (level: number) => Promise<void>;
	};
}

declare module "@tauri-apps/api/event" {
	export function listen<T>(
		event: string,
		handler: (ev: { payload: T }) => void,
	): Promise<() => void>;
}

declare module "@tauri-apps/api/core" {
	export function invoke<T>(cmd: string, args?: unknown): Promise<T>;
}
