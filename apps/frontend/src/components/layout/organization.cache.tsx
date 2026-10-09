'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect } from 'react';
import { Cache, SWRConfig, useSWRConfig } from 'swr';

// /user/self belongs to the application cache, not the disposable org cache.
export const OrganizationUserMutate = createContext<ReturnType<typeof useSWRConfig>['mutate'] | undefined>(undefined);

export const useRootUserMutate = () => {
  const rootMutate = useContext(OrganizationUserMutate);
  const { mutate } = useSWRConfig();
  const mutateUser = rootMutate || mutate;
  return useCallback(() => mutateUser('/user/self'), [mutateUser]);
};

const RefreshOrganizations = (): null => {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    // Use the newly mounted cache, never the discarded provider's mutate.
    void mutate('/user/organizations');
  }, [mutate]);
  return null;
};

export const OrganizationCache = ({ children }: { children: ReactNode }) => {
  const { mutate } = useSWRConfig();
  return (
    <OrganizationUserMutate.Provider value={mutate}>
      <SWRConfig value={{ provider: (): Cache => new Map() as Cache }}>
        {children}
        <RefreshOrganizations />
      </SWRConfig>
    </OrganizationUserMutate.Provider>
  );
};
