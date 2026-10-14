'use client';

import React, { FC, FormEvent, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import {
  ADMIN_ROLES,
  AdminOrganization,
  AdminRole,
  AdminUser,
  useAdminRequest,
} from '@gitroom/frontend/components/admin/admin-users.api';
import {
  Field,
  FormError,
  inputClass,
  PASSWORD_RULE,
  PasswordInput,
  validPassword,
} from '@gitroom/frontend/components/admin/admin-create-user.form';

export const providerLabel = (providerName: string) => {
  switch (providerName) {
    case 'GOOGLE':
      return 'Google';
    case 'LOCAL':
      return 'Email';
    default:
      return providerName.charAt(0) + providerName.slice(1).toLowerCase();
  }
};

const chipClass =
  'inline-flex items-center gap-[6px] rounded-[12px] px-[8px] py-[2px] text-[12px] whitespace-nowrap';

export interface UserRowActions {
  changeRole: (user: AdminUser, organizationId: string, role: AdminRole) => void;
  toggleMembership: (user: AdminUser, organizationId: string) => void;
  toggleSuperAdmin: (user: AdminUser) => void;
  toggleActivated: (user: AdminUser) => void;
  setPassword: (user: AdminUser) => void;
  addMembership: (user: AdminUser) => void;
}

export const AdminUsersTable: FC<{
  users: AdminUser[];
  busy: boolean;
  actions: UserRowActions;
}> = ({ users, busy, actions }) => (
  <div className="border border-newTableBorder rounded-[8px] overflow-x-auto">
    <table className="w-full text-[13px]">
      <thead className="bg-newBgColorInner text-[12px] uppercase opacity-70 text-start">
        <tr className="border-b border-newTableBorder">
          {['Email', 'Name', 'Provider', 'Organizations', 'Status', 'Last online', 'Actions'].map(
            (title) => (
              <th key={title} className="px-[12px] py-[10px] text-start font-[500]">
                {title}
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr
            key={user.id}
            className="border-b border-newTableBorder last:border-b-0 align-top"
          >
            <td className="px-[12px] py-[10px] break-all">{user.email}</td>
            <td className="px-[12px] py-[10px]">{user.name || '—'}</td>
            <td className="px-[12px] py-[10px]">
              {providerLabel(user.providerName)}
            </td>
            <td className="px-[12px] py-[10px]">
              <div className="flex flex-wrap gap-[6px]">
                {user.memberships.length === 0 && (
                  <span className="opacity-60">None</span>
                )}
                {user.memberships.map((membership) => (
                  <span
                    key={membership.organizationId}
                    data-disabled={String(membership.disabled)}
                    className={clsx(
                      chipClass,
                      'bg-sixth',
                      membership.disabled && 'opacity-50 line-through'
                    )}
                  >
                    <span>{membership.organizationName}</span>
                    <select
                      aria-label={`Role of ${user.email} in ${membership.organizationName}`}
                      value={membership.role}
                      disabled={busy}
                      onChange={(e) =>
                        actions.changeRole(
                          user,
                          membership.organizationId,
                          e.target.value as AdminRole
                        )
                      }
                      className="bg-transparent text-[12px] outline-none"
                    >
                      {ADMIN_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      className="underline opacity-80 hover:opacity-100"
                      aria-label={`${membership.disabled ? 'Enable' : 'Disable'} membership in ${membership.organizationName}`}
                      onClick={() =>
                        actions.toggleMembership(user, membership.organizationId)
                      }
                    >
                      {membership.disabled ? 'enable' : 'disable'}
                    </button>
                  </span>
                ))}
              </div>
            </td>
            <td className="px-[12px] py-[10px]">
              <div className="flex flex-wrap gap-[6px]">
                {user.isSuperAdmin && (
                  <span className={clsx(chipClass, 'bg-purple-700 text-white')}>
                    Super-admin
                  </span>
                )}
                <span
                  className={clsx(
                    chipClass,
                    user.activated ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
                  )}
                >
                  {user.activated ? 'Active' : 'Inactive'}
                </span>
              </div>
            </td>
            <td className="px-[12px] py-[10px] whitespace-nowrap">
              {user.lastOnline
                ? new Date(user.lastOnline).toLocaleString()
                : 'Never'}
            </td>
            <td className="px-[12px] py-[10px]">
              <div className="flex flex-wrap gap-[6px] justify-end">
                <Button secondary disabled={busy} onClick={() => actions.setPassword(user)}>
                  Set password
                </Button>
                <Button secondary disabled={busy} onClick={() => actions.addMembership(user)}>
                  Add to organization
                </Button>
                <Button secondary disabled={busy} onClick={() => actions.toggleSuperAdmin(user)}>
                  {user.isSuperAdmin ? 'Revoke super-admin' : 'Make super-admin'}
                </Button>
                <Button secondary disabled={busy} onClick={() => actions.toggleActivated(user)}>
                  {user.activated ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const SetPasswordForm: FC<{
  user: AdminUser;
  onDone: () => void;
}> = ({ user, onDone }) => {
  const request = useAdminRequest();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validPassword(password)) {
      setError(PASSWORD_RULE);
      return;
    }
    setSaving(true);
    const failure = await request(`/admin/users/${user.id}/password`, 'PUT', {
      password,
    });
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[12px] text-textColor">
      <div className="text-[13px] opacity-70">
        New password for {user.email}. Only email/password accounts can have a
        password set.
      </div>
      <Field id="set-password" label="New password">
        <PasswordInput id="set-password" value={password} onChange={setPassword} />
      </Field>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Set password
        </Button>
      </div>
    </form>
  );
};

export const AddMembershipForm: FC<{
  user: AdminUser;
  organizations: AdminOrganization[];
  onDone: () => void;
}> = ({ user, organizations, onDone }) => {
  const request = useAdminRequest();
  const available = organizations.filter(
    (org) => !user.memberships.some((m) => m.organizationId === org.id)
  );
  const [organizationId, setOrganizationId] = useState(available[0]?.id || '');
  const [role, setRole] = useState<AdminRole>('USER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      setError('Choose an organization');
      return;
    }
    setSaving(true);
    const failure = await request(`/admin/users/${user.id}/memberships`, 'POST', {
      organizationId,
      role,
    });
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[12px] text-textColor">
      <div className="text-[13px] opacity-70">Add {user.email} to an organization.</div>
      {available.length === 0 ? (
        <div className="text-[13px]">This user already belongs to every organization.</div>
      ) : (
        <>
          <Field id="add-membership-org" label="Organization">
            <select
              id="add-membership-org"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className={inputClass}
            >
              {available.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="add-membership-role" label="Role">
            <select
              id="add-membership-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className={inputClass}
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={available.length === 0}>
          Add to organization
        </Button>
      </div>
    </form>
  );
};
