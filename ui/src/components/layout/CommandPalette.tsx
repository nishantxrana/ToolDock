import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Home, LogOut, Monitor, Moon, PlugZap, Search, Sun } from 'lucide-react';
import { TOOLS, toolsByGroup } from '@/features/tools/registry';
import { useSessionStore } from '@/store/sessionStore';
import { useTheme } from '@/lib/utils/theme';
import { unlockPat } from '@/lib/utils/patVault';

import { registerCommandPalette } from '@/lib/commandPalette';

const itemClass =
  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0';
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground';

/** Ctrl/Cmd+K: jump to any tool, connect or disconnect, switch theme. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isConnected = useSessionStore((s) => s.isConnected);
  const disconnect = useSessionStore((s) => s.disconnect);
  const { setPreference } = useTheme();

  useEffect(() => {
    registerCommandPalette(() => setOpen(true));
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      registerCommandPalette(null);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(var(--overlay-scrim))] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
        >
          <DialogPrimitive.Title className="sr-only">
            Go to a tool or run a command
          </DialogPrimitive.Title>
          <Command
            loop
            // Every typed word must appear in the item, so "map" finds Mapping and nothing else.
            filter={(value, search) => {
              const v = value.toLowerCase();
              const terms = search.toLowerCase().split(/s+/).filter(Boolean);
              if (!terms.every((t) => v.includes(t))) return 0;
              return terms.some((t) => v.startsWith(t) || v.includes(` ${t}`)) ? 1 : 0.5;
            }}
          >
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Go to a tool or run a command"
                className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
              />
              <kbd>Esc</kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto scrollbar-thin p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
                Nothing matches. Try a tool name like “diff” or “export”.
              </Command.Empty>

              {toolsByGroup().map(({ group, tools }) => (
                <Command.Group key={group} heading={group} className={groupClass}>
                  {tools.map((t) => (
                    <Command.Item
                      key={t.id}
                      value={`${t.title} ${t.description}`}
                      onSelect={() => run(() => navigate(t.path))}
                      className={itemClass}
                    >
                      <t.icon className="text-muted-foreground" />
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.requiresConnection && !isConnected && (
                        <span className="text-xs text-muted-foreground">needs connection</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}

              <Command.Group heading="General" className={groupClass}>
                <Command.Item
                  value="home all tools"
                  onSelect={() => run(() => navigate('/'))}
                  className={itemClass}
                >
                  <Home className="text-muted-foreground" />
                  All tools
                </Command.Item>
                {isConnected ? (
                  <Command.Item
                    value="disconnect sign out clear token"
                    onSelect={() =>
                      run(async () => {
                        await unlockPat().catch(() => {});
                        disconnect();
                      })
                    }
                    className={itemClass}
                  >
                    <LogOut className="text-muted-foreground" />
                    Disconnect and clear the token
                  </Command.Item>
                ) : (
                  <Command.Item
                    value="connect azure devops sign in token"
                    onSelect={() => run(() => navigate('/connect'))}
                    className={itemClass}
                  >
                    <PlugZap className="text-muted-foreground" />
                    Connect to Azure DevOps
                  </Command.Item>
                )}
                <Command.Item
                  value="theme light"
                  onSelect={() => run(() => setPreference('light'))}
                  className={itemClass}
                >
                  <Sun className="text-muted-foreground" />
                  Use light theme
                </Command.Item>
                <Command.Item
                  value="theme dark"
                  onSelect={() => run(() => setPreference('dark'))}
                  className={itemClass}
                >
                  <Moon className="text-muted-foreground" />
                  Use dark theme
                </Command.Item>
                <Command.Item
                  value="theme system auto"
                  onSelect={() => run(() => setPreference('system'))}
                  className={itemClass}
                >
                  <Monitor className="text-muted-foreground" />
                  Match system theme
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <kbd>↑</kbd>
                <kbd>↓</kbd> to move
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd>Enter</kbd> to open
              </span>
              <span className="ml-auto">{TOOLS.length} tools</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
