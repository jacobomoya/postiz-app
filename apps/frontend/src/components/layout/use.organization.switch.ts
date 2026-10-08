'use client';

import { useCallback, useContext } from 'react';
import { useSWRConfig } from 'swr';
import * as Sentry from '@sentry/nextjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { OrganizationUserMutate } from './organization.cache';
import { useModals } from './new-modal';
import { useLaunchStore } from '../new-launch/store';

export const useOrganizationSwitch = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const userMutate = useContext(OrganizationUserMutate) || mutate;
  const { closeAll } = useModals();

  return useCallback(async (id: string) => {
    let stage = 'change-org-request';
    let reconcile = false;
    try {
      const response = await fetch('/user/change-org', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error('Organization switch failed');
      // The cookie has already changed; failures from here must reconcile forward.
      reconcile = true;
      stage = 'malformed-response';
      const selected = await response.json();
      if (typeof selected?.id !== 'string' || !selected.id) {
        throw new Error('Invalid organization switch response');
      }
      stage = 'org-mismatch';
      if (selected.id !== id) throw new Error('Organization switch mismatch');

      stage = 'user-refresh';
      await userMutate('/user/self', async () => {
        const response = await fetch('/user/self');
        if (!response.ok) throw new Error('Could not refresh organization');
        const user = await response.json();
        if (user?.orgId !== selected.id) {
          stage = 'org-mismatch';
          throw new Error('Organization refresh mismatch');
        }
        return user;
      }, { revalidate: false });
      closeAll();
      useLaunchStore.getState().reset();
      // OrganizationCache refreshes the list in the newly mounted provider.
    } catch (error) {
      Sentry.captureException(error, { tags: { stage, operation: 'organization-switch' } });
      if (reconcile) window.location.reload();
      throw error;
    }
  }, [fetch, userMutate, mutate, closeAll]);
};
