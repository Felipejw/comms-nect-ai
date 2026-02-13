import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { usePresence } from "@/hooks/usePresence";

export function AppLayout() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { getSetting } = useSystemSettings();
  const { theme, setTheme } = useTheme();
  usePresence();
  
  const platformName = getSetting("platform_name") || "TalkFlow";

  if (isMobile) {
    return (
      <div className="flex min-h-screen w-full bg-background flex-col">
        {/* Mobile Header */}
        <header className="h-14 border-b flex items-center px-4 gap-3 bg-sidebar text-sidebar-foreground shrink-0">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-sidebar-foreground">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 border-r-0">
              <AppSidebar onNavigate={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold flex-1">{platformName}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-sidebar-muted hover:text-sidebar-foreground h-8 w-8 p-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>
        
        <main className="flex-1 overflow-auto p-4 animate-fade-in">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
