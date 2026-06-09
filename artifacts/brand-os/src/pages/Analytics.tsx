import { BarChart3, TrendingUp, TrendingDown, Eye, Heart, MessageCircle, Share2, Users, Zap, Target, Calendar, ArrowUpRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const platformStats = [
  { name: "Instagram", reach: "142K", engagement: "8.4%", posts: 24, trend: "up", delta: "+12%" },
  { name: "LinkedIn", reach: "89K", engagement: "5.2%", posts: 18, trend: "up", delta: "+7%" },
  { name: "Twitter / X", reach: "56K", engagement: "3.8%", posts: 31, trend: "down", delta: "-2%" },
  { name: "Facebook", reach: "34K", engagement: "2.1%", posts: 15, trend: "up", delta: "+4%" },
];

const topPosts = [
  { title: "Summer Sale Campaign — Day 3", likes: 4820, comments: 312, shares: 891, reach: "38K", platform: "Instagram" },
  { title: "Product Launch Announcement", likes: 3240, comments: 189, shares: 540, reach: "27K", platform: "LinkedIn" },
  { title: "Behind-the-Scenes Story", likes: 2910, comments: 220, shares: 430, reach: "22K", platform: "Instagram" },
];

const kpiCards = [
  { label: "Total Reach", value: "321K", icon: Eye, color: "text-primary", bg: "bg-primary/10", trend: "+18% vs last month" },
  { label: "Avg. Engagement", value: "6.1%", icon: Heart, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950", trend: "+0.8pts vs last month" },
  { label: "Total Interactions", value: "48.2K", icon: MessageCircle, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950", trend: "+23% vs last month" },
  { label: "AI Campaigns", value: "12", icon: Zap, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950", trend: "Active campaigns" },
];

const weeklyData = [35, 52, 41, 67, 78, 90, 85, 110, 95, 120, 108, 130, 115, 140];

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/20 hover:bg-primary/40 transition-colors"
          style={{ height: `${(v / max) * 100}%` }}
          title={`${v}K`}
        />
      ))}
    </div>
  );
}

export default function Analytics() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Deep performance insights powered by AI analysis.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option>Last 30 days</option>
            <option>Last 7 days</option>
            <option>Last 90 days</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Calendar className="w-4 h-4" />
            Custom Range
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl border border-card-border bg-card p-5 space-y-3">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", kpi.bg)}>
                <Icon className={cn("w-4 h-4", kpi.color)} />
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <p className="text-[11px] text-green-600 dark:text-green-400 font-medium mt-0.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {kpi.trend}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reach Over Time */}
        <div className="lg:col-span-2 rounded-xl border border-card-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Reach Over Time</h2>
            </div>
            <span className="text-xs text-muted-foreground">Last 14 days</span>
          </div>
          <MiniBarChart data={weeklyData} />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">2 weeks ago</span>
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">AI Recommendations</h2>
          </div>
          <div className="space-y-3">
            {[
              { text: "Increase Instagram story frequency — 2× engagement lift expected", priority: "High" },
              { text: "Add CTA button to LinkedIn posts — projected +15% click-through", priority: "Medium" },
              { text: "A/B test carousel vs. single image for product posts", priority: "Medium" },
              { text: "Publish between 9-11AM Tue/Thu for maximum reach", priority: "Low" },
            ].map((rec, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 h-fit mt-0.5",
                  rec.priority === "High" ? "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400" :
                  rec.priority === "Medium" ? "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400" :
                  "bg-muted text-muted-foreground"
                )}>
                  {rec.priority}
                </span>
                <p className="text-xs text-foreground leading-relaxed">{rec.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Platform Breakdown */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Share2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Platform Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-semibold text-muted-foreground pb-3 pr-6">Platform</th>
                <th className="text-left text-xs font-semibold text-muted-foreground pb-3 pr-6">Reach</th>
                <th className="text-left text-xs font-semibold text-muted-foreground pb-3 pr-6">Engagement</th>
                <th className="text-left text-xs font-semibold text-muted-foreground pb-3 pr-6">Posts</th>
                <th className="text-left text-xs font-semibold text-muted-foreground pb-3">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {platformStats.map((p) => (
                <tr key={p.name}>
                  <td className="py-3.5 pr-6 font-semibold text-foreground text-sm">{p.name}</td>
                  <td className="py-3.5 pr-6 text-foreground">{p.reach}</td>
                  <td className="py-3.5 pr-6 text-foreground">{p.engagement}</td>
                  <td className="py-3.5 pr-6 text-muted-foreground">{p.posts}</td>
                  <td className="py-3.5">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-xs font-semibold",
                      p.trend === "up" ? "text-green-600 dark:text-green-400" : "text-rose-500"
                    )}>
                      {p.trend === "up" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {p.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Posts */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Top Performing Posts</h2>
        </div>
        <div className="space-y-3">
          {topPosts.map((post, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                #{i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{post.platform} · {post.reach} reach</p>
              </div>
              <div className="hidden sm:flex items-center gap-5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-rose-500" /> {post.likes.toLocaleString()}</span>
                <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-blue-500" /> {post.comments.toLocaleString()}</span>
                <span className="flex items-center gap-1"><Share2 className="w-3.5 h-3.5 text-green-500" /> {post.shares.toLocaleString()}</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Audience Insights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Primary Age Group", value: "25–34", sub: "42% of audience", icon: Users, color: "text-primary", bg: "bg-primary/10" },
          { label: "Top Location", value: "KSA / UAE", sub: "68% of reach", icon: Target, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950" },
          { label: "Best Format", value: "Carousel", sub: "3.2× higher engagement", icon: BarChart3, color: "text-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-card-border bg-card p-5 flex items-center gap-4">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", item.bg)}>
                <Icon className={cn("w-5 h-5", item.color)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                <p className="text-base font-bold text-foreground">{item.value}</p>
                <p className="text-[11px] text-muted-foreground/70">{item.sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
