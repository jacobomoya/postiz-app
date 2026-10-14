import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminCreateUserForm } from './admin-create-user.form';

const mockFetch = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('@gitroom/react/form/button', () => ({
  Button: ({ children, secondary, loading, innerClassName, ...props }: any) => <button {...props}>{children}</button>,
}), { virtual: true });

const organizations = [{ id: 'o1', name: 'Solucionia' }, { id: 'o2', name: 'Laica' }];
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => jest.clearAllMocks());

test('submits the create-user payload and reports success', async () => {
  const onCreated = jest.fn();
  mockFetch.mockResolvedValue({ ok: true, status: 201, text: async () => '{}' });
  render(<AdminCreateUserForm organizations={organizations} onCreated={onCreated} />);
  fill('Email', ' New@Laica.io ');
  fill('Name', 'New User');
  fill('Password', 'secret-pass');
  fill('Organization', 'o2');
  fill('Role', 'ADMIN');
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  expect(mockFetch).toHaveBeenCalledWith('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'new@laica.io', password: 'secret-pass', name: 'New User', organizationId: 'o2', role: 'ADMIN' }),
  });
});

test('shows a 409 duplicate error inline and keeps the form open', async () => {
  const onCreated = jest.fn();
  mockFetch.mockResolvedValue({
    ok: false, status: 409,
    text: async () => JSON.stringify({ statusCode: 409, message: 'A user with this email already exists' }),
  });
  render(<AdminCreateUserForm organizations={organizations} onCreated={onCreated} />);
  fill('Email', 'ana@solucionia.ai');
  fill('Password', 'secret-pass');
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'A user with this email already exists');
  expect(onCreated).not.toHaveBeenCalled();
  expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ organizationId: 'o1', role: 'USER' });
});

test('validates the password length before calling the API', async () => {
  render(<AdminCreateUserForm organizations={organizations} onCreated={jest.fn()} />);
  fill('Email', 'a@b.io');
  fill('Password', 'short');
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Password must be 8 to 72 characters');
  expect(mockFetch).not.toHaveBeenCalled();
});

test('generates a visible random password', () => {
  render(<AdminCreateUserForm organizations={organizations} onCreated={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  const input = screen.getByLabelText('Password') as HTMLInputElement;
  expect(input.type).toBe('text');
  expect(input.value.length).toBeGreaterThanOrEqual(16);
});
