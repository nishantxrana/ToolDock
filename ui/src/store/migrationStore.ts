import { create } from 'zustand';
import type { Project } from '@/types/ado';

/**
 * Migrate-mode connections: a source (Azure DevOps or Jira) and a target
 * (Azure DevOps). Kept in memory only, completely separate from the Tools-mode
 * session so the two can never be mixed up. A connection can optionally be
 * locked into the encrypted vault for 30 minutes (see lib/utils/patVault.ts);
 * `lockedAt` tracks that.
 */

export type Side = 'source' | 'target';

/** What the API layer needs to call Azure DevOps for one side. */
export interface AdoCredential {
  organization: string;
  pat: string;
}

/** What the API layer needs to call Jira Cloud. */
export interface JiraCredential {
  site: string;
  email: string;
  token: string;
}

export interface AdoConnection extends AdoCredential {
  kind: 'ado';
  projects: Project[];
  project: Project | null;
  lockedAt: number | null;
  /** Filled back in from the vault after a refresh. */
  restored?: boolean;
}

export interface JiraConnection extends JiraCredential {
  kind: 'jira';
  displayName?: string;
  lockedAt: number | null;
  restored?: boolean;
}

export type SourceConnection = AdoConnection | JiraConnection;

interface MigrationState {
  source: SourceConnection | null;
  target: AdoConnection | null;
  /** True while a migration run is writing; used by the lock alerts. */
  running: boolean;

  setSource: (conn: SourceConnection | null) => void;
  setTarget: (conn: AdoConnection | null) => void;
  setProject: (side: Side, project: Project | null) => void;
  setLockedAt: (side: Side, lockedAt: number | null) => void;
  setRunning: (running: boolean) => void;
  clear: (side: Side) => void;
  clearAll: () => void;
}

export const useMigrationStore = create<MigrationState>((set) => ({
  source: null,
  target: null,
  running: false,

  setSource: (source) => set({ source }),
  setTarget: (target) => set({ target }),
  setProject: (side, project) =>
    set((s) => {
      const conn = s[side];
      if (!conn || conn.kind !== 'ado') return {};
      return { [side]: { ...conn, project } } as Partial<MigrationState>;
    }),
  setLockedAt: (side, lockedAt) =>
    set((s) => {
      const conn = s[side];
      if (!conn) return {};
      return { [side]: { ...conn, lockedAt } } as Partial<MigrationState>;
    }),
  setRunning: (running) => set({ running }),
  clear: (side) => set({ [side]: null } as Partial<MigrationState>),
  clearAll: () => set({ source: null, target: null, running: false }),
}));

/** The credential for an Azure DevOps side, or null if not connected. */
export function adoCredential(conn: SourceConnection | null): AdoCredential | null {
  return conn && conn.kind === 'ado' ? { organization: conn.organization, pat: conn.pat } : null;
}

/** Last four characters of a token, for display only. */
export function tokenTail(token: string): string {
  return token.length > 4 ? `…${token.slice(-4)}` : '…';
}
