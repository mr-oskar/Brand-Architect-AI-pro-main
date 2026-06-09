import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type Viewport,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Sparkles,
  SlidersHorizontal,
  Palette,
  Briefcase,
  Layers,
} from "lucide-react";
import { Link } from "wouter";
import ImageInputNode from "./ImageInputNode";
import PromptNode from "./PromptNode";
import GenerateImageNode from "./GenerateImageNode";
import SettingsNode from "./SettingsNode";
import BrandKitNode from "./BrandKitNode";
import StyleExtractorNode from "./StyleExtractorNode";
import ReferenceStudioNode from "./ReferenceStudioNode";
import Sidebar from "./Sidebar";
import CanvasControls from "./CanvasControls";
import { notifyError, notifySuccess } from "@/lib/apiError";
import type {
  GenerateModel,
  GenerateNodeBackground,
  BrandFull,
  BrandKitNodeData,
  GenerateNodeData,
  GenerateNodeQuality,
  GenerateNodeSize,
  ImageNodeData,
  PromptNodeData,
  ReferenceMention,
  SettingsNodeData,
  StyleExtractorNodeData,
  ReferenceStudioNodeData,
  ReferenceStudioItem,
  ReferenceStudioMode,
  ReferenceStudioResolution,
} from "./types";
import {
  loadStore,
  saveStore,
  patchCurrentWorkspace,
  getCurrentWorkspace,
  addWorkspace,
  renameWorkspace,
  deleteWorkspace,
  switchWorkspace,
  duplicateWorkspace,
  defaultStarterNodes,
  urlToDataUrl,
} from "./storage";
import type { WorkspaceStore } from "./types";

const SIDEBAR_COLLAPSED_KEY = "nodes-editor-sidebar-collapsed";

function NodesEditorInner() {
  // Ensure dark theme is active on this page (the editor lives outside <Layout/>
  // which is the only place that adds the `dark` class). Without this, the
  // theme tokens (text-foreground, etc.) resolve to dark text on the editor's
  // dark background and become unreadable.
  useEffect(() => {
    const html = document.documentElement;
    const had = html.classList.contains("dark");
    if (!had) html.classList.add("dark");
    return () => {
      // Only remove if we were the ones who added it.
      if (!had) html.classList.remove("dark");
    };
  }, []);

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  // ===== Workspace store =====
  const [store, setStore] = useState<WorkspaceStore>(() => loadStore());
  const current = getCurrentWorkspace(store);

  const [nodes, setNodes] = useState<Node[]>(current.nodes);
  const [edges, setEdges] = useState<Edge[]>(current.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const idCounter = useRef<number>(Date.now());
  const reconnectSuccessful = useRef<boolean>(true);
  const lastWsId = useRef<string>(current.id);
  const lastViewport = useRef<Viewport | undefined>(current.viewport);
  const dataUrlCache = useRef<Map<string, Promise<string>>>(new Map());

  // Reload when workspace switches
  useEffect(() => {
    if (lastWsId.current !== current.id) {
      lastWsId.current = current.id;
      setNodes(current.nodes);
      setEdges(current.edges);
      setSelectedNodeId(null);
      lastViewport.current = current.viewport;
      dataUrlCache.current = new Map();
    }
  }, [current.id, current.nodes, current.edges, current.viewport]);

  // Persist current workspace + store on changes
  const persist = useCallback(
    (ns: Node[], es: Edge[]) => {
      setStore((prev) => {
        const next = patchCurrentWorkspace(prev, { nodes: ns, edges: es });
        saveStore(next);
        return next;
      });
    },
    [],
  );

  const persistViewport = useCallback((vp: Viewport) => {
    lastViewport.current = vp;
    setStore((prev) => {
      const next = patchCurrentWorkspace(prev, { viewport: vp });
      saveStore(next);
      return next;
    });
  }, []);

  // ===== Node/edge change handlers =====
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        // Track selection changes
        for (const c of changes) {
          if (c.type === "select") {
            if (c.selected) setSelectedNodeId(c.id);
            else
              setSelectedNodeId((curr) => (curr === c.id ? null : curr));
          }
          if (c.type === "remove") {
            setSelectedNodeId((curr) => (curr === c.id ? null : curr));
          }
        }
        persist(next, edges);
        return next;
      });
    },
    [edges, persist],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  // Strict connection rules: a handle may only mate with its dedicated counterpart.
  // - "settings" source  -> only "settings" target
  // - "prompt"   source  -> only "prompt"   target
  // - "image"    source  -> "references" target (Generate) or "image" target (StyleExtractor)
  // No self-connections. A drag that doesn't land on a valid handle is rejected.
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const { source, target, sourceHandle, targetHandle } = connection as Connection;
    if (!source || !target || source === target) return false;
    if (!sourceHandle || !targetHandle) return false;

    if (sourceHandle === "settings" || targetHandle === "settings") {
      return sourceHandle === "settings" && targetHandle === "settings";
    }
    if (sourceHandle === "brand" || targetHandle === "brand") {
      return sourceHandle === "brand" && targetHandle === "brand";
    }
    if (sourceHandle === "prompt") return targetHandle === "prompt";
    if (sourceHandle === "image") return targetHandle === "references" || targetHandle === "image";
    return false;
  }, []);

  // ===== Reference Studio runtime constant =====
  // Per-image base credit cost (kept in sync with backend's design.generate-image
  // multiplier in artifacts/api-server/src/lib/credits.ts).
  const RS_BASE_CU = 10;

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;
      setEdges((eds) => {
        const next = addEdge(
          { ...connection, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
          eds,
        );
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist, isValidConnection],
  );

  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => {
        const next = eds.filter((x) => x.id !== edge.id);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const onReconnectStart = useCallback(() => {
    reconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectSuccessful.current = true;
      setEdges((els) => {
        const next = reconnectEdge(oldEdge, newConnection, els);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const onReconnectEnd = useCallback(
    (_evt: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectSuccessful.current) {
        setEdges((eds) => {
          const next = eds.filter((e) => e.id !== edge.id);
          persist(nodes, next);
          return next;
        });
      }
      reconnectSuccessful.current = true;
    },
    [nodes, persist],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((nds) => {
        let next = nds;
        // Special key __position to also update position
        if ("__position" in patch) {
          const pos = patch.__position as { x: number; y: number };
          const rest = { ...patch };
          delete (rest as Record<string, unknown>).__position;
          next = nds.map((n) =>
            n.id === nodeId ? { ...n, position: pos, data: { ...n.data, ...rest } } : n,
          );
        } else {
          next = nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
        }
        persist(next, edges);
        return next;
      });
    },
    [edges, persist],
  );

  const handleImageChange = useCallback(
    (id: string, dataUrl: string | null, filename: string | null) => {
      updateNodeData(id, { imageDataUrl: dataUrl, filename });
    },
    [updateNodeData],
  );

  const handleImageUploadingChange = useCallback(
    (id: string, uploading: boolean) => {
      updateNodeData(id, { uploading });
    },
    [updateNodeData],
  );

  const handlePromptChange = useCallback(
    (id: string, text: string) => {
      updateNodeData(id, { text });
    },
    [updateNodeData],
  );

  const handleGeneratePromptChange = useCallback(
    (id: string, text: string) => {
      updateNodeData(id, { prompt: text });
    },
    [updateNodeData],
  );

  // ===== References per generate / reference-studio node =====
  // Image-input nodes AND generate-image nodes (whose result is an image) can be references.
  // Both `generateImage` and `referenceStudio` nodes accept incoming refs on the same handle id.
  const referencesByGenId = useMemo(() => {
    const map = new Map<string, ReferenceMention[]>();
    const genNodes = nodes.filter(
      (n) => n.type === "generateImage" || n.type === "referenceStudio",
    );
    for (const gen of genNodes) {
      const incoming = edges.filter(
        (e) => e.target === gen.id && (e.targetHandle === "references" || !e.targetHandle),
      );
      const refs: ReferenceMention[] = [];
      let idx = 1;
      for (const e of incoming) {
        const src = nodes.find((x) => x.id === e.source);
        if (!src) continue;
        if (src.type === "imageInput") {
          const data = src.data as ImageNodeData;
          const ready = !!data.imageDataUrl && !data.uploading;
          refs.push({
            id: src.id,
            label: data.label || `Reference ${idx}`,
            mention: `@ref${idx}`,
            thumbnail: data.imageDataUrl ?? null,
            ready,
            kind: "imageInput",
          });
          idx += 1;
        } else if (src.type === "generateImage") {
          const data = src.data as GenerateNodeData;
          const ready = data.status === "done" && !!data.resultUrl;
          refs.push({
            id: src.id,
            label: data.label || `Generated ${idx}`,
            mention: `@ref${idx}`,
            thumbnail: data.resultUrl ?? null,
            ready,
            kind: "generateImage",
          });
          idx += 1;
        }
      }
      map.set(gen.id, refs);
    }
    return map;
  }, [nodes, edges]);

  // ===== Settings inherited per node (from a SettingsNode connected via the "settings" handle) =====
  const settingsByTargetId = useMemo(() => {
    const map = new Map<string, SettingsNodeData>();
    for (const e of edges) {
      // Settings flows only through matching "settings" handles on both ends.
      if (e.sourceHandle !== "settings" || e.targetHandle !== "settings") continue;
      const src = nodes.find((x) => x.id === e.source);
      if (!src || src.type !== "settings") continue;
      map.set(e.target, src.data as SettingsNodeData);
    }
    return map;
  }, [nodes, edges]);

  // ===== Brand identity inherited per node (from a BrandKitNode via the "brand" handle) =====
  const brandByTargetId = useMemo(() => {
    const map = new Map<string, BrandFull>();
    for (const e of edges) {
      if (e.sourceHandle !== "brand" || e.targetHandle !== "brand") continue;
      const src = nodes.find((x) => x.id === e.source);
      if (!src || src.type !== "brandKit") continue;
      const snap = (src.data as BrandKitNodeData).brandSnapshot;
      if (snap) map.set(e.target, snap);
    }
    return map;
  }, [nodes, edges]);

  // ===== Source image per StyleExtractor node (incoming on "image" handle) =====
  const styleExtractorSourceByNodeId = useMemo(() => {
    const map = new Map<string, { dataUrl: string | null; label: string | null; ready: boolean }>();
    const extractors = nodes.filter((n) => n.type === "styleExtractor");
    for (const ex of extractors) {
      const incoming = edges.find((e) => e.target === ex.id && (e.targetHandle === "image" || !e.targetHandle));
      if (!incoming) {
        map.set(ex.id, { dataUrl: null, label: null, ready: false });
        continue;
      }
      const src = nodes.find((n) => n.id === incoming.source);
      if (!src) {
        map.set(ex.id, { dataUrl: null, label: null, ready: false });
        continue;
      }
      if (src.type === "imageInput") {
        const data = src.data as ImageNodeData;
        map.set(ex.id, {
          dataUrl: data.imageDataUrl ?? null,
          label: data.label || "Reference",
          ready: !!data.imageDataUrl && !data.uploading,
        });
      } else if (src.type === "generateImage") {
        const data = src.data as GenerateNodeData;
        map.set(ex.id, {
          dataUrl: data.resultUrl ?? null,
          label: data.label || "Generated",
          ready: data.status === "done" && !!data.resultUrl,
        });
      } else {
        map.set(ex.id, { dataUrl: null, label: null, ready: false });
      }
    }
    return map;
  }, [nodes, edges]);

  // ===== Inherited refs per Prompt node (from a downstream Generate node) =====
  // When a prompt node's source is connected to a generate node's "prompt" handle,
  // surface the generate node's references inside the prompt node.
  const inheritedRefsByPromptId = useMemo(() => {
    const map = new Map<string, ReferenceMention[]>();
    const promptNodes = nodes.filter((n) => n.type === "prompt");
    for (const p of promptNodes) {
      const downstream = edges.find(
        (e) => e.source === p.id && e.targetHandle === "prompt",
      );
      if (!downstream) continue;
      const refs = referencesByGenId.get(downstream.target);
      if (refs && refs.length > 0) map.set(p.id, refs);
    }
    return map;
  }, [nodes, edges, referencesByGenId]);

  // ===== Run a generate node =====
  const runGenerate = useCallback(
    async (genNodeId: string) => {
      const genNode = nodes.find((n) => n.id === genNodeId);
      const inNodePrompt = ((genNode?.data as GenerateNodeData | undefined)?.prompt ?? "").trim();

      // Local fallback values
      const localSize: GenerateNodeSize =
        (genNode?.data as GenerateNodeData | undefined)?.size ?? "1024x1024";
      const localQuality: GenerateNodeQuality =
        (genNode?.data as GenerateNodeData | undefined)?.quality ?? "auto";
      const localBackground: GenerateNodeBackground =
        (genNode?.data as GenerateNodeData | undefined)?.background ?? "auto";
      const localModel: GenerateModel =
        (genNode?.data as GenerateNodeData | undefined)?.model ?? "auto";

      // Inherited Settings node (overrides local)
      const inh = settingsByTargetId.get(genNodeId) ?? null;
      const size: GenerateNodeSize = inh?.size ?? localSize;
      const quality: GenerateNodeQuality = inh?.quality ?? localQuality;
      const background: GenerateNodeBackground = inh?.background ?? localBackground;
      const model: GenerateModel = inh?.model ?? localModel;

      const refs = [...(referencesByGenId.get(genNodeId) ?? [])];

      // If a Settings node provides an extra reference image, treat it as a synthetic
      // ready-to-go reference so we can flow it through the same resolution path.
      const settingsRefDataUrl = inh?.referenceImageDataUrl ?? null;

      // Refuse to run if any "real" reference isn't ready yet.
      const notReady = refs.filter((r) => !r.ready);
      if (notReady.length > 0) {
        notifyError(
          "References not ready",
          null,
          "Wait until all reference images finish loading before running.",
        );
        return;
      }

      // Resolve all references to data URLs (fetch generated outputs as needed).
      let resolved: string[] = [];
      try {
        resolved = await Promise.all(
          refs.map(async (r) => {
            const sourceNode = nodes.find((x) => x.id === r.id);
            if (!sourceNode) throw new Error(`Reference ${r.mention} is missing.`);
            if (sourceNode.type === "imageInput") {
              const url = (sourceNode.data as ImageNodeData).imageDataUrl;
              if (!url || !url.startsWith("data:image/")) {
                throw new Error(`Reference ${r.mention} has no image yet.`);
              }
              return url;
            }
            // generateImage source — fetch its URL and convert to data URL
            const url = (sourceNode.data as GenerateNodeData).resultUrl;
            if (!url) throw new Error(`Reference ${r.mention} has no generated output yet.`);
            if (url.startsWith("data:image/")) return url;
            const cache = dataUrlCache.current;
            const cached = cache.get(url);
            if (cached) return cached;
            const p = urlToDataUrl(url).catch((err) => {
              cache.delete(url);
              throw err;
            });
            cache.set(url, p);
            return p;
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load references";
        updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
        notifyError("Could not prepare references", err, msg);
        return;
      }

      if (settingsRefDataUrl) resolved.push(settingsRefDataUrl);

      // Brand identity (from a BrandKitNode wired into "brand"). Resolved separately
      // so we can prepend identity instructions and attach the brand logo.
      const brand = brandByTargetId.get(genNodeId) ?? null;
      if (brand?.logoUrl) {
        try {
          const cache = dataUrlCache.current;
          let logoData = cache.get(brand.logoUrl);
          if (!logoData) {
            logoData = brand.logoUrl.startsWith("data:image/")
              ? Promise.resolve(brand.logoUrl)
              : urlToDataUrl(brand.logoUrl).catch((err) => {
                  cache.delete(brand.logoUrl as string);
                  throw err;
                });
            cache.set(brand.logoUrl, logoData);
          }
          resolved.push(await logoData);
        } catch {
          // If the logo can't be loaded, continue with the rest of the brand kit.
        }
      }

      // Inputs on the generate node's "prompt" handle:
      // - Prompt nodes contribute the user's CONTENT request (subject, action, scene)
      // - StyleExtractor nodes contribute a STYLE LAYER that is applied without
      //   altering the subject or composition the user asked for.
      const promptIncoming = edges.filter(
        (e) => e.target === genNodeId && e.targetHandle === "prompt",
      );

      let userPrompt = inNodePrompt;
      if (!userPrompt) {
        for (const e of promptIncoming) {
          const n = nodes.find((x) => x.id === e.source);
          if (!n || n.type !== "prompt") continue;
          const text = (n.data as { text?: string }).text;
          if (typeof text === "string" && text.trim()) {
            userPrompt = text.trim();
            break;
          }
        }
      }

      const styleInstructions: string[] = [];
      for (const e of promptIncoming) {
        const n = nodes.find((x) => x.id === e.source);
        if (!n || n.type !== "styleExtractor") continue;
        const text = (n.data as { text?: string }).text;
        if (typeof text === "string" && text.trim()) {
          styleInstructions.push(text.trim());
        }
      }

      // If no user prompt is present, fall back to the style description so the
      // node still produces something instead of erroring out.
      let prompt = userPrompt;
      let styleOnlyMode = false;
      if (!prompt && styleInstructions.length > 0) {
        prompt = styleInstructions.join("\n\n");
        styleOnlyMode = true;
      }

      if (!prompt) {
        notifyError(
          "No instructions",
          null,
          "Write a prompt inside the generate node, or connect an Instructions node to it.",
        );
        return;
      }

      // Compose: brand identity → settings prefix → settings text reference → user content → style layer.
      // Brand identity comes FIRST so the model anchors on it. The style layer is added
      // LAST and explicitly told not to override the subject, so the StyleExtractor
      // adapts cleanly when the user also wires up prompt + refs.
      const sections: string[] = [];
      if (brand) {
        const lines: string[] = [];
        lines.push(`Brand: ${brand.companyName}${brand.industry ? ` (${brand.industry})` : ""}`);
        const kit = brand.brandKit;
        if (kit?.toneOfVoice) lines.push(`Tone of voice: ${kit.toneOfVoice}`);
        if (kit?.personality) lines.push(`Personality: ${kit.personality}`);
        if (kit?.visualStyle) lines.push(`Visual style: ${kit.visualStyle}`);
        if (kit?.visualStyleRules) lines.push(`Visual rules: ${kit.visualStyleRules}`);
        const palette = kit?.colorPalette;
        if (palette) {
          const swatches = [
            palette.primary && `primary ${palette.primary}`,
            palette.secondary && `secondary ${palette.secondary}`,
            palette.accent && `accent ${palette.accent}`,
            palette.background && `background ${palette.background}`,
            palette.text && `text ${palette.text}`,
            palette.neutral && `neutral ${palette.neutral}`,
          ].filter(Boolean);
          if (swatches.length > 0) lines.push(`Color palette: ${swatches.join(", ")}`);
        }
        if (kit?.taglines && kit.taglines.length > 0) {
          lines.push(`Taglines (do not place text in image unless asked): ${kit.taglines.slice(0, 3).join(" | ")}`);
        }
        if (kit?.brandKeywords && kit.brandKeywords.length > 0) {
          lines.push(`Brand keywords: ${kit.brandKeywords.slice(0, 8).join(", ")}`);
        }
        if (kit?.dosCommunication && kit.dosCommunication.length > 0) {
          lines.push(`Do: ${kit.dosCommunication.slice(0, 5).join("; ")}`);
        }
        if (kit?.dontsCommunication && kit.dontsCommunication.length > 0) {
          lines.push(`Don't: ${kit.dontsCommunication.slice(0, 5).join("; ")}`);
        }
        if (brand.logoUrl) {
          lines.push(
            `The brand logo is attached as the LAST reference image — match its colors, geometry and proportions exactly when the logo appears in the composition.`,
          );
        }
        sections.push(
          `Brand identity (anchor every visual choice to this — palette, mood, voice, do/don'ts):\n${lines.join("\n")}`,
        );
      }
      if (inh?.unifiedPrompt?.trim()) sections.push(inh.unifiedPrompt.trim());
      if (inh?.textReference?.trim()) sections.push(`Style / brand reference:\n${inh.textReference.trim()}`);
      sections.push(styleOnlyMode ? prompt : `User request:\n${prompt}`);
      if (!styleOnlyMode && styleInstructions.length > 0) {
        sections.push(
          `Visual style guide (apply these stylistic qualities — palette, lighting, medium, mood, texture, framing — without changing the subject, composition, or content above):\n${styleInstructions.join("\n\n")}`,
        );
      }
      const composedPrompt = sections.join("\n\n");

      // Replace @refN tokens with explicit references the model understands.
      const resolvedPrompt = composedPrompt.replace(/@ref(\d+)/g, (match, n) => {
        const idx = Number(n);
        if (Number.isFinite(idx) && idx >= 1 && idx <= resolved.length) {
          return `Reference Image #${idx}`;
        }
        return match;
      });

      updateNodeData(genNodeId, { status: "running", error: null, resultUrl: null });

      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prompt: resolvedPrompt,
            referenceImages: resolved,
            size,
            quality,
            background,
            model,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          const msg = json.error || `Generation failed (${res.status})`;
          updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
          notifyError("Generation failed", null, msg);
          return;
        }
        updateNodeData(genNodeId, { status: "done", resultUrl: json.url, error: null });
        notifySuccess("Image generated");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
        notifyError("Connection failed", err, msg);
      }
    },
    [edges, nodes, referencesByGenId, settingsByTargetId, brandByTargetId, updateNodeData],
  );

  // ===== Run a Style Extractor =====
  const runExtractStyle = useCallback(
    async (extractorId: string) => {
      const ex = nodes.find((n) => n.id === extractorId);
      if (!ex) return;
      const src = styleExtractorSourceByNodeId.get(extractorId);
      if (!src || !src.dataUrl || !src.ready) {
        notifyError(
          "No source image",
          null,
          "Connect a ready Image or Generate node to the extractor's left handle.",
        );
        return;
      }

      // Convert remote URL → data URL if needed
      let dataUrl = src.dataUrl;
      if (!dataUrl.startsWith("data:image/")) {
        try {
          const cache = dataUrlCache.current;
          const cached = cache.get(dataUrl);
          if (cached) dataUrl = await cached;
          else {
            const p = urlToDataUrl(dataUrl).catch((err) => {
              cache.delete(dataUrl);
              throw err;
            });
            cache.set(dataUrl, p);
            dataUrl = await p;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not load source image";
          updateNodeData(extractorId, { status: "error", error: msg });
          notifyError("Could not load image", err, msg);
          return;
        }
      }

      updateNodeData(extractorId, { status: "running", error: null });

      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/extract-style`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageDataUrl: dataUrl }),
        });
        const json = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
        if (!res.ok || !json.prompt) {
          const msg = json.error || `Extraction failed (${res.status})`;
          updateNodeData(extractorId, { status: "error", error: msg });
          notifyError("Style extraction failed", null, msg);
          return;
        }
        updateNodeData(extractorId, { status: "done", error: null, text: json.prompt });
        notifySuccess("Style prompt extracted");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        updateNodeData(extractorId, { status: "error", error: msg });
        notifyError("Connection failed", err, msg);
      }
    },
    [nodes, styleExtractorSourceByNodeId, updateNodeData],
  );

  const handleStyleExtractorTextChange = useCallback(
    (id: string, text: string) => updateNodeData(id, { text }),
    [updateNodeData],
  );

  // ===== Reference Studio: prompt-change + settings-change passthroughs =====
  const handleRsPromptChange = useCallback(
    (id: string, text: string) => updateNodeData(id, { prompt: text }),
    [updateNodeData],
  );
  const handleRsSettingsChange = useCallback(
    (id: string, patch: Partial<ReferenceStudioNodeData>) =>
      updateNodeData(id, patch as Record<string, unknown>),
    [updateNodeData],
  );

  // Resolve all references for a target node (image inputs + generate-image
  // results) into base64 data URLs, also appending an optional Settings
  // reference image and the Brand logo (if present). Same shape as runGenerate
  // so both code paths stay consistent.
  const resolveContext = useCallback(
    async (
      targetId: string,
    ): Promise<{ resolvedRefs: string[]; brand: BrandFull | null; inh: SettingsNodeData | null } | null> => {
      const refs = [...(referencesByGenId.get(targetId) ?? [])];
      const inh = settingsByTargetId.get(targetId) ?? null;
      const brand = brandByTargetId.get(targetId) ?? null;

      const notReady = refs.filter((r) => !r.ready);
      if (notReady.length > 0) {
        notifyError(
          "References not ready",
          null,
          "Wait until all reference images finish loading before running.",
        );
        return null;
      }

      let resolved: string[] = [];
      try {
        resolved = await Promise.all(
          refs.map(async (r) => {
            const sourceNode = nodes.find((x) => x.id === r.id);
            if (!sourceNode) throw new Error(`Reference ${r.mention} is missing.`);
            if (sourceNode.type === "imageInput") {
              const url = (sourceNode.data as ImageNodeData).imageDataUrl;
              if (!url || !url.startsWith("data:image/")) {
                throw new Error(`Reference ${r.mention} has no image yet.`);
              }
              return url;
            }
            const url = (sourceNode.data as GenerateNodeData).resultUrl;
            if (!url) throw new Error(`Reference ${r.mention} has no generated output yet.`);
            if (url.startsWith("data:image/")) return url;
            const cache = dataUrlCache.current;
            const cached = cache.get(url);
            if (cached) return cached;
            const p = urlToDataUrl(url).catch((err) => {
              cache.delete(url);
              throw err;
            });
            cache.set(url, p);
            return p;
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load references";
        notifyError("Could not prepare references", err, msg);
        return null;
      }

      if (inh?.referenceImageDataUrl) resolved.push(inh.referenceImageDataUrl);

      if (brand?.logoUrl) {
        try {
          const cache = dataUrlCache.current;
          let logoData = cache.get(brand.logoUrl);
          if (!logoData) {
            logoData = brand.logoUrl.startsWith("data:image/")
              ? Promise.resolve(brand.logoUrl)
              : urlToDataUrl(brand.logoUrl).catch((err) => {
                  cache.delete(brand.logoUrl as string);
                  throw err;
                });
            cache.set(brand.logoUrl, logoData);
          }
          resolved.push(await logoData);
        } catch {
          // continue without logo
        }
      }

      return { resolvedRefs: resolved, brand, inh };
    },
    [nodes, referencesByGenId, settingsByTargetId, brandByTargetId],
  );

  // Build the same brand-aware section block runGenerate uses, around an
  // arbitrary user prompt (so we can vary it per slot in the batch).
  const composeBatchedPrompt = useCallback(
    (brand: BrandFull | null, inh: SettingsNodeData | null, userPrompt: string, modeHint: string) => {
      const sections: string[] = [];
      if (brand) {
        const lines: string[] = [];
        lines.push(`Brand: ${brand.companyName}${brand.industry ? ` (${brand.industry})` : ""}`);
        const kit = brand.brandKit;
        if (kit?.toneOfVoice) lines.push(`Tone of voice: ${kit.toneOfVoice}`);
        if (kit?.personality) lines.push(`Personality: ${kit.personality}`);
        if (kit?.visualStyle) lines.push(`Visual style: ${kit.visualStyle}`);
        if (kit?.visualStyleRules) lines.push(`Visual rules: ${kit.visualStyleRules}`);
        const palette = kit?.colorPalette;
        if (palette) {
          const swatches = [
            palette.primary && `primary ${palette.primary}`,
            palette.secondary && `secondary ${palette.secondary}`,
            palette.accent && `accent ${palette.accent}`,
            palette.background && `background ${palette.background}`,
            palette.text && `text ${palette.text}`,
            palette.neutral && `neutral ${palette.neutral}`,
          ].filter(Boolean);
          if (swatches.length > 0) lines.push(`Color palette: ${swatches.join(", ")}`);
        }
        if (kit?.brandKeywords && kit.brandKeywords.length > 0) {
          lines.push(`Brand keywords: ${kit.brandKeywords.slice(0, 8).join(", ")}`);
        }
        if (brand.logoUrl) {
          lines.push(
            `The brand logo is attached as the LAST reference image — match its colors, geometry and proportions exactly when the logo appears in the composition.`,
          );
        }
        sections.push(`Brand identity (anchor every visual choice to this):\n${lines.join("\n")}`);
      }
      if (inh?.unifiedPrompt?.trim()) sections.push(inh.unifiedPrompt.trim());
      if (inh?.textReference?.trim()) sections.push(`Style / brand reference:\n${inh.textReference.trim()}`);
      if (modeHint) sections.push(`Studio mode directive: ${modeHint}`);
      sections.push(`User request:\n${userPrompt}`);
      return sections.join("\n\n");
    },
    [],
  );

  // Mode-specific instructions injected into every slot's prompt so the model
  // honors the chosen Reference Studio mode regardless of the user's wording.
  const RS_MODE_HINTS: Record<ReferenceStudioMode, string> = useMemo(
    () => ({
      variations:
        "Produce a creative variation of the same subject — vary framing, lighting, mood, and palette accents while preserving the subject's identity.",
      styleLock:
        "Match the visual style of the reference images EXACTLY — same medium, palette, lighting quality, and overall aesthetic. The subject may vary slightly but the style is locked.",
      subjectLock:
        "Preserve the subject identity from the reference images EXACTLY (same person/character/object). Vary only the scene, background, outfit, or action.",
      matrix:
        "This image is one cell in a 2-axis exploration matrix (lighting × angle). Render it as a clean, decisive single point in that grid.",
      aspectPack:
        "Compose for the requested aspect ratio while preserving the same subject and overall scene as the rest of the pack.",
    }),
    [],
  );

  // Aspect Pack rotates the slot size through a fixed sequence so a single
  // batch produces square + portrait + landscape framings of the same scene.
  const ASPECT_PACK_SIZES: GenerateNodeSize[] = useMemo(
    () => ["1024x1024", "1024x1536", "1536x1024", "1024x1024"],
    [],
  );

  // Track in-flight batches so we don't double-run a node.
  const rsBatchesInFlight = useRef<Set<string>>(new Set());

  /**
   * Run a single slot inside a Reference Studio batch. Updates only that slot's
   * status/url/error in the items[] array so concurrent slots don't clobber
   * each other. Used by both the initial batch run and per-slot retries.
   */
  const runReferenceItem = useCallback(
    async (
      rsId: string,
      index: number,
      ctx: { resolvedRefs: string[]; brand: BrandFull | null; inh: SettingsNodeData | null },
    ): Promise<boolean> => {
      // Mark the slot as running, then read the freshest snapshot of the node.
      let upscale = 1;
      let success = false;
      setNodes((nds) => {
        const next = nds.map((n) => {
          if (n.id !== rsId) return n;
          const d = n.data as ReferenceStudioNodeData;
          const items = (d.items ?? []).map((it) =>
            it.index === index ? { ...it, status: "running" as const, error: null } : it,
          );
          return { ...n, data: { ...d, items, status: "running" as const, error: null } };
        });
        return next;
      });

      const node = nodes.find((n) => n.id === rsId);
      if (!node) return false;
      const d = node.data as ReferenceStudioNodeData;
      const item = (d.items ?? []).find((it) => it.index === index);
      if (!item) return false;

      const localSize: GenerateNodeSize = ctx.inh?.size ?? d.size ?? "1024x1024";
      const localQuality: GenerateNodeQuality = ctx.inh?.quality ?? d.quality ?? "auto";
      const localBg: GenerateNodeBackground = ctx.inh?.background ?? d.background ?? "auto";
      const localModel: GenerateModel = ctx.inh?.model ?? d.model ?? "auto";
      const sizeForSlot: GenerateNodeSize = item.size ?? localSize;
      upscale = d.resolution === "4k" ? 4 : d.resolution === "2k" ? 2 : 1;

      // Compose this slot's prompt: brand + studio hint + slot text.
      const modeHint = RS_MODE_HINTS[d.mode] ?? "";
      const composed = composeBatchedPrompt(ctx.brand, ctx.inh, item.prompt || d.prompt || "", modeHint);
      const resolvedPrompt = composed.replace(/@ref(\d+)/g, (m, n) => {
        const idx = Number(n);
        if (Number.isFinite(idx) && idx >= 1 && idx <= ctx.resolvedRefs.length) {
          return `Reference Image #${idx}`;
        }
        return m;
      });

      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prompt: resolvedPrompt,
            referenceImages: ctx.resolvedRefs,
            size: sizeForSlot,
            quality: localQuality,
            background: localBg,
            model: localModel,
            upscale,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          const msg = json.error || `Slot #${index} failed (${res.status})`;
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== rsId) return n;
              const dd = n.data as ReferenceStudioNodeData;
              const items = (dd.items ?? []).map((it) =>
                it.index === index ? { ...it, status: "error" as const, error: msg, url: null } : it,
              );
              return { ...n, data: { ...dd, items } };
            }),
          );
          return false;
        }
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== rsId) return n;
            const dd = n.data as ReferenceStudioNodeData;
            const items = (dd.items ?? []).map((it) =>
              it.index === index ? { ...it, status: "done" as const, url: json.url!, error: null } : it,
            );
            return { ...n, data: { ...dd, items } };
          }),
        );
        success = true;
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== rsId) return n;
            const dd = n.data as ReferenceStudioNodeData;
            const items = (dd.items ?? []).map((it) =>
              it.index === index ? { ...it, status: "error" as const, error: msg, url: null } : it,
            );
            return { ...n, data: { ...dd, items } };
          }),
        );
        return false;
      } finally {
        // Persist after each slot so partial progress survives reloads.
        setNodes((cur) => {
          persist(cur, edges);
          return cur;
        });
        void success;
        void upscale;
      }
    },
    [nodes, RS_MODE_HINTS, composeBatchedPrompt, edges, persist],
  );

  /**
   * Run a Reference Studio batch. Resolves the references once, builds an items[]
   * array of `count` pending slots, then dispatches them with a small
   * concurrency cap so the UI fills in progressively. Failed slots stay marked
   * as `error` and can be retried individually or via "Retry failed".
   */
  const runReferenceBatch = useCallback(
    async (rsId: string) => {
      if (rsBatchesInFlight.current.has(rsId)) return;
      const node = nodes.find((n) => n.id === rsId);
      if (!node || node.type !== "referenceStudio") return;
      const d = node.data as ReferenceStudioNodeData;

      // Build the working prompt — fall back to incoming Prompt nodes if empty.
      let basePrompt = (d.prompt ?? "").trim();
      if (!basePrompt) {
        const promptIncoming = edges.filter((e) => e.target === rsId && e.targetHandle === "prompt");
        for (const e of promptIncoming) {
          const n = nodes.find((x) => x.id === e.source);
          if (!n || n.type !== "prompt") continue;
          const text = (n.data as { text?: string }).text;
          if (typeof text === "string" && text.trim()) {
            basePrompt = text.trim();
            break;
          }
        }
      }
      if (!basePrompt) {
        notifyError(
          "No instructions",
          null,
          "Write a prompt inside the Reference Studio, or connect a Prompt node to it.",
        );
        return;
      }

      const ctx = await resolveContext(rsId);
      if (!ctx) return;

      // Seed items[]: one pending slot per requested image, with seed/aspect
      // resolved up-front so re-runs of individual slots stay deterministic.
      const count = Math.max(1, Math.min(16, Math.floor(d.count ?? 4)));
      const sizeOverride: GenerateNodeSize = ctx.inh?.size ?? d.size ?? "1024x1024";
      const items: ReferenceStudioItem[] = [];
      const expanded = d.expandedPrompts ?? null;
      for (let i = 1; i <= count; i++) {
        const slotPrompt =
          expanded && expanded[i - 1] && expanded[i - 1].trim() ? expanded[i - 1].trim() : basePrompt;
        const slotSeed = d.seedLocked
          ? (d.seed ?? 42)
          : Math.floor(Math.random() * 1_000_000_000);
        const slotSize: GenerateNodeSize =
          d.mode === "aspectPack"
            ? ASPECT_PACK_SIZES[(i - 1) % ASPECT_PACK_SIZES.length]
            : sizeOverride;
        items.push({
          index: i,
          status: "pending",
          url: null,
          error: null,
          prompt: slotPrompt,
          seed: slotSeed,
          size: slotSize,
          selected: false,
          starred: false,
        });
      }
      updateNodeData(rsId, {
        status: "running",
        error: null,
        items,
      });

      rsBatchesInFlight.current.add(rsId);

      // Dispatch slots with a concurrency cap so we don't hammer the API.
      const CONCURRENCY = 2;
      const queue = items.map((it) => it.index);
      let cursor = 0;
      const workers: Promise<void>[] = [];
      const failures: number[] = [];
      const runWorker = async () => {
        while (cursor < queue.length) {
          const idx = queue[cursor++];
          const ok = await runReferenceItem(rsId, idx, ctx);
          if (!ok) failures.push(idx);
        }
      };
      for (let w = 0; w < Math.min(CONCURRENCY, queue.length); w++) workers.push(runWorker());
      try {
        await Promise.all(workers);
      } finally {
        rsBatchesInFlight.current.delete(rsId);
        updateNodeData(rsId, {
          status: failures.length === 0 ? "done" : failures.length === count ? "error" : "done",
          error: failures.length > 0 ? `${failures.length} slot(s) failed — retry them individually.` : null,
        });
        if (failures.length === 0) {
          notifySuccess(`Generated ${count} reference${count === 1 ? "" : "s"}`);
        } else if (failures.length < count) {
          notifyError("Some slots failed", null, `${failures.length} of ${count} slots failed.`);
        }
      }
    },
    [nodes, edges, resolveContext, updateNodeData, ASPECT_PACK_SIZES, runReferenceItem],
  );

  /** Re-run only the slots that previously errored, reusing the resolved context. */
  const retryReferenceFailed = useCallback(
    async (rsId: string) => {
      const node = nodes.find((n) => n.id === rsId);
      if (!node) return;
      const d = node.data as ReferenceStudioNodeData;
      const failedIdx = (d.items ?? []).filter((it) => it.status === "error").map((it) => it.index);
      if (failedIdx.length === 0) return;

      const ctx = await resolveContext(rsId);
      if (!ctx) return;

      updateNodeData(rsId, { status: "running", error: null });
      const CONCURRENCY = 2;
      const queue = [...failedIdx];
      const workers: Promise<void>[] = [];
      let cursor = 0;
      const failures: number[] = [];
      const worker = async () => {
        while (cursor < queue.length) {
          const idx = queue[cursor++];
          const ok = await runReferenceItem(rsId, idx, ctx);
          if (!ok) failures.push(idx);
        }
      };
      for (let w = 0; w < Math.min(CONCURRENCY, queue.length); w++) workers.push(worker());
      await Promise.all(workers);
      updateNodeData(rsId, {
        status: failures.length === 0 ? "done" : "done",
        error: failures.length > 0 ? `${failures.length} slot(s) still failing.` : null,
      });
    },
    [nodes, resolveContext, updateNodeData, runReferenceItem],
  );

  /** Re-run a single specific slot (used by per-tile retry/refresh buttons). */
  const retryReferenceItem = useCallback(
    async (rsId: string, index: number) => {
      const ctx = await resolveContext(rsId);
      if (!ctx) return;
      await runReferenceItem(rsId, index, ctx);
    },
    [resolveContext, runReferenceItem],
  );

  /** Smart Prompt Expansion — fill `expandedPrompts` with N variations from gpt-4o-mini. */
  const expandReferencePrompts = useCallback(
    async (rsId: string) => {
      const node = nodes.find((n) => n.id === rsId);
      if (!node) return;
      const d = node.data as ReferenceStudioNodeData;
      const prompt = (d.prompt ?? "").trim();
      if (!prompt) {
        notifyError("Empty prompt", null, "Write a base prompt before expanding.");
        return;
      }
      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/expand-prompts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ prompt, count: d.count ?? 4, mode: d.mode ?? "variations" }),
        });
        const json = (await res.json().catch(() => ({}))) as { prompts?: string[]; error?: string };
        if (!res.ok || !Array.isArray(json.prompts) || json.prompts.length === 0) {
          notifyError("Expansion failed", null, json.error || "Could not expand prompt");
          return;
        }
        updateNodeData(rsId, { expandedPrompts: json.prompts });
        notifySuccess(`Expanded into ${json.prompts.length} unique prompts`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        notifyError("Expansion failed", err, msg);
      }
    },
    [nodes, updateNodeData],
  );

  const clearReferenceResults = useCallback(
    (rsId: string) => {
      updateNodeData(rsId, { items: [], status: "idle", error: null });
    },
    [updateNodeData],
  );

  // Forward declarations so decoratedNodes can call delete/duplicate without
  // creating circular useCallback deps. The actual refs are filled in below.
  const deleteNodeRef = useRef<(id: string) => void>(() => {});
  const duplicateNodeRef = useRef<(id: string) => void>(() => {});
  const handleNodeDelete = useCallback((id: string) => deleteNodeRef.current(id), []);
  const handleNodeDuplicate = useCallback((id: string) => duplicateNodeRef.current(id), []);
  // Promote-Reference-Selected forwards to a function defined after addGenerateNode.
  const promoteReferenceSelectedRef = useRef<(id: string) => void>(() => {});

  // ===== Decorate nodes with callbacks + computed refs =====
  const decoratedNodes = useMemo<Node[]>(() => {
    return nodes.map((n) => {
      const common = {
        onDelete: handleNodeDelete,
        onDuplicate: handleNodeDuplicate,
      };
      if (n.type === "imageInput") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            onChange: handleImageChange,
            onUploadingChange: handleImageUploadingChange,
          },
        };
      }
      if (n.type === "prompt") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            inheritedRefs: inheritedRefsByPromptId.get(n.id) ?? [],
            onChange: handlePromptChange,
          },
        };
      }
      if (n.type === "generateImage") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            references: referencesByGenId.get(n.id) ?? [],
            inheritedSettings: settingsByTargetId.get(n.id) ?? null,
            inheritedBrand: brandByTargetId.get(n.id) ?? null,
            onPromptChange: handleGeneratePromptChange,
            onRun: runGenerate,
            onSettingsChange: updateNodeData,
          },
        };
      }
      if (n.type === "brandKit") {
        return {
          ...n,
          data: { ...n.data, ...common, onChange: updateNodeData },
        };
      }
      if (n.type === "settings") {
        return {
          ...n,
          data: { ...n.data, ...common, onChange: updateNodeData },
        };
      }
      if (n.type === "styleExtractor") {
        const src = styleExtractorSourceByNodeId.get(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            sourceImageDataUrl: src?.dataUrl ?? null,
            sourceLabel: src?.label ?? null,
            onExtract: runExtractStyle,
            onTextChange: handleStyleExtractorTextChange,
          },
        };
      }
      if (n.type === "referenceStudio") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            references: referencesByGenId.get(n.id) ?? [],
            inheritedSettings: settingsByTargetId.get(n.id) ?? null,
            inheritedBrand: brandByTargetId.get(n.id) ?? null,
            onPromptChange: handleRsPromptChange,
            onSettingsChange: handleRsSettingsChange,
            onRun: runReferenceBatch,
            onRetryFailed: retryReferenceFailed,
            onRetryItem: retryReferenceItem,
            onExpandPrompts: expandReferencePrompts,
            onPromoteSelected: promoteReferenceSelectedRef.current,
            onClearResults: clearReferenceResults,
          },
        };
      }
      return n;
    });
  }, [
    nodes,
    referencesByGenId,
    settingsByTargetId,
    brandByTargetId,
    styleExtractorSourceByNodeId,
    inheritedRefsByPromptId,
    handleImageChange,
    handleImageUploadingChange,
    handlePromptChange,
    handleGeneratePromptChange,
    runGenerate,
    runExtractStyle,
    handleStyleExtractorTextChange,
    handleRsPromptChange,
    handleRsSettingsChange,
    runReferenceBatch,
    retryReferenceFailed,
    retryReferenceItem,
    expandReferencePrompts,
    clearReferenceResults,
    handleNodeDelete,
    handleNodeDuplicate,
    updateNodeData,
  ]);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      imageInput: ImageInputNode,
      prompt: PromptNode,
      generateImage: GenerateImageNode,
      settings: SettingsNode,
      styleExtractor: StyleExtractorNode,
      brandKit: BrandKitNode,
      referenceStudio: ReferenceStudioNode,
    }),
    [],
  );

  // ===== Add / remove / duplicate node helpers =====
  const nextId = (prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  };

  const insertNode = useCallback(
    (newNode: Node) => {
      setNodes((nds) => {
        const next = [...nds, newNode];
        persist(next, edges);
        return next;
      });
      setSelectedNodeId(newNode.id);
    },
    [edges, persist],
  );

  const addImageNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("img");
      const count = nodes.filter((n) => n.type === "imageInput").length + 1;
      insertNode({
        id,
        type: "imageInput",
        position: at ?? { x: 100 + Math.random() * 80, y: 100 + Math.random() * 220 },
        data: { imageDataUrl: null, filename: null, label: `Reference ${count}` },
      });
    },
    [insertNode, nodes],
  );

  const addPromptNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("prompt");
      insertNode({
        id,
        type: "prompt",
        position: at ?? { x: 420 + Math.random() * 60, y: 220 + Math.random() * 80 },
        data: { text: "" },
      });
    },
    [insertNode],
  );

  const addGenerateNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("gen");
      insertNode({
        id,
        type: "generateImage",
        position: at ?? { x: 720 + Math.random() * 60, y: 160 + Math.random() * 80 },
        data: {
          prompt: "",
          status: "idle",
          resultUrl: null,
          error: null,
          size: "1024x1024",
          quality: "auto",
          background: "auto",
          model: "auto",
          label: "Generate",
        },
      });
    },
    [insertNode],
  );

  const addReferenceStudioNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("rs");
      insertNode({
        id,
        type: "referenceStudio",
        position: at ?? { x: 720 + Math.random() * 60, y: 360 + Math.random() * 80 },
        data: {
          label: "Reference Studio",
          prompt: "",
          status: "idle",
          error: null,
          count: 4,
          mode: "variations",
          resolution: "1k",
          size: "1024x1024",
          quality: "high",
          background: "auto",
          model: "auto",
          fidelity: 65,
          seed: 42,
          seedLocked: false,
          expandedPrompts: null,
          items: [],
        } as Omit<
          ReferenceStudioNodeData,
          | "onPromptChange"
          | "onRun"
          | "onRetryFailed"
          | "onRetryItem"
          | "onSettingsChange"
          | "onExpandPrompts"
          | "onPromoteSelected"
          | "onClearResults"
          | "references"
          | "inheritedSettings"
          | "inheritedBrand"
        >,
      });
    },
    [insertNode],
  );

  /**
   * Promote selected Reference Studio results to standalone Generate nodes —
   * one new GenerateImage node per starred/selected slot, pre-populated with
   * the slot's prompt and a baked-in `resultUrl`. Lets the user iterate further
   * on the picks they like without losing the rest of the batch.
   */
  const promoteReferenceSelected = useCallback(
    (rsId: string) => {
      const rsNode = nodes.find((n) => n.id === rsId);
      if (!rsNode || rsNode.type !== "referenceStudio") return;
      const d = rsNode.data as ReferenceStudioNodeData;
      const picks = (d.items ?? []).filter((it) => it.selected && it.status === "done" && it.url);
      if (picks.length === 0) {
        notifyError("No selections", null, "Click images in the grid to select them first.");
        return;
      }

      // Build all new nodes in one pass so persistence is atomic.
      const newNodes: Node[] = picks.map((p, i) => {
        idCounter.current += 1;
        const newId = `gen-${idCounter.current}`;
        return {
          id: newId,
          type: "generateImage",
          position: {
            x: rsNode.position.x + 580 + (i % 3) * 360,
            y: rsNode.position.y + Math.floor(i / 3) * 320,
          },
          data: {
            label: `From ${d.label} #${p.index}`,
            prompt: p.prompt || d.prompt || "",
            status: "done",
            resultUrl: p.url,
            error: null,
            size: p.size,
            quality: d.quality,
            background: d.background,
            model: d.model,
          } as GenerateNodeData,
        };
      });

      setNodes((nds) => {
        const next = [...nds, ...newNodes];
        persist(next, edges);
        return next;
      });
      // Clear the picks' selected flag so the user can keep curating.
      updateNodeData(rsId, {
        items: (d.items ?? []).map((it) => (it.selected ? { ...it, selected: false } : it)),
      });
      notifySuccess(`Promoted ${picks.length} pick${picks.length === 1 ? "" : "s"} to Generate`);
    },
    [nodes, edges, persist, updateNodeData],
  );

  // Wire the forward-declared promote ref now that the function exists.
  useEffect(() => {
    promoteReferenceSelectedRef.current = promoteReferenceSelected;
  }, [promoteReferenceSelected]);

  const addSettingsNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("settings");
      insertNode({
        id,
        type: "settings",
        position: at ?? { x: 360 + Math.random() * 60, y: 460 + Math.random() * 80 },
        data: {
          label: "Settings",
          model: "auto",
          size: "1024x1024",
          quality: "auto",
          background: "auto",
          referenceImageDataUrl: null,
          referenceImageFilename: null,
          textReference: "",
          unifiedPrompt: "",
        } as SettingsNodeData,
      });
    },
    [insertNode],
  );

  const addBrandKitNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("brand");
      insertNode({
        id,
        type: "brandKit",
        position: at ?? { x: 80 + Math.random() * 60, y: 460 + Math.random() * 80 },
        data: {
          label: "Brand Kit",
          brandId: null,
          brandSnapshot: null,
        } as BrandKitNodeData,
      });
    },
    [insertNode],
  );

  const addStyleExtractorNode = useCallback(
    (at?: { x: number; y: number }) => {
      const id = nextId("style");
      insertNode({
        id,
        type: "styleExtractor",
        position: at ?? { x: 420 + Math.random() * 60, y: 320 + Math.random() * 80 },
        data: {
          label: "Style Extractor",
          text: "",
          status: "idle",
          error: null,
          sourceImageDataUrl: null,
          sourceLabel: null,
        } as Omit<StyleExtractorNodeData, "onExtract" | "onTextChange">,
      });
    },
    [insertNode],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          persist(nextNodes, nextEdges);
          return nextEdges;
        });
        return nextNodes;
      });
      setSelectedNodeId((c) => (c === nodeId ? null : c));
    },
    [persist],
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const src = nodes.find((n) => n.id === nodeId);
      if (!src) return;
      const id = nextId(src.type ?? "node");
      // Strip out callback fields so we don't carry decorator references.
      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(src.data ?? {})) {
        if (typeof v === "function") continue;
        if (k === "references" || k === "inheritedSettings" || k === "inheritedRefs" || k === "sourceImageDataUrl" || k === "sourceLabel") continue;
        cleanData[k] = v;
      }
      const copy: Node = {
        ...src,
        id,
        position: { x: src.position.x + 32, y: src.position.y + 32 },
        selected: false,
        data: cleanData,
      };
      insertNode(copy);
    },
    [insertNode, nodes],
  );

  // Wire the forward-declared refs so the in-node action buttons stay current.
  useEffect(() => {
    deleteNodeRef.current = deleteNode;
    duplicateNodeRef.current = duplicateNode;
  }, [deleteNode, duplicateNode]);

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edgeId);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const resetCanvas = useCallback(() => {
    const { nodes: ns, edges: es } = defaultStarterNodes();
    setNodes(ns);
    setEdges(es);
    setSelectedNodeId(null);
    persist(ns, es);
  }, [persist]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        e.preventDefault();
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteNode, selectedNodeId]);

  // ===== Workspace controls =====
  const onCreateWorkspace = useCallback((name: string) => {
    setStore((prev) => {
      const next = addWorkspace(prev, name);
      saveStore(next);
      return next;
    });
  }, []);
  const onRenameWorkspace = useCallback((id: string, name: string) => {
    setStore((prev) => {
      const next = renameWorkspace(prev, id, name);
      saveStore(next);
      return next;
    });
  }, []);
  const onDeleteWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const next = deleteWorkspace(prev, id);
      saveStore(next);
      return next;
    });
  }, []);
  const onSwitchWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const next = switchWorkspace(prev, id);
      saveStore(next);
      return next;
    });
  }, []);
  const onDuplicateWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const next = duplicateWorkspace(prev, id);
      saveStore(next);
      return next;
    });
  }, []);

  // ===== Sidebar collapsed state =====
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {}
  }, [sidebarCollapsed]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const workspaceList = useMemo(
    () => store.workspaces.map((w) => ({ id: w.id, name: w.name })),
    [store.workspaces],
  );

  // ===== Pane context menu (add-node dropdown on right-click / double-click) =====
  const [paneMenu, setPaneMenu] = useState<{
    screenX: number;
    screenY: number;
    flow: { x: number; y: number };
  } | null>(null);

  const openPaneMenu = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = reactFlowWrapper.current;
      const rect = wrap?.getBoundingClientRect();
      const screenX = rect ? clientX - rect.left : clientX;
      const screenY = rect ? clientY - rect.top : clientY;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      setPaneMenu({ screenX, screenY, flow });
    },
    [screenToFlowPosition],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      openPaneMenu(event.clientX, event.clientY);
    },
    [openPaneMenu],
  );

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // Only trigger when the user double-clicks empty pane, not on a node.
      const target = event.target as HTMLElement | null;
      if (target && target.closest(".react-flow__node")) return;
      openPaneMenu(event.clientX, event.clientY);
    },
    [openPaneMenu],
  );

  const closePaneMenu = useCallback(() => setPaneMenu(null), []);

  // Close on Escape
  useEffect(() => {
    if (!paneMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePaneMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paneMenu, closePaneMenu]);

  type PaneMenuItem = {
    key: string;
    label: string;
    icon: typeof ImageIcon;
    accentClass: string;
    add: (at: { x: number; y: number }) => void;
  };

  const paneMenuItems: PaneMenuItem[] = useMemo(
    () => [
      {
        key: "imageInput",
        label: "Reference Image",
        icon: ImageIcon,
        accentClass: "text-sky-300",
        add: addImageNode,
      },
      {
        key: "prompt",
        label: "Prompt",
        icon: FileText,
        accentClass: "text-amber-200",
        add: addPromptNode,
      },
      {
        key: "generateImage",
        label: "Generate Image",
        icon: Sparkles,
        accentClass: "text-violet-300",
        add: addGenerateNode,
      },
      {
        key: "referenceStudio",
        label: "Reference Studio",
        icon: Layers,
        accentClass: "text-cyan-300",
        add: addReferenceStudioNode,
      },
      {
        key: "settings",
        label: "Settings",
        icon: SlidersHorizontal,
        accentClass: "text-emerald-300",
        add: addSettingsNode,
      },
      {
        key: "brandKit",
        label: "Brand Kit",
        icon: Briefcase,
        accentClass: "text-orange-300",
        add: addBrandKitNode,
      },
      {
        key: "styleExtractor",
        label: "Style Extractor",
        icon: Palette,
        accentClass: "text-fuchsia-300",
        add: addStyleExtractorNode,
      },
    ],
    [
      addImageNode,
      addPromptNode,
      addGenerateNode,
      addReferenceStudioNode,
      addSettingsNode,
      addBrandKitNode,
      addStyleExtractorNode,
    ],
  );

  return (
    <div className="h-screen w-full flex flex-col bg-[#0b0d12] relative">
      {/* Top header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06] bg-[#0d0f15]/85 backdrop-blur-xl z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
            data-testid="link-back-dashboard"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Link>
          <div className="w-px h-5 bg-white/[0.08]" />
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[12px] font-medium text-foreground/95 tracking-tight">Nodes</span>
            <span className="text-muted-foreground/35">/</span>
            <span className="text-[11.5px] text-foreground/85 truncate" data-testid="text-current-workspace">
              {current.name}
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[9.5px] uppercase tracking-wider text-muted-foreground/55 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_1px_rgba(56,189,248,0.45)]" />
            Reference
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_1px_rgba(252,211,77,0.45)]" />
            Prompt
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] shadow-[0_0_6px_1px_rgba(167,139,250,0.45)]" />
            Generate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_1px_rgba(34,211,238,0.55)]" />
            Reference Studio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_1px_rgba(110,231,183,0.45)]" />
            Settings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_6px_1px_rgba(240,171,252,0.45)]" />
            Style Extractor
          </span>
        </div>
      </div>

      {/* Body: sidebar + canvas */}
      <div className="flex-1 min-h-0 flex relative">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          workspaces={workspaceList}
          currentWorkspaceId={current.id}
          onSwitchWorkspace={onSwitchWorkspace}
          onCreateWorkspace={onCreateWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
          onDuplicateWorkspace={onDuplicateWorkspace}
          onAddImage={addImageNode}
          onAddPrompt={addPromptNode}
          onAddGenerate={addGenerateNode}
          onAddSettings={addSettingsNode}
          onAddBrandKit={addBrandKitNode}
          onAddStyleExtractor={addStyleExtractorNode}
          onAddReferenceStudio={addReferenceStudioNode}
          onResetCanvas={resetCanvas}
          selectedNode={selectedNode}
          onUpdateNodeData={updateNodeData}
          onDeleteNode={deleteNode}
          onDuplicateNode={duplicateNode}
          edges={edges}
          onDeleteEdge={deleteEdge}
        />

        {/* Canvas */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 min-w-0 relative"
          onDoubleClick={onPaneDoubleClick}
        >
          <ReactFlow
            nodes={decoratedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onMoveEnd={(_e, vp) => persistViewport(vp)}
            onPaneClick={() => {
              setSelectedNodeId(null);
              closePaneMenu();
            }}
            onPaneContextMenu={onPaneContextMenu}
            edgesReconnectable={true}
            nodeTypes={nodeTypes}
            defaultViewport={lastViewport.current}
            fitView={!lastViewport.current}
            fitViewOptions={{ padding: 0.2 }}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ animated: true, style: { strokeWidth: 1.5 } }}
            minZoom={0.2}
            maxZoom={3}
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1c1f2b" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="!bg-[#13151c]/85 !border !border-white/10 !rounded-xl backdrop-blur-xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)] overflow-hidden"
              maskColor="rgba(11,13,18,0.7)"
              nodeColor={(n) => {
                if (n.type === "imageInput") return "#38bdf8";
                if (n.type === "prompt") return "#fcd34d";
                if (n.type === "generateImage") return "#a78bfa";
                if (n.type === "referenceStudio") return "#22d3ee";
                if (n.type === "settings") return "#6ee7b7";
                if (n.type === "styleExtractor") return "#f0abfc";
                return "#6b7280";
              }}
              nodeStrokeWidth={0}
            />
          </ReactFlow>
          <CanvasControls />

          {/* Add-node dropdown menu shown on right-click or double-click of empty canvas */}
          {paneMenu && (
            <div
              className="absolute inset-0 z-40"
              onClick={closePaneMenu}
              onContextMenu={(e) => {
                e.preventDefault();
                closePaneMenu();
              }}
            >
              <div
                className="absolute min-w-[220px] rounded-xl border border-white/10 bg-[#13151c]/95 backdrop-blur-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] py-1.5 text-foreground"
                style={{
                  left: Math.min(paneMenu.screenX, (reactFlowWrapper.current?.clientWidth ?? 0) - 240),
                  top: Math.min(paneMenu.screenY, (reactFlowWrapper.current?.clientHeight ?? 0) - 280),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40">
                  Add node
                </div>
                {paneMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/85 hover:bg-white/10 transition-colors text-left"
                      onClick={() => {
                        item.add(paneMenu.flow);
                        closePaneMenu();
                      }}
                    >
                      <Icon className={`w-4 h-4 ${item.accentClass}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NodesEditor() {
  return (
    <ReactFlowProvider>
      <NodesEditorInner />
    </ReactFlowProvider>
  );
}
