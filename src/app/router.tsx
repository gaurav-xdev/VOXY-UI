import { createBrowserRouter, type RouteObject } from "react-router";
import SiteLayout from "./SiteLayout";
import { RouteErrorPage } from "./ErrorPage";
import { Skeleton } from "@/ui/primitives";

/** Code-split by route. The landing page is the only eagerly bundled page. */
const page = (load: () => Promise<{ default: React.ComponentType }>) => ({ lazy: async () => ({ Component: (await load()).default }) });

export function PageFallback() {
  return (
    <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center gap-4 px-6" role="status" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    element: <SiteLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageFallback />,
    children: [
      { index: true, ...page(() => import("@/pages/Home")) },
      { path: "login", ...page(() => import("@/pages/Login")) },
      { path: "register", ...page(() => import("@/pages/Register")) },
      { path: "verify-email", ...page(() => import("@/pages/VerifyEmail")) },
      { path: "forgot-password", ...page(() => import("@/pages/ForgotPassword")) },
      { path: "reset-password", ...page(() => import("@/pages/ResetPassword")) },
      { path: "account", ...page(() => import("@/pages/account/Account")) },
      { path: "terms", ...page(() => import("@/pages/legal/Terms")) },
      { path: "privacy", ...page(() => import("@/pages/legal/Privacy")) },
      { path: "refunds", ...page(() => import("@/pages/legal/Refunds")) },
      { path: "contact", ...page(() => import("@/pages/legal/Contact")) },
      { path: "privacy-preferences", ...page(() => import("@/pages/legal/PrivacyPreferences")) },
      { path: "*", handle: { noApi: true }, ...page(() => import("@/pages/NotFound")) },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
