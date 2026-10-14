import React, { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { RegisterFormError } from './register.form.error';

const Harness = ({ emailHidden, message }: { emailHidden: boolean; message?: string }) => {
  const form = useForm<{ email: string }>();
  useEffect(() => {
    if (message) form.setError('email', { message });
  }, [message]);
  return (
    <FormProvider {...form}>
      <form>
        <RegisterFormError emailHidden={emailHidden} />
      </form>
    </FormProvider>
  );
};

test('shows the register error when the email field is hidden after OAuth', async () => {
  await act(async () => {
    render(<Harness emailHidden={true} message="Email domain not allowed" />);
  });
  expect(screen.getByRole('alert').textContent).toBe('Email domain not allowed');
});

test('renders nothing when the email field shows its own error', async () => {
  await act(async () => {
    render(<Harness emailHidden={false} message="Email already exists" />);
  });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('renders nothing without an error', async () => {
  await act(async () => {
    render(<Harness emailHidden={true} />);
  });
  expect(screen.queryByRole('alert')).toBeNull();
});
