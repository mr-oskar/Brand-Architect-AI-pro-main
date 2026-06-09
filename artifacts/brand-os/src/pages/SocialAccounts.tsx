import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  Instagram, Linkedin, Twitter, Facebook, Plus, Trash2, CheckCircle2,
  ArrowLeft, Link2, AlertCircle, Loader2, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface SocialAccount {
  id: number;
  brandId: number;
  platform: string;
  accountName: string;
  accountId?: string;
  pageId?: string;
  createdAt: string;
}

interface PlatformConfig {
  label: string;
  color: string;
  bg: string;
  textColor: string;
  icon: React.ElementType;
  docsUrl: string;
  tokenLabel: string;
  tokenHelp: string;
  needsPageId: boolean;
  needsAccountId: boolean;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  twitter: {
    label: "X / Twitter",
    color: "#000",
    bg: "bg-gray-50 dark:bg-gray-900 border-gray-200",
    textColor: "text-gray-800 dark:text-gray-200",
    icon: Twitter,
    docsUrl: "https://developer.twitter.com/en/portal/dashboard",
    tokenLabel: "Bearer Token",
    tokenHelp: "From Twitter Developer Portal → Keys and Tokens → Bearer Token",
    needsPageId: false,
    needsAccountId: false,
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200",
    textColor: "text-blue-800 dark:text-blue-200",
    icon: Linkedin,
    docsUrl: "https://developer.linkedin.com/",
    tokenLabel: "Access Token",
    tokenHelp: "From LinkedIn Developer Apps → Auth → OAuth 2.0 tokens. Requires your person URN as Account ID.",
    needsPageId: false,
    needsAccountId: true,
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    bg: "bg-pink-50 dark:bg-pink-950/30 border-pink-200",
    textColor: "text-pink-800 dark:text-pink-200",
    icon: Instagram,
    docsUrl: "https://developers.facebook.com/docs/instagram-api",
    tokenLabel: "Page Access Token",
    tokenHelp: "From Facebook Developer → Graph API Explorer. Select your Instagram Business account page. Requires Page ID.",
    needsPageId: true,
    needsAccountId: false,
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200",
    textColor: "text-blue-700 dark:text-blue-300",
    icon: Facebook,
    docsUrl: "https://developers.facebook.com/",
    tokenLabel: "Page Access Token",
    tokenHelp: "From Facebook Developer → Graph API Explorer → Select your Page. Requires Page ID.",
    needsPageId: true,
    needsAccountId: false,
  },
};

function ConnectDialog({
  platform,
  brandId,
  onSuccess,
  onClose,
}: {
  platform: string;
  brandId: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const cfg = PLATFORMS[platform];
  const Icon = cfg.icon;
  const [accountName, setAccountName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountName || !accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/brands/${brandId}/social-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          accountName,
          accountId: accountId || undefined,
          accessToken,
          pageId: pageId || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast({ title: `${cfg.label} connected`, description: `@${accountName} is now connected.` });
      onSuccess();
    } catch (err) {
      toast({ title: "Connection failed", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className="w-5 h-5" style={{ color: cfg.color }} />
          Connect {cfg.label}
        </DialogTitle>
        <DialogDescription>
          Enter your credentials to connect {cfg.label} for publishing.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200 flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {cfg.tokenHelp}{" "}
            <a href={cfg.docsUrl} target="_blank" rel="noreferrer" className="underline font-medium inline-flex items-center gap-1">
              Get token <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Account Name / Handle</Label>
          <Input
            placeholder={`e.g. my_brand`}
            value={accountName}
            onChange={e => setAccountName(e.target.value)}
            required
          />
        </div>

        {cfg.needsAccountId && (
          <div className="space-y-2">
            <Label>Person URN / Account ID</Label>
            <Input
              placeholder="e.g. ABC123xyz"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              LinkedIn Person ID from your profile URL or API.
            </p>
          </div>
        )}

        {cfg.needsPageId && (
          <div className="space-y-2">
            <Label>Page ID</Label>
            <Input
              placeholder="e.g. 123456789012345"
              value={pageId}
              onChange={e => setPageId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The numeric ID of your {cfg.label} page.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>{cfg.tokenLabel}</Label>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              placeholder="Paste your token here..."
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stored securely. Never shared.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : <><Link2 className="w-4 h-4 mr-2" />Connect</>}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

export default function SocialAccounts() {
  const { brandId } = useParams<{ brandId: string }>();
  const id = parseInt(brandId ?? "0", 10);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadAccounts() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/brands/${id}/social-accounts`);
      if (res.ok) setAccounts(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAccounts(); }, [id]);

  async function handleDisconnect(accountId: number, platform: string) {
    try {
      await fetch(`${BASE}/api/social-accounts/${accountId}`, { method: "DELETE" });
      setAccounts(prev => prev.filter(a => a.id !== accountId));
      toast({ title: `${PLATFORMS[platform]?.label ?? platform} disconnected` });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  }

  const connectedPlatforms = new Set(accounts.map(a => a.platform));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/brands/${id}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Social Media Accounts</h1>
          <p className="text-sm text-muted-foreground">Connect accounts to publish and schedule posts.</p>
        </div>
      </div>

      {/* Connected Accounts */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Connected</h2>
          {accounts.map(account => {
            const cfg = PLATFORMS[account.platform];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <div key={account.id} className={cn("flex items-center justify-between p-4 rounded-xl border", cfg.bg)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-gray-800 shadow-sm border">
                    <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <p className={cn("font-semibold text-sm", cfg.textColor)}>{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">@{account.accountName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                  </Badge>
                  <Button
                    variant="ghost" size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDisconnect(account.id, account.platform)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Available Platforms */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {accounts.length > 0 ? "Add More" : "Connect a Platform"}
        </h2>
        <div className="grid gap-3">
          {Object.entries(PLATFORMS).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isConnected = connectedPlatforms.has(key);
            return (
              <div key={key} className={cn("flex items-center justify-between p-4 rounded-xl border bg-card")}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-muted shadow-sm border">
                    <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">{isConnected ? "Reconnect to update token" : "Not connected"}</p>
                  </div>
                </div>
                <Button
                  variant={isConnected ? "outline" : "default"}
                  size="sm"
                  onClick={() => setConnectPlatform(key)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {isConnected ? "Update" : "Connect"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
        <p className="font-medium mb-1 text-foreground">🔐 About security</p>
        <p>Your access tokens are stored encrypted in the database and used only when publishing posts. They are never exposed in the frontend or logs.</p>
      </div>

      {connectPlatform && (
        <Dialog open onOpenChange={() => setConnectPlatform(null)}>
          <ConnectDialog
            platform={connectPlatform}
            brandId={id}
            onSuccess={() => { setConnectPlatform(null); loadAccounts(); }}
            onClose={() => setConnectPlatform(null)}
          />
        </Dialog>
      )}
    </div>
  );
}
