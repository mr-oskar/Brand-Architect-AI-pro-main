import type { Node, Edge, Viewport } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { WorkspaceState, WorkspaceStore } from "./types";

const STORE_KEY = "nodes-editor-store-v2";
const LEGACY_KEY = "nodes-editor-graph-v1";

function makeId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultStarterNodes(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "img-1",
      type: "imageInput",
      position: { x: 80, y: 80 },
      data: { imageDataUrl: null, filename: null, label: "Reference 1" },
    },
    {
      id: "img-2",
      type: "imageInput",
      position: { x: 80, y: 320 },
      data: { imageDataUrl: null, filename: null, label: "Reference 2" },
    },
    {
      id: "gen-1",
      type: "generateImage",
      position: { x: 460, y: 160 },
      data: {
        prompt: "Blend the references into a unified style. Use @ref1 as base and apply colors from @ref2.",
        status: "idle",
        resultUrl: null,
        error: null,
        size: "1024x1024",
        quality: "auto",
        background: "auto",
        label: "Generate",
      },
    },
  ];
  const edges: Edge[] = [
    {
      id: "e1",
      source: "img-1",
      target: "gen-1",
      targetHandle: "references",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    {
      id: "e2",
      source: "img-2",
      target: "gen-1",
      targetHandle: "references",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    },
  ];
  return { nodes, edges };
}

export function createWorkspace(name: string): WorkspaceState {
  const { nodes, edges } = defaultStarterNodes();
  return {
    id: makeId(),
    name,
    nodes,
    edges,
    viewport: undefined,
    updatedAt: Date.now(),
  };
}

function migrateLegacy(): WorkspaceStore | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) return null;
    const ws: WorkspaceState = {
      id: makeId(),
      name: "My Project",
      nodes: parsed.nodes,
      edges: parsed.edges,
      viewport: undefined,
      updatedAt: Date.now(),
    };
    return { workspaces: [ws], currentId: ws.id };
  } catch {
    return null;
  }
}

export function loadStore(): WorkspaceStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceStore;
      if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0 && parsed.currentId) {
        return parsed;
      }
    }
  } catch {}
  const migrated = migrateLegacy();
  if (migrated) return migrated;
  const ws = createWorkspace("My Project");
  return { workspaces: [ws], currentId: ws.id };
}

function sanitizeNodesForStorage(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    if (n.type === "generateImage") {
      // Don't persist transient runtime state
      return {
        ...n,
        data: {
          ...n.data,
          status: "idle",
          error: null,
        },
      };
    }
    return n;
  });
}

export function saveStore(store: WorkspaceStore): void {
  try {
    const cleaned: WorkspaceStore = {
      ...store,
      workspaces: store.workspaces.map((w) => ({
        ...w,
        nodes: sanitizeNodesForStorage(w.nodes),
      })),
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(cleaned));
  } catch {}
}

export function patchCurrentWorkspace(
  store: WorkspaceStore,
  patch: Partial<Pick<WorkspaceState, "nodes" | "edges" | "viewport" | "name">>,
): WorkspaceStore {
  const next: WorkspaceStore = {
    ...store,
    workspaces: store.workspaces.map((w) =>
      w.id === store.currentId ? { ...w, ...patch, updatedAt: Date.now() } : w,
    ),
  };
  return next;
}

export function getCurrentWorkspace(store: WorkspaceStore): WorkspaceState {
  return store.workspaces.find((w) => w.id === store.currentId) ?? store.workspaces[0];
}

export function addWorkspace(store: WorkspaceStore, name: string): WorkspaceStore {
  const ws = createWorkspace(name);
  return { workspaces: [...store.workspaces, ws], currentId: ws.id };
}

export function renameWorkspace(store: WorkspaceStore, id: string, name: string): WorkspaceStore {
  return {
    ...store,
    workspaces: store.workspaces.map((w) => (w.id === id ? { ...w, name, updatedAt: Date.now() } : w)),
  };
}

export function deleteWorkspace(store: WorkspaceStore, id: string): WorkspaceStore {
  const remaining = store.workspaces.filter((w) => w.id !== id);
  if (remaining.length === 0) {
    const ws = createWorkspace("My Project");
    return { workspaces: [ws], currentId: ws.id };
  }
  const currentId = store.currentId === id ? remaining[0].id : store.currentId;
  return { workspaces: remaining, currentId };
}

export function switchWorkspace(store: WorkspaceStore, id: string): WorkspaceStore {
  if (!store.workspaces.some((w) => w.id === id)) return store;
  return { ...store, currentId: id };
}

export function duplicateWorkspace(store: WorkspaceStore, id: string): WorkspaceStore {
  const src = store.workspaces.find((w) => w.id === id);
  if (!src) return store;
  const copy: WorkspaceState = {
    ...src,
    id: makeId(),
    name: `${src.name} (copy)`,
    updatedAt: Date.now(),
  };
  return { workspaces: [...store.workspaces, copy], currentId: copy.id };
}

/** Convert a fetched generated-image URL to a base64 data URL we can send back as a reference. */
export async function urlToDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { credentials: "include", signal });
  if (!res.ok) throw new Error(`Failed to fetch reference image (${res.status})`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error("Failed to read image"));
    fr.readAsDataURL(blob);
  });
}
