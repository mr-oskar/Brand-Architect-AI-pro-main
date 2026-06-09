import OpenAI from "openai";

// Provider selection (priority): user OpenAI key → Gemini → Replit AI proxy.
// We prefer the user's own OPENAI_API_KEY first so that when a user adds
// their own key (typically because the Replit free-tier proxy quota has been
// exhausted) it actually takes effect.
const geminiKey = process.env.GEMINI_API_KEY;
const userKey = process.env.OPENAI_API_KEY;
const proxyKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const proxyBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

let apiKey: string;
let baseURL: string | undefined;
const provider: "gemini" | "openai" = userKey
  ? "openai"
  : geminiKey
  ? "gemini"
  : "openai";

if (userKey) {
  apiKey = userKey;
  baseURL = process.env.OPENAI_BASE_URL || undefined;
} else if (geminiKey) {
  apiKey = geminiKey;
  baseURL = "https://generativelanguage.googleapis.com/v1beta/openai/";
} else if (proxyKey && proxyBaseUrl) {
  apiKey = proxyKey;
  baseURL = proxyBaseUrl;
} else {
  throw new Error(
    "No AI provider configured. Provision the Replit OpenAI AI integration (AI_INTEGRATIONS_OPENAI_*), or set GEMINI_API_KEY / OPENAI_API_KEY.",
  );
}

// Map OpenAI model names to Gemini equivalents when running on Gemini.
function mapModel(model: string): string {
  if (provider !== "gemini") return model;
  const m = model.toLowerCase();
  if (m.includes("nano") || m.includes("mini") || m.includes("flash")) {
    return "gemini-2.5-flash";
  }
  if (m.startsWith("gpt-image") || m.includes("image")) {
    return "gemini-2.5-flash-image-preview";
  }
  if (m.startsWith("o3") || m.startsWith("o4") || m.includes("pro") || m.includes("5.2") || m.includes("5.3") || m.includes("5.4")) {
    return "gemini-2.5-pro";
  }
  return "gemini-2.5-flash";
}

const rawClient = new OpenAI({ apiKey, baseURL });

// Wrap chat.completions.create to translate model names transparently.
const originalCreate = rawClient.chat.completions.create.bind(rawClient.chat.completions);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(rawClient.chat.completions as any).create = (params: any, opts?: any) => {
  if (params && typeof params.model === "string") {
    params = { ...params, model: mapModel(params.model) };
  }
  return originalCreate(params, opts);
};

export const openai = rawClient;
export const aiProvider = provider;
