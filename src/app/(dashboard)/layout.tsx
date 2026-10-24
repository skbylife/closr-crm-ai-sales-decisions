'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { SidebarProvider } from "@/components/dashboard/sidebar-context";
import { HydrationProvider } from "@/components/hydration-provider";
import { ChatBubble } from "@/components/ai-assistant/chat-bubble";
import { PageTransition } from "@/components/dashboard/page-transition";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette } from "@/components/ui/command-palette";
import { ToastContainer } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TourProvider } from "@/components/onboarding/SpotlightTour";
import { useAuth } from "@/lib/auth-context";
import { EnglishLocaleIntegrityGuard } from "@/components/i18n/english-locale-integrity-guard";
import { LanguageChoiceModal } from "@/components/i18n/language-choice-modal";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isDemo, isLoading, needsOnboarding } = useAuth();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);

  /* 全局快捷键: Cmd+K (Mac) / Ctrl+K (Windows) 打开命令面板 */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closeCmdPalette = useCallback(() => setCmdOpen(false), []);

  useEffect(() => {
    if (!isLoading && !user && !isDemo) {
      router.push('/login');
    }
    // 未完成 onboarding 的用户重定向到引导页
    if (!isLoading && user && !isDemo && needsOnboarding) {
      router.push('/onboarding');
    }
  }, [user, isDemo, isLoading, needsOnboarding, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated and not demo — will redirect
  if (!user && !isDemo) {
    return null;
  }

  // Needs onboarding — will redirect, don't render dashboard (prevents 403 API calls)
  if (needsOnboarding && !isDemo) {
    return null;
  }

  return (
    <HydrationProvider>
      <TourProvider>
      <SidebarProvider>
        <div className="flex h-dvh overflow-hidden bg-background">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-7"><ErrorBoundary><PageTransition>{children}</PageTransition></ErrorBoundary></main>
          </div>
        </div>
      </SidebarProvider>
      <ChatBubble />
      <EnglishLocaleIntegrityGuard />
      <LanguageChoiceModal />
      <CommandPalette open={cmdOpen} onClose={closeCmdPalette} />
      <ToastContainer />
      <ConfirmDialog />
      </TourProvider>
    </HydrationProvider>
  );
}
