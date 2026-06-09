import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useListBrands } from "@workspace/api-client-react";
import { Loader2, Calendar, ChevronLeft, ChevronRight, Instagram, Linkedin, Twitter, Facebook, Image as ImageIcon, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Post {
  id: number;
  day: number;
  hook: string;
  caption: string;
  platform: string;
  imageUrl?: string | null;
  campaignId: number;
}

interface Campaign {
  id: number;
  brandId: number;
  title: string;
  createdAt: string;
  posts: Post[];
  brand?: { companyName: string; logoUrl?: string; primaryColor?: string };
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  linkedin: Linkedin,
  twitter: Twitter,
  facebook: Facebook,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-500",
  linkedin: "bg-blue-600",
  twitter: "bg-slate-800",
  facebook: "bg-blue-500",
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function ContentCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);

  const { data: brands, isLoading: brandsLoading } = useListBrands();

  useEffect(() => {
    if (brands && brands.length > 0 && !selectedBrandId) {
      setSelectedBrandId(brands[0].id);
      void loadCampaigns(brands[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands]);

  async function loadCampaigns(brandId: number) {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/brands/${brandId}/campaigns`);
      if (res.ok) {
        const data = await res.json() as Campaign[];
        setCampaigns(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBrandChange(brandId: number) {
    setSelectedBrandId(brandId);
    await loadCampaigns(brandId);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // Build a map: dayOfMonth → list of posts
  // We distribute campaign posts across calendar days starting from the campaign creation date
  const postsByDay = new Map<number, { post: Post; campaign: Campaign }[]>();

  for (const campaign of campaigns) {
    const startDate = new Date(campaign.createdAt);
    const campaignMonth = startDate.getMonth();
    const campaignYear = startDate.getFullYear();

    for (const post of campaign.posts) {
      const postDate = new Date(startDate);
      postDate.setDate(postDate.getDate() + post.day - 1);

      if (postDate.getFullYear() === year && postDate.getMonth() === month) {
        const dayNum = postDate.getDate();
        if (!postsByDay.has(dayNum)) postsByDay.set(dayNum, []);
        postsByDay.get(dayNum)!.push({ post, campaign });
      }
    }
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  if (brandsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Content Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Visualize your campaign posts across time</p>
        </div>

        {/* Brand selector */}
        {brands && brands.length > 0 && (
          <select
            value={selectedBrandId ?? ""}
            onChange={(e) => handleBrandChange(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {brands.map((b: { id: number; companyName: string }) => (
              <option key={b.id} value={b.id}>{b.companyName}</option>
            ))}
          </select>
        )}
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-card border border-card-border rounded-2xl px-5 py-3">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-foreground">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* No brands state */}
      {(!brands || brands.length === 0) && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">No brands yet. Create a brand and generate a campaign to see posts here.</p>
          <Link href="/brands/new">
            <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              Create Brand
            </button>
          </Link>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        </div>
      )}

      {/* Calendar grid */}
      {!loading && brands && brands.length > 0 && (
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }).map((_, cellIdx) => {
              const dayNum = cellIdx - firstDay + 1;
              const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
              const isToday = isCurrentMonth && dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const dayPosts = isCurrentMonth ? (postsByDay.get(dayNum) ?? []) : [];

              return (
                <div
                  key={cellIdx}
                  className={cn(
                    "min-h-[110px] p-2 border-b border-r border-border/60 last:border-r-0",
                    !isCurrentMonth && "bg-muted/20",
                    isToday && "bg-primary/5"
                  )}
                >
                  {isCurrentMonth && (
                    <>
                      <div className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold mb-1.5",
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}>
                        {dayNum}
                      </div>
                      <div className="space-y-1">
                        {dayPosts.slice(0, 3).map(({ post, campaign }) => {
                          const Icon = PLATFORM_ICONS[post.platform] ?? Instagram;
                          const color = PLATFORM_COLORS[post.platform] ?? "bg-gray-500";
                          return (
                            <Link key={post.id} href={`/campaigns/${campaign.id}`}>
                              <div className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-white cursor-pointer hover:opacity-80 transition-opacity truncate",
                                color
                              )}>
                                {post.imageUrl && <ImageIcon className="w-2.5 h-2.5 flex-shrink-0 opacity-80" />}
                                <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">{post.hook?.slice(0, 25) ?? `Day ${post.day}`}</span>
                              </div>
                            </Link>
                          );
                        })}
                        {dayPosts.length > 3 && (
                          <p className="text-[10px] text-muted-foreground px-1">+{dayPosts.length - 3} more</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && campaigns.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Platforms:</p>
          {Object.entries(PLATFORM_COLORS).map(([platform, color]) => {
            const Icon = PLATFORM_ICONS[platform];
            return (
              <div key={platform} className="flex items-center gap-1.5">
                <div className={cn("w-3 h-3 rounded-sm", color)} />
                <Icon className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground capitalize">{platform}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign list for context */}
      {!loading && campaigns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Campaigns</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaigns.map((c) => (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <div className="p-4 bg-card border border-card-border rounded-xl hover:border-primary/40 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                  </div>
                  <p className="text-xs text-muted-foreground">{c.posts.length} posts · {new Date(c.createdAt).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
