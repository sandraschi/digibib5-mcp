/** Backend base + typed fetch helpers (same origin; Vite proxies /api). */
export const API_BASE = "";

function failMessage(res: Response, fallback: string): Promise<Error> {
	return res
		.json()
		.then((d: unknown) => {
			const msg =
				typeof d === "object" && d !== null && "error" in d
					? String((d as { error: unknown }).error)
					: fallback;
			return new Error(msg);
		})
		.catch(() => new Error(fallback));
}

export async function apiGet<T>(path: string): Promise<T> {
	const r = await fetch(`${API_BASE}${path}`);
	if (!r.ok) throw await failMessage(r, `GET ${path}: HTTP ${r.status}`);
	return (await r.json()) as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
	const r = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!r.ok) throw await failMessage(r, `POST ${path}: HTTP ${r.status}`);
	return (await r.json()) as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
	const r = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
	if (!r.ok) throw await failMessage(r, `DELETE ${path}: HTTP ${r.status}`);
	return (await r.json()) as T;
}
