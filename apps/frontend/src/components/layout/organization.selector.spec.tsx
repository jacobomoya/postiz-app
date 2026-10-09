import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrganizationSelector } from './organization.selector';

let mockOrgId = 'a';
let mockData = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
let mockLoading = false;
const mockFetch = jest.fn();
const mockCloseAll = jest.fn();
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
jest.mock('./new-modal', () => ({ useModals: () => ({ closeAll: mockCloseAll }) }));
jest.mock('../new-launch/store', () => ({ useLaunchStore: { getState: () => ({ reset: jest.fn() }) } }));
const mockMutate = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('./user.context', () => ({ useUser: () => ({ orgId: mockOrgId, tier: { current: 'FREE' } }) }));
jest.mock('swr', () => ({ __esModule: true, default: () => ({ data: mockData, isLoading: mockLoading }), useSWRConfig: () => ({ mutate: mockMutate }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgId = 'a';
  mockData = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  mockLoading = false;
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'b', orgId: 'b' }) });
  mockMutate.mockImplementation(async (_key, update) => update?.());
});

const open = () => fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));

test('updates the current organization when the user changes with cached organizations', () => {
  const { rerender } = render(<OrganizationSelector />);
  expect(screen.getByRole('button', { name: /Alpha/ })).toBeTruthy();
  mockOrgId = 'b';
  rerender(<OrganizationSelector />);
  expect(screen.getByRole('button', { name: /Beta/ })).toBeTruthy();
  expect(screen.queryByText('Alpha')).toBeNull();
});

test('opens on click and closes on outside click, Escape, and trigger toggle', () => {
  render(<OrganizationSelector />);
  expect(screen.queryByText('Beta')).toBeNull();
  open();
  expect(screen.getByText('Beta')).toBeTruthy();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByText('Beta')).toBeNull();
  open();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('Beta')).toBeNull();
  open();
  open();
  expect(screen.queryByText('Beta')).toBeNull();
});

test('posts once while pending then refreshes user and organizations', async () => {
  let resolve!: (response: any) => void;
  mockFetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  render(<OrganizationSelector />);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith('/user/change-org', { method: 'POST', body: JSON.stringify({ id: 'b' }) });
  expect(mockMutate).not.toHaveBeenCalled();
  await act(async () => resolve({ ok: true, json: async () => ({ id: 'b' }) }));
  expect(mockMutate).toHaveBeenCalledWith('/user/self', expect.any(Function), { revalidate: false });
  expect(mockCloseAll).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.invocationCallOrder[0]).toBeLessThan(mockMutate.mock.invocationCallOrder[0]);
  expect(mockMutate.mock.invocationCallOrder[0]).toBeLessThan(mockCloseAll.mock.invocationCallOrder[0]);
});

test.each(['http', 'network'])('shows an error without reload and allows retry after %s failure', async (failure) => {
  if (failure === 'http') mockFetch.mockResolvedValueOnce({ ok: false });
  else mockFetch.mockRejectedValueOnce(new Error('Offline'));
  render(<OrganizationSelector />);
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(mockCloseAll).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
});

test.each([0, 1])('renders nothing for %i organizations', (count) => {
  mockData = mockData.slice(0, count);
  expect(render(<OrganizationSelector />).container.innerHTML).toBe('');
});

test('renders nothing while loading', () => {
  mockLoading = true;
  expect(render(<OrganizationSelector />).container.innerHTML).toBe('');
});
