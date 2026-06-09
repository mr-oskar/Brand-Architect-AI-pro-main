import { useParams, Link } from "wouter";
import { useListCampaigns, useGetBrand, getListCampaignsQueryKey, getGetBrandQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Megaphone, Calendar, FileText, ChevronRight, Loader2 } from "lucide-react";

export default function CampaignList() {
  const params = useParams<{ id: string }>();
  const brandId = parseInt(params.id, 10);

  const { data: brand } = useGetBrand(brandId, {
    query: { enabled: !!brandId, queryKey: getGetBrandQueryKey(brandId) },
  });
  const { data: campaigns, isLoading } = useListCampaigns(brandId, {
    query: { enabled: !!brandId, queryKey: getListCampaignsQueryKey(brandId) },
  });

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto space-y-7">
      <div className="flex items-center gap-3">
        <Link href={`/brands/${brandId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {brand?.companyName ?? "Brand"} — Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">All generated marketing campaigns</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        </div>
      ) : !Array.isArray(campaigns) || campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">No campaigns yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Generate a campaign from the brand kit page.</p>
          <Link
            href={`/brands/${brandId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Go to Brand Kit
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="flex items-start justify-between gap-4 p-5 rounded-xl border border-card-border bg-card hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{campaign.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 max-w-lg">{campaign.strategy}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      {campaign.days?.length ?? 0} days planned
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      {campaign.posts?.length ?? 0} posts
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(campaign.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0 mt-1 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
