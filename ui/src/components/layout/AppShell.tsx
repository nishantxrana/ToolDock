import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';

/** Main layout: sidebar rail (brand, tools, connection) + content panel. */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  // Each tool starts at the top, and the mobile drawer closes on navigation.
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-full overflow-hidden bg-sidebar">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-popover px-3 py-2 text-sm shadow-raised focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-[hsl(var(--overlay-scrim))] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <Header onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 overflow-y-auto scrollbar-thin outline-none"
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
