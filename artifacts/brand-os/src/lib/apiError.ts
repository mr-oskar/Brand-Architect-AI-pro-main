import { toast } from "@/hooks/use-toast";

function cleanMessage(raw: string, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const candidate =
        (typeof obj.error === "string" && obj.error) ||
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.detail === "string" && obj.detail) ||
        (obj.error && typeof obj.error === "object" && typeof (obj.error as { message?: unknown }).message === "string"
          ? (obj.error as { message: string }).message
          : "");
      if (candidate) return candidate;
    }
  } catch {
  }
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
}

export async function extractApiError(res: Response, fallback = "Request failed"): Promise<string> {
  const status = res.status;
  const statusText = res.statusText || "";
  const text = await res.text().catch(() => "");
  const message = cleanMessage(text, statusText || fallback);
  if (status === 401) return "You are not signed in. Please sign in and try again.";
  if (status === 403) return message || "You do not have permission to perform this action.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500 && !text) return `Server error (${status}). Please try again.`;
  return message;
}

export function errorToString(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (typeof err === "string") return cleanMessage(err, fallback);
  if (err instanceof Error) return cleanMessage(err.message, fallback);
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return cleanMessage(obj.message, fallback);
    if (typeof obj.error === "string") return cleanMessage(obj.error, fallback);
  }
  return fallback;
}

export function notifyError(title: string, err: unknown, fallback?: string): void {
  const description = errorToString(err, fallback ?? "Please try again.");
  toast({
    title,
    description,
    variant: "destructive",
  });
}

export function notifySuccess(title: string, description?: string): void {
  toast({ title, description });
}
