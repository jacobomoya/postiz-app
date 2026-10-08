import { renderHook, act } from '@testing-library/react';
import { useOrganizationSwitch } from './use.organization.switch';

const mockFetch = jest.fn();
const mockMutate = jest.fn();
const mockCloseAll = jest.fn();
const mockReset = jest.fn();
const mockReport = jest.fn();
const mockReload = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('swr', () => ({ useSWRConfig: () => ({ mutate: mockMutate }) }));
jest.mock('@sentry/nextjs', () => ({ captureException: (...args: any[]) => mockReport(...args) }));
jest.mock('./new-modal', () => ({ useModals: () => ({ closeAll: mockCloseAll }) }));
jest.mock('../new-launch/store', () => ({ useLaunchStore: { getState: () => ({ reset: mockReset }) } }));

const location = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { reload: mockReload } });
});
afterAll(() => Object.defineProperty(window, 'location', { configurable: true, value: location }));
beforeEach(() => {
  jest.resetAllMocks();
  mockMutate.mockImplementation(async (_key, update) => update?.());
});

test('publishes the user and clears singleton state without reloading', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'b' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ orgId: 'b' }) });
  const { result } = renderHook(() => useOrganizationSwitch());
  await act(async () => { await result.current('b'); });
  expect(mockMutate).toHaveBeenCalledWith('/user/self', expect.any(Function), { revalidate: false });
  expect(mockCloseAll).toHaveBeenCalledTimes(1);
  expect(mockReset).toHaveBeenCalledTimes(1);
  expect(mockMutate.mock.invocationCallOrder[0]).toBeLessThan(mockCloseAll.mock.invocationCallOrder[0]);
  expect(mockReload).not.toHaveBeenCalled();
  expect(mockReport).not.toHaveBeenCalled();
});

test.each([
  ['http', 'change-org-request', false],
  ['network', 'change-org-request', false],
  ['invalid', 'malformed-response', true],
  ['json', 'malformed-response', true],
  ['self', 'user-refresh', true],
  ['self-network', 'user-refresh', true],
  ['mismatch', 'org-mismatch', true],
  ['selected-mismatch', 'org-mismatch', true],
])('reports %s failures and reconciles when the cookie changed', async (failure, stage, reload) => {
  if (failure === 'network') mockFetch.mockRejectedValueOnce(new Error('Offline'));
  else mockFetch.mockResolvedValueOnce({ ok: failure !== 'http', json: async () => {
    if (failure === 'json') throw new Error('Invalid JSON');
    return failure === 'invalid' ? {} : { id: failure === 'selected-mismatch' ? 'c' : 'b' };
  } });
  if (failure === 'self-network') mockFetch.mockRejectedValueOnce(new Error('Offline'));
  else mockFetch.mockResolvedValueOnce({ ok: failure !== 'self', json: async () => ({ orgId: 'a' }) });
  const { result } = renderHook(() => useOrganizationSwitch());
  await act(async () => { await expect(result.current('b')).rejects.toThrow(); });
  expect(mockReport).toHaveBeenCalledWith(expect.any(Error), { tags: { stage, operation: 'organization-switch' } });
  expect(mockReload).toHaveBeenCalledTimes(reload ? 1 : 0);
  if (reload) expect(mockReport.mock.invocationCallOrder[0]).toBeLessThan(mockReload.mock.invocationCallOrder[0]);
  expect(mockCloseAll).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();
  expect(mockMutate).not.toHaveBeenCalledWith('/user/organizations');
});
