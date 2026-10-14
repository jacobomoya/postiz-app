import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { AdminUsersComponent } from './admin-users.component';

const mockFetch = jest.fn();
const mockUser = { current: { id: 'me', isSuperAdmin: true } as any };
const mockConfirm = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({ useUser: () => mockUser.current }));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({ useModals: () => ({ openModal: jest.fn(), closeAll: jest.fn() }) }));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({ LoadingComponent: () => <div>Loading</div> }));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children, secondary, loading, innerClassName, ...props }: any) => <button type="button" {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@gitroom/react/toaster/toaster', () => ({ useToaster: () => ({ show: jest.fn() }) }), { virtual: true });
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({ deleteDialog: (...args: unknown[]) => mockConfirm(...args) }), { virtual: true });

const json = (body: unknown, status = 200) => ({
  ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body),
});

const users = {
  items: [
    {
      id: 'u1', email: 'ana@solucionia.ai', name: 'Ana', providerName: 'GOOGLE', activated: true,
      isSuperAdmin: true, lastOnline: '2026-10-10T10:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
      memberships: [
        { organizationId: 'o1', organizationName: 'Solucionia', role: 'SUPERADMIN', disabled: false },
        { organizationId: 'o2', organizationName: 'Laica', role: 'USER', disabled: true },
      ],
    },
    {
      id: 'u2', email: 'bob@laica.io', name: null, providerName: 'LOCAL', activated: false,
      isSuperAdmin: false, lastOnline: null, createdAt: '2026-02-01T00:00:00.000Z', memberships: [],
    },
  ],
  total: 21, page: 0, pageSize: 20, hasMore: true,
};

const routes = (overrides: Record<string, () => unknown> = {}) =>
  mockFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
    const key = `${options?.method || 'GET'} ${path.split('?')[0]}`;
    if (overrides[key]) return overrides[key]();
    if (key === 'GET /admin/users') return json(users);
    if (key === 'GET /admin/organizations') return json([{ id: 'o1', name: 'Solucionia' }, { id: 'o2', name: 'Laica' }]);
    if (key === 'GET /admin/settings/registration') return json({ allowedEmailDomains: [], defaultOrganizationId: null });
    return json({ success: true });
  });

const renderPage = () => render(
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <AdminUsersComponent />
  </SWRConfig>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.current = { id: 'me', isSuperAdmin: true };
  mockConfirm.mockResolvedValue(true);
  routes();
});

test('renders users with provider, membership chips, badges and state', async () => {
  renderPage();
  const ana = await screen.findByRole('row', { name: /ana@solucionia\.ai/ });
  expect(within(ana).getByText('Ana')).toBeTruthy();
  expect(within(ana).getByText('Google')).toBeTruthy();
  expect(within(ana).getByText('Super-admin')).toBeTruthy();
  expect(within(ana).getByText('Active')).toBeTruthy();
  expect(within(ana).getByText('Solucionia')).toBeTruthy();
  expect(within(ana).getByText(/Laica/).closest('[data-disabled]')?.getAttribute('data-disabled')).toBe('true');
  const bob = screen.getByRole('row', { name: /bob@laica\.io/ });
  expect(within(bob).getByText('Email')).toBeTruthy();
  expect(within(bob).getByText('Inactive')).toBeTruthy();
  expect(within(bob).getByText('Never')).toBeTruthy();
  expect(screen.getByText('21 users')).toBeTruthy();
});

test('debounces the search and resets to the first page', async () => {
  jest.useFakeTimers();
  try {
    renderPage();
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'ana' } });
    expect(mockFetch.mock.calls.some(([p]) => String(p).includes('search=ana'))).toBe(false);
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(mockFetch.mock.calls.some(([p]) => String(p) === '/admin/users?page=0&pageSize=20&search=ana')).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

test('paginates with the 0-based page parameter', async () => {
  renderPage();
  await screen.findByRole('row', { name: /ana@solucionia\.ai/ });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/admin/users?page=1&pageSize=20'));
});

test('changes a membership role through the API', async () => {
  renderPage();
  await screen.findByRole('row', { name: /ana@solucionia\.ai/ });
  fireEvent.change(screen.getByRole('combobox', { name: 'Role of ana@solucionia.ai in Laica' }), { target: { value: 'ADMIN' } });
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/admin/users/u1/memberships/o2', { method: 'PUT', body: JSON.stringify({ role: 'ADMIN' }) }));
});

test('shows the backend reason when the last super-admin is protected', async () => {
  routes({ 'PUT /admin/users/u1': () => json({ statusCode: 400, message: 'Cannot remove the last super-admin' }, 400) });
  renderPage();
  const ana = await screen.findByRole('row', { name: /ana@solucionia\.ai/ });
  fireEvent.click(within(ana).getByRole('button', { name: 'Revoke super-admin' }));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Cannot remove the last super-admin');
  expect(mockFetch).toHaveBeenCalledWith('/admin/users/u1', { method: 'PUT', body: JSON.stringify({ isSuperAdmin: false }) });
});

test('does not call the API when the confirmation is declined', async () => {
  mockConfirm.mockResolvedValue(false);
  renderPage();
  const bob = await screen.findByRole('row', { name: /bob@laica\.io/ });
  fireEvent.click(within(bob).getByRole('button', { name: 'Activate' }));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
  expect(mockFetch.mock.calls.some(([p]) => p === '/admin/users/u2')).toBe(false);
});

test('blocks non super-admins', () => {
  mockUser.current = { id: 'me', isSuperAdmin: false };
  renderPage();
  expect(screen.getByText('You do not have access to this page.')).toBeTruthy();
  expect(mockFetch).not.toHaveBeenCalled();
});
