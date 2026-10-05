import React, { type ReactNode } from 'react';
import { Cpu, Sparkles, Layers, User, Clock, Server } from 'lucide-react';
import { navigateTo, type RouteId } from './useHashRoute';
import type { ServerInfo } from './serverInfo';

const NAV: { id: RouteId; label: string; icon: ReactNode }[] = [
  { id: 'generate', label: 'Generate', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'batch', label: 'Batch', icon: <Layers className="w-4 h-4" /> },
  { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  { id: 'history', label: 'History', icon: <Clock className="w-4 h-4" /> },
  { id: 'providers', label: 'Providers', icon: <Server className="w-4 h-4" /> },
];

interface AppShellProps {
  activeRoute: RouteId;
  children: ReactNode;
  historyCount: number;
  profileConfigured: boolean;
  serverStatus: 'connected' | 'checking' | 'error';
  /** Which dev server answered, so a restored tab is never ambiguous. */
  serverInfo: ServerInfo | null;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeRoute,
  children,
  historyCount,
  profileConfigured,
  serverStatus,
  serverInfo,
}) => {
  return (
    <div className="h-dvh overflow-hidden bg-zinc-950 text-zinc-100 flex font-sans antialiased selection:bg-zinc-800">
      <nav className="h-full w-52 shrink-0 border-r border-zinc-900 bg-zinc-950 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-zinc-900 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-zinc-300" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Fisio Architect</div>
            <div className="text-[10px] text-zinc-500 font-mono">v2.0</div>
          </div>
        </div>

        <div className="flex-1 p-2 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeRoute === item.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <span className={activeRoute === item.id ? 'text-zinc-100' : 'text-zinc-500'}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.id === 'history' && historyCount > 0 && (
                <span className="ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                  {historyCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-zinc-900 space-y-2">
          {!profileConfigured && (
            <button
              onClick={() => navigateTo('profile')}
              className="w-full text-left text-[10px] font-mono text-amber-400 border border-amber-900 bg-amber-950/40 rounded px-2 py-1.5 hover:bg-amber-950/70"
            >
              Profile not configured — content will use fallback defaults
            </button>
          )}
          <div
            className={`text-[10px] font-mono ${
              serverStatus === 'connected'
                ? 'text-emerald-500'
                : serverStatus === 'error'
                  ? 'text-rose-400'
                  : 'text-zinc-500'
            }`}
          >
            {serverStatus === 'connected' ? 'server connected' : serverStatus}
          </div>
          {serverStatus === 'connected' && serverInfo?.port ? (
            <div
              className="text-[10px] font-mono text-zinc-500"
              title="Port and instance of the dev server answering this tab. If another app owns a port, this tells you which one you are looking at."
            >
              :{serverInfo.port} · {serverInfo.instance ?? '—'}
            </div>
          ) : null}
        </div>
      </nav>

      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
    </div>
  );
};
