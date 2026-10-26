/**
 * Fleet page / section loading indicator (reference: docker-mcp web_sota, demo-vid pages).
 *
 * Copy to web_sota/src/components/PageLoading.tsx (or webapp/src/components/).
 * Requires: lucide-react Loader2, optional cn() from @/lib/utils.
 */
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PageLoadingProps = {
	/** Shown beside or below the spinner on full-page variant */
	label?: string;
	/** page: centered min-height block; inline: compact row; row: flex row for cards */
	variant?: "page" | "inline" | "row";
	testId?: string;
	className?: string;
};

export function PageLoading({
	label,
	variant = "page",
	testId = "page-loading",
	className,
}: PageLoadingProps) {
	const size = variant === "page" ? "h-8 w-8" : "h-4 w-4";

	if (variant === "page") {
		return (
			<div
				className={cn(
					"flex min-h-[320px] flex-col items-center justify-center gap-3 p-12",
					className,
				)}
				data-testid={testId}
				role="status"
				aria-live="polite"
				aria-busy="true"
			>
				<Loader2 className={cn(size, "animate-spin text-blue-500")} />
				{label ? <p className="text-sm text-slate-400">{label}</p> : null}
			</div>
		);
	}

	if (variant === "row") {
		return (
			<div
				className={cn("flex items-center justify-center gap-2 p-12", className)}
				data-testid={testId}
				role="status"
				aria-busy="true"
			>
				<Loader2 className={cn(size, "animate-spin text-blue-500")} />
				{label ? <span className="text-sm text-slate-400">{label}</span> : null}
			</div>
		);
	}

	return (
		<p
			className={cn(
				"flex items-center gap-2 text-xs text-slate-400 animate-pulse",
				className,
			)}
			data-testid={testId}
			role="status"
			aria-busy="true"
		>
			<Loader2 className={cn(size, "animate-spin text-blue-500 shrink-0")} />
			{label ?? "Loading…"}
		</p>
	);
}
