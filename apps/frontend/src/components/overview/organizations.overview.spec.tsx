import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { OrganizationsOverview } from './organizations.overview';

const mockFetch = jest.fn();
const mockCloseAll = jest.fn();
const mockMutate = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}), { virtual: true });
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
jest.mock('../layout/new-modal', () => ({ useModals: () => ({ closeAll: mockCloseAll }) }));
jest.mock('../new-launch/store', () => ({ useLaunchStore: { getState: () => ({ reset: jest.fn() }) } }));
jest.mock('swr', () => ({ useSWRConfig: () => ({ mutate: mockMutate }) }));

const organizations = [
  { id: 'a', name: 'Alpha', planned: 12, errors: 0 },
  { id: 'b', name: 'Beta', planned: 3, errors: 7 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockImplementation(async (path: string) => ({
    ok: true,
    json: async () => path === '/user/organizations/overview' ? organizations
      : path === '/user/self' ? { orgId: 'b' } : { id: 'b' },
  }));
  mockMutate.mockImplementation(async (_key: string, update: () => Promise<unknown>) => update());
});

test('renders company rows with planned and persisted error counts', async () => {
  render(<OrganizationsOverview />);
  const alpha = await screen.findByRole('row', { name: /Alpha/ });
  const beta = screen.getByRole('row', { name: /Beta/ });
  expect(within(alpha).getByText('12')).toBeTruthy();
  expect(within(beta).getByText('3')).toBeTruthy();
  expect(within(beta).getByText('7').className).toContain('text-red-500');
  expect(within(alpha).getByText('0').className).not.toContain('text-red-500');
  expect(mockFetch).toHaveBeenCalledWith('/user/organizations/overview');
});

test.each([0, 1])('shows an empty state for %i organizations', async (count) => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => organizations.slice(0, count) });
  render(<OrganizationsOverview />);
  expect(await screen.findByText('The company overview is available when you belong to two or more organizations.')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

test('switches via the shared endpoint and refreshes the user', async () => {
  render(<OrganizationsOverview />);
  fireEvent.click(await screen.findByRole('button', { name: 'Switch to Beta' }));
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
  expect(mockFetch).toHaveBeenCalledWith('/user/change-org', { method: 'POST', body: JSON.stringify({ id: 'b' }) });
  expect(mockFetch).toHaveBeenCalledWith('/user/self');
});

test('shows a load error rather than an empty state', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false });
  render(<OrganizationsOverview />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not load the company overview. Please try again.');
});

test('retries loading after a network failure', async () => {
  mockFetch.mockRejectedValueOnce(new Error('Offline'));
  render(<OrganizationsOverview />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('row', { name: /Alpha/ })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('disables all switch controls while a request is pending', async () => {
  render(<OrganizationsOverview />);
  const button = await screen.findByRole('button', { name: 'Switch to Beta' });
  let resolve!: (response: { ok: boolean; json: () => Promise<{ id: string }> }) => void;
  mockFetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Alpha' }));
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(mockFetch.mock.calls.filter((call: unknown[]) => call[0] === '/user/change-org')).toHaveLength(1);
  await act(async () => resolve({ ok: true, json: async () => ({ id: 'b' }) }));
  expect(mockCloseAll).toHaveBeenCalledTimes(1);
});

test('shows switch failures and enables retry', async () => {
  render(<OrganizationsOverview />);
  const button = await screen.findByRole('button', { name: 'Switch to Beta' });
  mockFetch.mockResolvedValueOnce({ ok: false });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not switch organization. Please try again.');
  fireEvent.click(button);
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
});
