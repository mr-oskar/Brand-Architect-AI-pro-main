import { useParams, useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { useGetBrand, useUpdateBrand, getGetBrandQueryKey, getListBrandsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Globe, Loader2, Check } from "lucide-react";

const industries = [
  "Technology", "SaaS", "E-commerce", "Fashion", "Luxury", "Health & Fitness",
  "Food & Beverage", "Finance", "Legal", "Real Estate", "Education", "Media",
  "Travel", "Beauty", "Consulting", "Non-profit", "Manufacturing", "Other",
];

export default function BrandEdit() {
  const params = useParams<{ id: string }>();
  const brandId = parseInt(params.id, 10);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: brand, isLoading } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });
  const updateBrand = useUpdateBrand();

  const [form, setForm] = useState({
    companyName: "",
    companyDescription: "",
    industry: "",
    websiteUrl: "",
  });

  useEffect(() => {
    if (brand) {
      setForm({
        companyName: brand.companyName,
        companyDescription: brand.companyDescription,
        industry: brand.industry,
        websiteUrl: brand.websiteUrl ?? "",
      });
    }
  }, [brand]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await updateBrand.mutateAsync({
      id: brandId,
      data: {
        companyName: form.companyName,
        companyDescription: form.companyDescription,
        industry: form.industry,
        websiteUrl: form.websiteUrl || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetBrandQueryKey(brandId) });
    queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey() });
    setSaved(true);
    setTimeout(() => navigate(`/brands/${brandId}`), 1200);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-xl mx-auto space-y-7">
      <div className="flex items-center gap-3">
        <Link href={`/brands/${brandId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Edit Brand</h1>
          <p className="text-sm text-muted-foreground">Update your brand project details</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="rounded-2xl border border-card-border bg-card p-8 space-y-5 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Company Name *</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Company Description *</label>
          <textarea
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={4}
            value={form.companyDescription}
            onChange={(e) => setForm((f) => ({ ...f, companyDescription: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Industry *</label>
          <select
            className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            required
          >
            <option value="">Select industry...</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Website URL (optional)</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://yourwebsite.com"
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={updateBrand.isPending || saved}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saved ? (
            <><Check className="w-4 h-4" /> Saved — redirecting...</>
          ) : updateBrand.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : (
            "Save Changes"
          )}
        </button>
      </form>
    </div>
  );
}
