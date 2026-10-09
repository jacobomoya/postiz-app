import React, { createContext, useContext } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import useSWR, { SWRConfig } from 'swr';
import { OrganizationCache } from './organization.cache';
import { OrganizationSelector } from './organization.selector';

const mockFetch = jest.fn();
const mockReport = jest.fn();
const mockUserContext = createContext<any>(undefined);
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('./user.context', () => ({ useUser: () => useContext(mockUserContext) }));
jest.mock('@sentry/nextjs', () => ({ captureException: (...args: any[]) => mockReport(...args) }));
jest.mock('./new-modal', () => ({ useModals: () => ({ closeAll: jest.fn() }) }));
jest.mock('../new-launch/store', () => ({ useLaunchStore: { getState: () => ({ reset: jest.fn() }) } }));

const load = async (path: string) => (await mockFetch(path)).json();
function ScopedContent() {
  const { data } = useSWR('/posts', load);
  const { data: checkout } = useSWR('/checkout', load, { revalidateIfStale: false });
  return <><div data-testid="posts">{data || 'Loading posts'}</div><div>{checkout}</div><OrganizationSelector /></>;
}
function App() {
  const { data: user } = useSWR('/user/self', load);
  return user ? <mockUserContext.Provider value={user}>
    <OrganizationCache key={user.orgId}><ScopedContent /></OrganizationCache>
  </mockUserContext.Provider> : null;
}

test('isolates late requests and keeps the selector and checkout functional across A to B to A', async () => {
  let org = 'a';
  let resolveOld!: (value: any) => void;
  const pendingOld = new Promise((resolve) => { resolveOld = resolve; });
  let firstPosts = true;
  mockFetch.mockImplementation(async (path, options) => {
    if (path === '/user/change-org') {
      org = JSON.parse(options.body).id;
      return { ok: true, json: async () => ({ id: org }) };
    }
    if (path === '/user/self') return { ok: true, json: async () => ({ orgId: org, tier: { current: 'PRO' } }) };
    if (path === '/user/organizations') return { json: async () => [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] };
    if (path === '/checkout') return { json: async () => `Checkout ${org}` };
    if (firstPosts) { firstPosts = false; return { json: () => pendingOld }; }
    const requestedOrg = org;
    return { json: async () => `Posts ${requestedOrg}` };
  });
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><App /></SWRConfig>);
  fireEvent.click(await screen.findByRole('button', { name: 'Alpha' }));
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
  await screen.findByText('Posts b');
  await screen.findByText('Checkout b');
  await act(async () => { resolveOld('OLD A POSTS'); await pendingOld; });
  expect(screen.getByTestId('posts').textContent).toBe('Posts b');
  expect(screen.queryByText('OLD A POSTS')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Beta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
  await screen.findByText('Posts a');
  await screen.findByText('Checkout a');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Alpha' })).toBeTruthy());
  expect(mockReport).not.toHaveBeenCalled();
  expect(mockFetch.mock.calls.filter(([path]) => path === '/user/organizations').length).toBeGreaterThanOrEqual(3);
});
