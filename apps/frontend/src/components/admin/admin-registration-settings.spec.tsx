import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { AdminRegistrationSettings } from './admin-registration-settings';

const mockFetch = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children, secondary, loading, innerClassName, ...props }: any) => <button {...props}>{children}</button>,
}), { virtual: true });
jest.mock('@gitroom/react/toaster/toaster', () => ({ useToaster: () => ({ show: jest.fn() }) }), { virtual: true });

const json = (body: unknown, status = 200) => ({
  ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
    if (path === '/admin/settings/registration' && options?.method === 'PUT') return json(JSON.parse(options.body!));
    if (path === '/admin/settings/registration') return json({ allowedEmailDomains: ['solucionia.ai'], defaultOrganizationId: null });
    if (path === '/admin/organizations') return json([{ id: 'o1', name: 'Solucionia' }]);
    return json({});
  });
});

const renderCard = () => render(
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <AdminRegistrationSettings />
  </SWRConfig>
);

test('saves normalised, de-duplicated domains and the default organization', async () => {
  renderCard();
  const list = await screen.findByRole('list', { name: 'Allowed email domains' });
  expect(within(list).getByText('solucionia.ai')).toBeTruthy();
  const input = screen.getByLabelText('Add domain');
  fireEvent.change(input, { target: { value: ' @Laica.IO ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: 'SOLUCIONIA.ai' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.change(screen.getByLabelText('Default organization'), { target: { value: 'o1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save registration settings' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/admin/settings/registration', {
    method: 'PUT',
    body: JSON.stringify({ allowedEmailDomains: ['solucionia.ai', 'laica.io'], defaultOrganizationId: 'o1' }),
  }));
});

test('removes a domain chip and sends null for "none"', async () => {
  renderCard();
  await screen.findByRole('list', { name: 'Allowed email domains' });
  fireEvent.click(screen.getByRole('button', { name: 'Remove solucionia.ai' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save registration settings' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/admin/settings/registration', {
    method: 'PUT',
    body: JSON.stringify({ allowedEmailDomains: [], defaultOrganizationId: null }),
  }));
  expect(screen.getByText(/self-registration is closed/)).toBeTruthy();
});

test('shows a save error from the API', async () => {
  mockFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'PUT') return json({ statusCode: 400, message: ['allowedEmailDomains must be valid domains'] }, 400);
    if (path === '/admin/settings/registration') return json({ allowedEmailDomains: [], defaultOrganizationId: null });
    return json([]);
  });
  renderCard();
  fireEvent.click(await screen.findByRole('button', { name: 'Save registration settings' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'allowedEmailDomains must be valid domains');
});
