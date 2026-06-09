import { useState, type FormEvent, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Sparkles, Loader2, Mail, Lock, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const REPLIT_ICON = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M11.374 0H6.987C5.926 0 5.063.863 5.063 1.923v5.54H11.374V0zM5.063 10.847v2.308H11.374v-2.308c0-1.06-.863-1.923-1.924-1.923H6.987c-1.061 0-1.924.863-1.924 1.923zM12.626 7.463v2.307H18.937c1.061 0 1.924-.862 1.924-1.923V1.923C20.861.863 19.998 0 18.937 0h-4.387c-1.061 0-1.924.863-1.924 1.923v5.54zM12.626 13.154V24h4.387c1.061 0 1.924-.863 1.924-1.923v-5.54H12.626v-3.383zM5.063 16.539v5.538C5.063 23.137 5.926 24 6.987 24h4.387v-7.461H5.063z"/>
  </svg>
);

const AUTH_ERRORS: Record<string, string> = {
  replit_auth_failed: "Replit sign-in was cancelled or failed. Please try again.",
  invalid_state: "The sign-in session expired. Please try again.",
  state_expired: "The sign-in session expired. Please try again.",
  token_exchange_failed: "Could not complete sign-in. Please try again.",
  invalid_token: "Could not verify your identity. Please try again.",
  replit_auth_not_configured: "Replit Auth is not configured on this server.",
};

export default function SignIn() {
  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const errKey = params.get("error");
    if (errKey) setError(AUTH_ERRORS[errKey] ?? "Sign-in failed. Please try again.");
  }, [search]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      setLocation("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0a14] px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-indigo-500/10 pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[420px] relative">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-base text-white tracking-tight leading-none">Brand Architect</p>
            <p className="text-[10px] text-white/40 font-medium mt-0.5 uppercase tracking-wider">AI Pro</p>
          </div>
        </div>

        <div className="bg-[#11111d]/80 backdrop-blur border border-white/10 rounded-2xl p-7 shadow-2xl shadow-black/40">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-sm text-white/50 mt-1">Sign in to your workspace</p>
          </div>

          {/* Replit Auth */}
          <a
            href="/api/auth/replit/login?redirect_to=/"
            className="flex items-center justify-center gap-2.5 w-full bg-[#f26207] hover:bg-[#e05500] text-white font-semibold rounded-xl py-2.5 text-sm transition-all shadow-lg shadow-orange-500/20 mb-5"
          >
            <REPLIT_ICON />
            Continue with Replit
          </a>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30 font-medium">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-2.5 text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-center text-sm text-white/50">
            Don't have an account?{" "}
            <Link href="/sign-up" className="text-violet-300 hover:text-violet-200 font-medium">
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
