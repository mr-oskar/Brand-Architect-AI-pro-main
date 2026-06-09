import { useState } from "react";
import { useLocation } from "wouter";
import { LayoutTemplate, Search, Sparkles, Star, ArrowRight, Instagram, Twitter, Linkedin, Mail, Globe, Megaphone, X, Loader2, Building2 } from "lucide-react";
import { useListBrands, useGenerateCampaign, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const categories = ["All", "Social Media", "Email", "Ads", "Presentations", "Print", "Web"];

type Template = {
  id: number;
  name: string;
  category: string;
  platform: string;
  tags: string[];
  rating: number;
  uses: number;
  premium: boolean;
  preview: [string, string, string];
  brief: string;
  postCount: number;
};

const templates: Template[] = [
  {
    id: 1, name: "Instagram Product Launch", category: "Social Media", platform: "Instagram",
    tags: ["product", "launch", "vibrant"], rating: 4.9, uses: 1240, premium: false,
    preview: ["#4F46E5", "#818CF8", "#C7D2FE"],
    brief: "Build an Instagram product launch campaign with vibrant, high-energy visuals. Include teaser posts, a launch announcement, behind-the-scenes content, and a strong call to action driving traffic to the product page.",
    postCount: 7,
  },
  {
    id: 2, name: "LinkedIn Thought Leadership", category: "Social Media", platform: "LinkedIn",
    tags: ["thought", "professional", "insight"], rating: 4.8, uses: 890, premium: false,
    preview: ["#0EA5E9", "#38BDF8", "#BAE6FD"],
    brief: "Create a LinkedIn thought-leadership series that positions the brand as an authority. Mix industry insights, founder perspectives, contrarian takes, and practical frameworks our audience can apply immediately.",
    postCount: 5,
  },
  {
    id: 3, name: "Email Newsletter — Weekly", category: "Email", platform: "Email",
    tags: ["newsletter", "weekly", "clean"], rating: 4.7, uses: 2310, premium: true,
    preview: ["#10B981", "#34D399", "#A7F3D0"],
    brief: "Plan a clean weekly newsletter cadence with consistent sections: top story, quick wins, community highlight, and a curated link list. Keep voice warm, professional, and value-first.",
    postCount: 4,
  },
  {
    id: 4, name: "Facebook Carousel Ad", category: "Ads", platform: "Facebook",
    tags: ["carousel", "ad", "conversion"], rating: 4.6, uses: 670, premium: true,
    preview: ["#F59E0B", "#FCD34D", "#FEF3C7"],
    brief: "Design a Facebook carousel ad campaign optimized for conversions. Each card should reveal one benefit, the final card should be a strong offer with urgency. Bold colors, scroll-stopping headlines.",
    postCount: 6,
  },
  {
    id: 5, name: "Brand Story Collection", category: "Social Media", platform: "Instagram",
    tags: ["story", "brand", "narrative"], rating: 4.9, uses: 3120, premium: false,
    preview: ["#EC4899", "#F472B6", "#FBCFE8"],
    brief: "Tell the brand origin story across an Instagram series — the why, the people, the craft, and the customers we serve. Emotional, authentic, designed to build long-term affinity rather than instant conversion.",
    postCount: 8,
  },
  {
    id: 6, name: "X/Twitter Thread Starter", category: "Social Media", platform: "Twitter",
    tags: ["thread", "engagement", "viral"], rating: 4.5, uses: 450, premium: false,
    preview: ["#1D4ED8", "#3B82F6", "#BFDBFE"],
    brief: "Compose punchy X/Twitter threads built for engagement. Strong hook in the first line, contrarian or counter-intuitive insight, concrete examples, and a memorable closing line. Keep posts tight and quotable.",
    postCount: 5,
  },
  {
    id: 7, name: "Landing Page Hero Section", category: "Web", platform: "Web",
    tags: ["hero", "landing", "conversion"], rating: 4.8, uses: 780, premium: true,
    preview: ["#7C3AED", "#A78BFA", "#DDD6FE"],
    brief: "Draft landing page hero copy variants — headline, subheadline, primary CTA, social-proof line. Each variant should test a different angle: outcome-focused, problem-focused, identity-focused.",
    postCount: 3,
  },
  {
    id: 8, name: "Product Showcase Email", category: "Email", platform: "Email",
    tags: ["product", "showcase", "sale"], rating: 4.6, uses: 1580, premium: false,
    preview: ["#0891B2", "#22D3EE", "#CFFAFE"],
    brief: "Build a product-showcase email sequence: announcement, deep-dive on a single feature, customer story, and a closing offer. Visual-forward, scannable, mobile-first.",
    postCount: 4,
  },
];

const platformIcons: Record<string, React.ElementType> = {
  Instagram, Twitter, LinkedIn: Linkedin, Facebook: Megaphone, Email: Mail, Web: Globe,
};

function TemplatePlatformIcon({ platform }: { platform: string }) {
  const Icon = platformIcons[platform] ?? LayoutTemplate;
  return <Icon className="w-3.5 h-3.5" />;
}

export default function Templates() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [applyingBrandId, setApplyingBrandId] = useState<number | null>(null);

  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: brands, isLoading: brandsLoading } = useListBrands();
  const generateCampaignMutation = useGenerateCampaign();

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some((tag) => tag.includes(search.toLowerCase()));
    const matchCat = activeCategory === "All" || t.category === activeCategory;
    return matchSearch && matchCat;
  });

  async function applyTemplateToBrand(brandId: number) {
    if (!selectedTemplate) return;
    setApplyingBrandId(brandId);
    try {
      const platformKey = selectedTemplate.platform.toLowerCase();
      const campaign = await generateCampaignMutation.mutateAsync({
        id: brandId,
        data: {
          brief: `[Template: ${selectedTemplate.name}]\n${selectedTemplate.brief}`,
          postCount: selectedTemplate.postCount,
          platforms: [platformKey],
        } as Parameters<typeof generateCampaignMutation.mutateAsync>[0]["data"],
      });
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(brandId) });
      toast({
        title: "Template applied",
        description: `Created a new "${selectedTemplate.name}" campaign for your brand.`,
      });
      setSelectedTemplate(null);
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      toast({
        title: "Couldn't apply template",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setApplyingBrandId(null);
    }
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Template Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered templates that automatically adapt to your brand's visual identity.
          </p>
        </div>
        <button
          onClick={() => setSelectedTemplate(templates[0])}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate Campaign from Template
        </button>
      </div>

      {/* AI suggestion banner */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5 p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">AI Template Suggestion</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on your brand's visual style and top-performing campaigns, we recommend trying "Brand Story Collection" or "Instagram Product Launch" next.
          </p>
        </div>
        <button
          onClick={() => setSelectedTemplate(templates.find((t) => t.id === 5) ?? templates[0])}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
        >
          Explore <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search templates by name, style, or use-case..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((template) => (
          <div
            key={template.id}
            className="rounded-xl border border-card-border bg-card overflow-hidden group hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setSelectedTemplate(template)}
          >
            {/* Color preview */}
            <div className="h-32 relative" style={{ background: `linear-gradient(135deg, ${template.preview[0]}, ${template.preview[1]}, ${template.preview[2]})` }}>
              {template.premium && (
                <span className="absolute top-3 right-3 text-[10px] font-bold bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full">PRO</span>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedTemplate(template); }}
                  className="px-4 py-2 rounded-lg bg-white text-foreground text-sm font-semibold shadow-lg hover:bg-white/90 transition-colors flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Use Template
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground leading-snug">{template.name}</p>
                <span className="flex items-center gap-1 text-[11px] text-amber-500 font-semibold flex-shrink-0">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {template.rating}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                  <TemplatePlatformIcon platform={template.platform} />
                  {template.platform}
                </span>
                <span className="text-[11px] text-muted-foreground">{template.uses.toLocaleString()} uses</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {template.tags.map((tag) => (
                  <span key={tag} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    #{tag}
                  </span>
                ))}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); setSelectedTemplate(template); }}
                className="w-full mt-1 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
              >
                Apply to Brand
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <LayoutTemplate className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No templates found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try a different search term or category.</p>
        </div>
      )}

      {/* Apply-to-brand modal */}
      {selectedTemplate && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !applyingBrandId && setSelectedTemplate(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-24 relative"
              style={{ background: `linear-gradient(135deg, ${selectedTemplate.preview[0]}, ${selectedTemplate.preview[1]}, ${selectedTemplate.preview[2]})` }}
            >
              <button
                onClick={() => !applyingBrandId && setSelectedTemplate(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 text-white flex items-center justify-center hover:bg-black/40 transition-colors"
                disabled={!!applyingBrandId}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-3 left-4 right-4">
                <p className="text-white/90 text-xs flex items-center gap-1">
                  <TemplatePlatformIcon platform={selectedTemplate.platform} />
                  {selectedTemplate.platform} · {selectedTemplate.postCount} posts
                </p>
                <h2 className="text-white text-lg font-bold leading-tight mt-0.5 drop-shadow">
                  {selectedTemplate.name}
                </h2>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{selectedTemplate.brief}</p>

              <div>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">
                  Choose a brand to apply this template
                </p>

                {brandsLoading && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2 py-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading brands...
                  </div>
                )}

                {!brandsLoading && (!brands || brands.length === 0) && (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-2">You don't have any brands yet.</p>
                    <button
                      onClick={() => { setSelectedTemplate(null); navigate("/brands/new"); }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Create your first brand →
                    </button>
                  </div>
                )}

                {!brandsLoading && brands && brands.length > 0 && (
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {brands.map((brand) => {
                      const isLoading = applyingBrandId === brand.id;
                      const disabled = applyingBrandId !== null;
                      return (
                        <button
                          key={brand.id}
                          onClick={() => applyTemplateToBrand(brand.id)}
                          disabled={disabled}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-background text-left transition-colors",
                            disabled ? "opacity-60 cursor-not-allowed" : "hover:border-primary hover:bg-primary/5"
                          )}
                        >
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                            {brand.logoUrl ? (
                              <img src={brand.logoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{brand.companyName}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{brand.industry}</p>
                          </div>
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                          ) : (
                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
