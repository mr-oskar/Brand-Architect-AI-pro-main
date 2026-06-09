import { notifySuccess, notifyError } from "./apiError";

export type ExportTarget = "design-studio" | "brand-kit" | "assets" | "campaign";

export type ExportPayload = {
  imageUrl: string;
  prompt?: string;
  source: "nodes-editor";
  createdAt: number;
};

const KEYS: Record<ExportTarget, string> = {
  "design-studio": "nodes:export:design-studio",
  "brand-kit": "nodes:export:brand-kit",
  assets: "nodes:export:assets",
  campaign: "nodes:export:campaign",
};

const ROUTES: Record<ExportTarget, string> = {
  "design-studio": "/design-studio",
  "brand-kit": "/brand-kit",
  assets: "/assets",
  campaign: "/campaigns",
};

const LABELS: Record<ExportTarget, string> = {
  "design-studio": "استوديو التصميم",
  "brand-kit": "هوية العلامة",
  assets: "مكتبة الأصول",
  campaign: "الحملات",
};

export function pushExport(target: ExportTarget, payload: Omit<ExportPayload, "source" | "createdAt">) {
  try {
    const full: ExportPayload = { ...payload, source: "nodes-editor", createdAt: Date.now() };
    localStorage.setItem(KEYS[target], JSON.stringify(full));
    notifySuccess(`تم الإرسال إلى ${LABELS[target]}`, "افتح الشاشة لإكمال الاستخدام");
    return true;
  } catch (err) {
    notifyError("تعذّر الإرسال", err);
    return false;
  }
}

export function consumeExport(target: ExportTarget): ExportPayload | null {
  try {
    const raw = localStorage.getItem(KEYS[target]);
    if (!raw) return null;
    localStorage.removeItem(KEYS[target]);
    return JSON.parse(raw) as ExportPayload;
  } catch {
    return null;
  }
}

export function getExportRoute(target: ExportTarget, basePath: string): string {
  const base = basePath.replace(/\/$/, "");
  return `${base}${ROUTES[target]}`;
}

export function getExportLabel(target: ExportTarget): string {
  return LABELS[target];
}

export const EXPORT_TARGETS: ExportTarget[] = ["design-studio", "brand-kit", "assets", "campaign"];
