import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { api } from '../lib/api';
import { clearResources } from '../lib/resource';
import { useLocalStorage } from '../lib/hooks';
import { orgIdOf, type Org, type Selection } from '../types';

interface AppStateValue {
  org: Org;
  orgId: string;
  orgs: Org[];
  selectOrg: (org: Org) => Promise<void>;
  selections: Selection[];
  setSelections: (selections: Selection[]) => void;
  selectedCount: number;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({
  org,
  orgs,
  onOrgChange,
  children,
}: {
  org: Org;
  orgs: Org[];
  onOrgChange: (org: Org) => void;
  children: ReactNode;
}) {
  const [selections, setSelections] = useLocalStorage<Selection[]>('sf-selections', []);

  const selectOrg = useCallback(
    async (next: Org) => {
      const id = orgIdOf(next);
      onOrgChange(next);
      localStorage.setItem('sf-org', id);
      // Everything cached is org-scoped, so none of it is valid for the new target.
      clearResources('org:');
      await api('/orgs/select', { method: 'POST', body: JSON.stringify({ org: id }) });
    },
    [onOrgChange],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      org,
      orgId: orgIdOf(org),
      orgs,
      selectOrg,
      selections,
      setSelections,
      selectedCount: selections.reduce((total, selection) => total + selection.members.length, 0),
    }),
    [org, orgs, selectOrg, selections, setSelections],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside AppStateProvider');
  return context;
}

/** Cache keys are prefixed with the org so switching orgs can drop them all at once. */
export function orgKey(orgId: string, ...parts: (string | number | boolean)[]) {
  return ['org', orgId, ...parts].join(':');
}
