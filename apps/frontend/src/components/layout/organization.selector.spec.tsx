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

const organizations = (count: number) => {
  mockData = [{ id: 'a', name: 'Alpha' }, ...Array.from({ length: count - 1 }, (_, index) => ({ id: `org-${index}`, name: `Company ${index}` }))];
};

test.each([2, 8])('keeps the plain list for %i organizations', (count) => {
  organizations(count);
  render(<OrganizationSelector />);
  open();
  expect(screen.queryByRole('searchbox')).toBeNull();
});

test('focuses search for more than eight organizations and filters without closing', () => {
  organizations(9);
  render(<OrganizationSelector />);
  open();
  const input = screen.getByRole('searchbox', { name: 'Search organizations' });
  expect(document.activeElement).toBe(input);
  fireEvent.mouseDown(input);
  fireEvent.change(input, { target: { value: 'cOmPaNy 3' } });
  expect(screen.getByRole('button', { name: 'Company 3' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Company 2' })).toBeNull();
  expect(screen.getByRole('searchbox')).toBe(input);
  fireEvent.change(input, { target: { value: 'missing' } });
  expect(screen.queryByRole('button', { name: /Company/ })).toBeNull();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(mockFetch).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('searchbox')).toBeNull();
  open();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
});

test('navigates filtered organizations with arrows and selects with Enter', async () => {
  organizations(9);
  render(<OrganizationSelector />);
  open();
  const input = screen.getByRole('searchbox');
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'org-1', orgId: 'org-1' }) });
  fireEvent.change(input, { target: { value: 'Company' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
  expect(mockFetch).toHaveBeenCalledWith('/user/change-org', { method: 'POST', body: JSON.stringify({ id: 'org-1' }) });
});

test('resets the highlighted item when the search changes', async () => {
  organizations(9);
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'org-3', orgId: 'org-3' }) });
  render(<OrganizationSelector />);
  open();
  const input = screen.getByRole('searchbox');
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.change(input, { target: { value: 'Company 3' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
  expect(mockFetch).toHaveBeenCalledWith('/user/change-org', { method: 'POST', body: JSON.stringify({ id: 'org-3' }) });
});

test('supports keyboard navigation in the plain list and marks the current organization', async () => {
  render(<OrganizationSelector />);
  open();
  expect(screen.getByText('Alpha', { selector: '[aria-current="true"]' })).toBeTruthy();
  const option = screen.getByRole('button', { name: 'Beta' });
  expect(document.activeElement).toBe(option);
  fireEvent.keyDown(option, { key: 'ArrowUp' });
  fireEvent.keyDown(option, { key: 'Enter' });
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
});

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

test.each([0])('renders nothing for %i organizations', (count) => {
  mockData = mockData.slice(0, count);
  expect(render(<OrganizationSelector />).container.innerHTML).toBe('');
});

test('makes creation reachable with one organization', () => {
  organizations(1);
  render(<OrganizationSelector />);
  open();
  expect(screen.getByRole('button', { name: '+ Create company' })).toBeTruthy();
});

const startCreation = () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: '+ Create company' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Company name' }), { target: { value: '  New company  ' } });
};

test('creates once while pending then switches using the authoritative flow', async () => {
  let resolve!: (response: any) => void;
  mockFetch.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  render(<OrganizationSelector />);
  startCreation();
  const submit = screen.getByRole('button', { name: 'Create' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith('/user/organizations', { method: 'POST', body: JSON.stringify({ name: 'New company' }) });
  await act(async () => resolve({ ok: true, json: async () => ({ id: 'b', name: 'New company' }) }));
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
  expect(mockFetch).toHaveBeenNthCalledWith(2, '/user/change-org', { method: 'POST', body: JSON.stringify({ id: 'b' }) });
  expect(mockMutate).toHaveBeenCalledWith('/user/self', expect.any(Function), { revalidate: false });
});

test.each(['http', 'network'])('shows creation errors without switching after %s failure', async (failure) => {
  if (failure === 'http') mockFetch.mockResolvedValueOnce({ ok: false });
  else mockFetch.mockRejectedValueOnce(new Error('Offline'));
  render(<OrganizationSelector />);
  startCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockCloseAll).not.toHaveBeenCalled();
});

test('retries switching without creating a duplicate company', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'b', name: 'New company' }) });
  mockFetch.mockResolvedValueOnce({ ok: false });
  render(<OrganizationSelector />);
  startCreation();
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry switch' }));
  await waitFor(() => expect(mockCloseAll).toHaveBeenCalledTimes(1));
  expect(mockFetch.mock.calls.filter(([path]) => path === '/user/organizations')).toHaveLength(1);
});

test('keeps form keyboard input separate from switching and allows cancel', () => {
  render(<OrganizationSelector />);
  startCreation();
  const input = screen.getByRole('textbox', { name: 'Company name' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(mockFetch).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '   ' } });
  expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('button', { name: '+ Create company' })).toBeTruthy();
});

test('renders nothing while loading', () => {
  mockLoading = true;
  expect(render(<OrganizationSelector />).container.innerHTML).toBe('');
});
