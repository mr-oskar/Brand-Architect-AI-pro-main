import { lazy, Suspense } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import Layout from "@/components/Layout";
import { AuthProvider, useAuth, getAuthToken } from "@/contexts/AuthContext";
import { SiteSettingsProvider, useSiteSettings } from "@/contexts/SiteSettingsContext";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Wrench } from "lucide-react";

setAuthTokenGetter(() => getAuthToken());

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const BrandWizard = lazy(() => import("@/pages/BrandWizard"));
const BrandKit = lazy(() => import("@/pages/BrandKit"));
const BrandEdit = lazy(() => import("@/pages/BrandEdit"));
const BrandDesignStudio = lazy(() => import("@/pages/BrandDesignStudio"));
const BrandBook = lazy(() => import("@/pages/BrandBook"));
const CampaignList = lazy(() => import("@/pages/CampaignList"));
const CampaignBriefPage = lazy(() => import("@/pages/CampaignBriefPage"));
const CampaignWorkspace = lazy(() => import("@/pages/CampaignWorkspace"));
const ContentCalendar = lazy(() => import("@/pages/ContentCalendar"));
const Assets = lazy(() => import("@/pages/Assets"));
const Templates = lazy(() => import("@/pages/Templates"));
const Admin = lazy(() => import("@/pages/Admin"));
const NodesEditor = lazy(() => import("@/pages/NodesEditor"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const SignIn = lazy(() => import("@/pages/SignIn"));
const SignUp = lazy(() => import("@/pages/SignUp"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 15,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0a14]">
      <Loader2 className="w-7 h-7 text-violet-400 animate-spin" />
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user) {
    return (
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Dashboard />
        </Suspense>
      </Layout>
    );
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <LandingPage />
    </Suspense>
  );
}

function ProtectedAppShell() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/brands/:id/design" component={BrandDesignStudio} />
        <Route path="/brands/:id/book" component={BrandBook} />
        <Route path="/nodes" component={NodesEditor} />
        <Route>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/brands/new" component={BrandWizard} />
                <Route path="/brands/:id/edit" component={BrandEdit} />
                <Route path="/brands/:id/campaigns/new" component={CampaignBriefPage} />
                <Route path="/brands/:id/campaigns" component={CampaignList} />
                <Route path="/brands/:id" component={BrandKit} />
                <Route path="/campaigns/:id" component={CampaignWorkspace} />
                <Route path="/calendar" component={ContentCalendar} />
                <Route path="/assets" component={Assets} />
                <Route path="/templates" component={Templates} />
                <Route path="/admin" component={Admin} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Layout>
        </Route>
      </Switch>
    </Suspense>
  );
}

function MaintenanceScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center bg-card border border-border rounded-2xl p-8 shadow-lg">
        <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
          <Wrench className="w-7 h-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold mb-2">Maintenance in progress</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{message || "We'll be back shortly."}</p>
      </div>
    </div>
  );
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();
  const { settings } = useSiteSettings();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Redirect to="/sign-in" />;
  // Maintenance gate: block non-admins when enabled.
  if (settings.maintenance?.enabled && user.role !== "admin") {
    return <MaintenanceScreen message={settings.maintenance.message} />;
  }
  return <ProtectedAppShell />;
}

function RouterContent() {
  const { isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  return (
    <>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in" component={SignIn} />
        <Route path="/sign-up" component={SignUp} />
        <Route component={ProtectedRoutes} />
      </Switch>
      <Toaster />
    </>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SiteSettingsProvider>
            <TooltipProvider>
              <RouterContent />
            </TooltipProvider>
          </SiteSettingsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
