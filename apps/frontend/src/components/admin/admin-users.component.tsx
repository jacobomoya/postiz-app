'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import {
  AdminRole,
  AdminUser,
  USERS_PAGE_SIZE,
  useAdminOrganizations,
  useAdminRequest,
  useAdminUsers,
} from '@gitroom/frontend/components/admin/admin-users.api';
import {
  AddMembershipForm,
  AdminUsersTable,
  SetPasswordForm,
} from '@gitroom/frontend/components/admin/admin-users.table';
import {
  AdminCreateUserForm,
  FormError,
  inputClass,
} from '@gitroom/frontend/components/admin/admin-create-user.form';
import { AdminRegistrationSettings } from '@gitroom/frontend/components/admin/admin-registration-settings';

const SEARCH_DEBOUNCE_MS = 300;

const useDebounced = (value: string, delay: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

export const AdminUsersComponent: FC = () => {
  const user = useUser();
  const allowed = !!user?.isSuperAdmin;
  const modal = useModals();
  const toaster = useToaster();
  const request = useAdminRequest();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim(), SEARCH_DEBOUNCE_MS);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setPage(0), [search]);

  const { data, isLoading, error, mutate } = useAdminUsers(search, page, allowed);
  const { data: organizations } = useAdminOrganizations(allowed);

  const run = useCallback(
    async (
      path: string,
      method: 'POST' | 'PUT',
      body: unknown,
      success: string
    ) => {
      setBusy(true);
      setActionError(null);
      const failure = await request(path, method, body);
      setBusy(false);
      if (failure) {
        setActionError(failure);
        return;
      }
      toaster.show(success, 'success');
      await mutate();
    },
    [request, toaster, mutate]
  );

  const openForm = useCallback(
    (title: string, render: (close: () => void) => React.ReactNode) =>
      modal.openModal({ title, children: render }),
    [modal]
  );

  const actions = {
    changeRole: (target: AdminUser, organizationId: string, role: AdminRole) =>
      run(
        `/admin/users/${target.id}/memberships/${organizationId}`,
        'PUT',
        { role },
        'Role updated'
      ),
    toggleMembership: (target: AdminUser, organizationId: string) => {
      const membership = target.memberships.find(
        (m) => m.organizationId === organizationId
      );
      if (!membership) return;
      return run(
        `/admin/users/${target.id}/memberships/${organizationId}`,
        'PUT',
        { disabled: !membership.disabled },
        membership.disabled ? 'Membership enabled' : 'Membership disabled'
      );
    },
    toggleSuperAdmin: async (target: AdminUser) => {
      const grant = !target.isSuperAdmin;
      const confirmed = await deleteDialog(
        grant
          ? `Give ${target.email} instance super-admin access?`
          : `Remove super-admin access from ${target.email}?`,
        grant ? 'Yes, grant it' : 'Yes, revoke it',
        undefined,
        'Cancel',
        !grant
      );
      if (!confirmed) return;
      return run(
        `/admin/users/${target.id}`,
        'PUT',
        { isSuperAdmin: grant },
        grant ? 'Super-admin granted' : 'Super-admin revoked'
      );
    },
    toggleActivated: async (target: AdminUser) => {
      const activate = !target.activated;
      const confirmed = await deleteDialog(
        activate
          ? `Reactivate ${target.email}? They will be able to log in again.`
          : `Deactivate ${target.email}? They will not be able to log in.`,
        activate ? 'Yes, activate' : 'Yes, deactivate',
        undefined,
        'Cancel',
        !activate
      );
      if (!confirmed) return;
      return run(
        `/admin/users/${target.id}`,
        'PUT',
        { activated: activate },
        activate ? 'User activated' : 'User deactivated'
      );
    },
    setPassword: (target: AdminUser) =>
      openForm('Set password', (close) => (
        <SetPasswordForm
          user={target}
          onDone={() => {
            close();
            toaster.show('Password updated', 'success');
          }}
        />
      )),
    addMembership: (target: AdminUser) =>
      openForm('Add to organization', (close) => (
        <AddMembershipForm
          user={target}
          organizations={organizations || []}
          onDone={() => {
            close();
            toaster.show('Membership added', 'success');
            mutate();
          }}
        />
      )),
  };

  const openCreate = () =>
    openForm('Create user', (close) => (
      <AdminCreateUserForm
        organizations={organizations || []}
        onCreated={() => {
          close();
          toaster.show('User created', 'success');
          mutate();
        }}
      />
    ));

  if (!allowed) {
    return (
      <div className="text-textColor p-[20px]">
        You do not have access to this page.
      </div>
    );
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / USERS_PAGE_SIZE))
    : 1;

  return (
    <div className="flex flex-col gap-[16px] text-textColor">
      <div className="flex items-center justify-between gap-[12px]">
        <div className="text-[20px] font-[600]">Users</div>
        <div className="flex items-center gap-[12px]">
          <div className="text-[13px] opacity-70">
            {data ? `${data.total} users` : ''}
          </div>
          <Button onClick={openCreate} disabled={!organizations}>
            Create user
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-[12px] items-end bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px]">
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search by email or name"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`${inputClass} min-w-[280px]`}
        />
      </div>

      <FormError message={actionError} />

      {isLoading ? (
        <LoadingComponent />
      ) : error ? (
        <div className="text-red-400">Failed to load users.</div>
      ) : !data || data.items.length === 0 ? (
        <div className="opacity-70">No users found.</div>
      ) : (
        <AdminUsersTable users={data.items} busy={busy} actions={actions} />
      )}

      <div className="flex items-center justify-between">
        <div className="text-[13px] opacity-70">
          Page {page + 1} of {totalPages}
        </div>
        <div className="flex gap-[8px]">
          <Button
            secondary
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            disabled={!data?.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <AdminRegistrationSettings />
    </div>
  );
};
