import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { WorkspaceProvider } from "@/components/layout/workspace-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <Toaster richColors position="top-center" />
    </WorkspaceProvider>
  );
}
