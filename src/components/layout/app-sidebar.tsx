"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  Settings,
  Moon,
  Sun,
  Sparkles,
  LogOut,
  MessagesSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/quizzes", label: "שאלונים", icon: ListChecks },
  { href: "/inbox", label: "מרכז שיחות", icon: MessagesSquare },
  { href: "/leads", label: "לידים", icon: Users },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [userLabel, setUserLabel] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("quizflow-theme");
    const isDark = stored === "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- theme preference only exists in localStorage, unreadable during SSR
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);

    // getSession() reads the already-verified JWT locally — the proxy
    // (src/proxy.ts) already revalidated it server-side with getUser()
    // before this dashboard page rendered at all, so doing that again here
    // just for a display name/email would be a redundant network round trip.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      const name = (user.user_metadata?.full_name as string | undefined) || user.email || "";
      setUserLabel({ name, email: user.email ?? "" });
    });
  }, []);

  function toggleDark(value: boolean) {
    setDark(value);
    document.documentElement.classList.toggle("dark", value);
    localStorage.setItem("quizflow-theme", value ? "dark" : "light");
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = userLabel?.name ? userLabel.name.slice(0, 2) : "..";

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between bg-sidebar text-sidebar-foreground border-s border-sidebar-border h-screen sticky top-0">
      <div>
        <Link href="/" className="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <span className="font-bold text-lg tracking-tight">QuizFlow</span>
        </Link>
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-3 border-t border-sidebar-border space-y-3">
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80">
          <span className="flex items-center gap-2">
            {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            מצב כהה
          </span>
          <Switch checked={dark} onCheckedChange={toggleDark} />
        </div>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{userLabel?.name ?? "..."}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{userLabel?.email ?? ""}</p>
          </div>
          <Button variant="ghost" size="icon" className="size-7 shrink-0 text-sidebar-foreground/70" onClick={handleSignOut} title="התנתקות">
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
