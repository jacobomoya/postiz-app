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

test('creates a company and refreshes the overview list', async () => {
  render(<OrganizationsOverview />);
  await screen.findByRole('row', { name: /Alpha/ });
  const input = screen.getByRole('textbox', { name: 'Company name' });
  const create = screen.getByRole('button', { name: 'Create company' });
  expect(create.disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'Gamma' } });
  expect(create.disabled).toBe(false);
  mockFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/user/organizations' && options?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'c', name: 'Gamma' }) };
    }
    if (path === '/user/organizations/overview') {
      return { ok: true, json: async () => [...organizations, { id: 'c', name: 'Gamma', planned: 0, errors: 0 }] };
    }
    return { ok: true, json: async () => ({ id: 'b' }) };
  });
  fireEvent.click(create);
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Company created.');
  expect(mockFetch.mock.calls.some((call: unknown[]) => call[0] === '/user/organizations')).toBe(true);
  expect(await screen.findByRole('row', { name: /Gamma/ })).toBeTruthy();
});

test('shows the creation error line when the create request fails', async () => {
  render(<OrganizationsOverview />);
  await screen.findByRole('row', { name: /Alpha/ });
  fireEvent.change(screen.getByRole('textbox', { name: 'Company name' }), { target: { value: 'Gamma' } });
  mockFetch.mockImplementationOnce(async () => ({ ok: false }));
  fireEvent.click(screen.getByRole('button', { name: 'Create company' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not create the company. Please try again.');
});

test('offers the create action in the empty state', async () => {
  mockFetch.mockImplementation(async (path: string) => ({
    ok: true,
    json: async () => path === '/user/organizations/overview' ? [] : { id: 'b' },
  }));
  render(<OrganizationsOverview />);
  expect(await screen.findByText(/company overview is available/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create company' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Company name' })).toBeTruthy();
});
