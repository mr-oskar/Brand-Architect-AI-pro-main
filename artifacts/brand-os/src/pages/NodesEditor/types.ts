import type { Node, Edge, Viewport } from "@xyflow/react";

export type NodeKind =
  | "imageInput"
  | "prompt"
  | "generateImage"
  | "settings"
  | "styleExtractor"
  | "brandKit"
  | "referenceStudio";

export type GenerateNodeSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
export type GenerateNodeQuality = "low" | "medium" | "high" | "auto";
export type GenerateNodeBackground = "transparent" | "opaque" | "auto";
export type GenerateModel = "auto" | "gpt-image-1" | "gemini-2.5-flash-image";

export type ImageNodeData = {
  imageDataUrl: string | null;
  filename: string | null;
  label: string;
  uploading?: boolean;
  onChange: (id: string, dataUrl: string | null, filename: string | null) => void;
  onUploadingChange: (id: string, uploading: boolean) => void;
};

export type PromptNodeData = {
  text: string;
  /** References injected from a downstream generate node (for read-only display). */
  inheritedRefs?: ReferenceMention[];
  onChange: (id: string, text: string) => void;
};

export type ReferenceMention = {
  id: string;
  label: string;
  mention: string;
  thumbnail: string | null;
  ready: boolean;
  kind: NodeKind;
};

export type GenerateNodeData = {
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  references: ReferenceMention[];
  size?: GenerateNodeSize;
  quality?: GenerateNodeQuality;
  background?: GenerateNodeBackground;
  model?: GenerateModel;
  label?: string;
  /** Settings inherited from a connected SettingsNode (display only — backend resolves). */
  inheritedSettings?: SettingsNodeData | null;
  /** Brand identity inherited from a connected BrandKitNode (display only). */
  inheritedBrand?: BrandFull | null;
  onPromptChange: (id: string, text: string) => void;
  onRun: (id: string) => void;
};

export type SettingsNodeData = {
  label: string;
  model: GenerateModel;
  size: GenerateNodeSize;
  quality: GenerateNodeQuality;
  background: GenerateNodeBackground;
  /** Optional reference image (data URL) to inject into every connected generate node. */
  referenceImageDataUrl: string | null;
  referenceImageFilename: string | null;
  /** Optional plain-text reference (e.g. brand voice) to inject into the prompt. */
  textReference: string;
  /** Unified prompt prefix that wraps the downstream prompt. */
  unifiedPrompt: string;
};

export type StyleExtractorNodeData = {
  label: string;
  /** The professional prompt produced by analyzing the connected image. */
  text: string;
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  /** Source image data URL, set automatically from the connected source node. */
  sourceImageDataUrl: string | null;
  sourceLabel: string | null;
  onExtract: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
};

/** A single brand returned by GET /api/brands (list endpoint). */
export type BrandSummary = {
  id: number;
  companyName: string;
  industry: string | null;
  logoUrl: string | null;
  status?: string;
};

/** Color palette as stored in brand.brandKit. */
export type BrandColorPalette = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
  neutral?: string;
};

/** Subset of the brand_kit jsonb we use in the node. Other fields are tolerated. */
export type BrandKitPayload = {
  personality?: string;
  positioning?: string;
  toneOfVoice?: string;
  audienceSegments?: string[];
  visualStyle?: string;
  visualStyleRules?: string;
  colorPalette?: BrandColorPalette;
  taglines?: string[];
  brandKeywords?: string[];
  messagingPillars?: string[];
  dosCommunication?: string[];
  dontsCommunication?: string[];
  typographyRecommendations?: string;
  missionStatement?: string;
  visionStatement?: string;
};

/** Full brand returned by GET /api/brands/:id. */
export type BrandFull = {
  id: number;
  companyName: string;
  industry: string | null;
  companyDescription?: string | null;
  websiteUrl?: string | null;
  logoUrl: string | null;
  brandKit: BrandKitPayload | null;
};

export type BrandKitNodeData = {
  label: string;
  brandId: number | null;
  /** Snapshot of the selected brand so the node renders even before refetching. */
  brandSnapshot: BrandFull | null;
};

export type ReferenceStudioMode =
  | "variations"
  | "styleLock"
  | "subjectLock"
  | "matrix"
  | "aspectPack";

export type ReferenceStudioResolution = "1k" | "2k" | "4k";

export type ReferenceStudioItem = {
  /** 1-based index inside this batch run. */
  index: number;
  status: "pending" | "running" | "done" | "error";
  url: string | null;
  error: string | null;
  /** Resolved prompt sent for this slot (after expansion / mode injection). */
  prompt: string;
  seed: number;
  /** Aspect actually used for this slot (Aspect Pack mode varies it). */
  size: GenerateNodeSize;
  selected: boolean;
  starred: boolean;
};

export type ReferenceStudioNodeData = {
  label: string;
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  error: string | null;

  /** User-configurable image count (2–16). */
  count: number;
  mode: ReferenceStudioMode;
  resolution: ReferenceStudioResolution;
  size: GenerateNodeSize;
  quality: GenerateNodeQuality;
  background: GenerateNodeBackground;
  model: GenerateModel;

  /** 0–100 — controls how strongly the references are preserved. */
  fidelity: number;
  /** Base seed (when seedLocked, all slots use this; otherwise random per slot). */
  seed: number;
  seedLocked: boolean;
  /** Optional per-slot expanded prompts (filled by Smart Expansion). */
  expandedPrompts: string[] | null;

  items: ReferenceStudioItem[];

  /** Decorator-injected (read-only). */
  references?: ReferenceMention[];
  inheritedSettings?: SettingsNodeData | null;
  inheritedBrand?: BrandFull | null;

  /** Decorator-injected callbacks. */
  onPromptChange?: (id: string, text: string) => void;
  onRun?: (id: string) => void;
  onRetryFailed?: (id: string) => void;
  onRetryItem?: (id: string, index: number) => void;
  onSettingsChange?: (id: string, patch: Partial<ReferenceStudioNodeData>) => void;
  onExpandPrompts?: (id: string) => void;
  onPromoteSelected?: (id: string) => void;
  onClearResults?: (id: string) => void;
};

export type WorkspaceState = {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  viewport?: Viewport;
  updatedAt: number;
};

export type WorkspaceStore = {
  workspaces: WorkspaceState[];
  currentId: string;
};
