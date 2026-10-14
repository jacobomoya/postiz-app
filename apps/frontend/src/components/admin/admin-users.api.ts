'use client';

import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type AdminRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

export const ADMIN_ROLES: AdminRole[] = ['USER', 'ADMIN', 'SUPERADMIN'];

export interface AdminMembership {
  organizationId: string;
  organizationName: string;
  role: AdminRole;
  disabled: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  providerName: string;
  activated: boolean;
  isSuperAdmin: boolean;
  lastOnline: string | null;
  createdAt: string;
  memberships: AdminMembership[];
}

export interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AdminOrganization {
  id: string;
  name: string;
}

export interface RegistrationSettings {
  allowedEmailDomains: string[];
  defaultOrganizationId: string | null;
}

export const USERS_PAGE_SIZE = 20;

export const usersListKey = (search: string, page: number) => {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(USERS_PAGE_SIZE),
    ...(search ? { search } : {}),
  });
  return `/admin/users?${query.toString()}`;
};

// Nest returns `{ message }` (a string or a list of validation messages) for
// HttpExceptions; fall back to the raw text for plain `send(...)` responses.
export const readApiError = async (response: Response) => {
  const fallback = `Request failed (${response.status})`;
  let text = '';
  try {
    text = await response.text();
  } catch {
    return fallback;
  }
  try {
    const body = JSON.parse(text);
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message;
    return message || fallback;
  } catch {
    return text || fallback;
  }
};

// Lower-cases, strips a leading "@" and whitespace, and drops duplicates.
export const normalizeDomain = (value: string) =>
  value.trim().toLowerCase().replace(/^@+/, '');

export const normalizeDomains = (values: string[]) =>
  Array.from(new Set(values.map(normalizeDomain).filter(Boolean)));

const useJson = <T>(key: string | null) => {
  const fetch = useFetch();
  return useSWR<T>(key, async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(await readApiError(res));
    }
    return res.json();
  });
};

export const useAdminUsers = (search: string, page: number, enabled = true) =>
  useJson<AdminUsersResponse>(enabled ? usersListKey(search, page) : null);

export const useAdminOrganizations = (enabled = true) =>
  useJson<AdminOrganization[]>(enabled ? '/admin/organizations' : null);

export const useRegistrationSettings = () =>
  useJson<RegistrationSettings>('/admin/settings/registration');

// Sends a JSON request and resolves to an error message, or null on success.
export const useAdminRequest = () => {
  const fetch = useFetch();
  return async (
    path: string,
    method: 'POST' | 'PUT',
    body: unknown
  ): Promise<string | null> => {
    try {
      const res = await fetch(path, { method, body: JSON.stringify(body) });
      return res.ok ? null : await readApiError(res);
    } catch (e) {
      return e instanceof Error ? e.message : 'Network error';
    }
  };
};
