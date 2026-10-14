'use client';

import { FC } from 'react';
import { useFormContext } from 'react-hook-form';

// After an OAuth login the register form hides the email field, so an error
// the backend reports for it (e.g. "Email domain not allowed") has nowhere to
// render. Show it at form level instead, styled like the input errors.
export const RegisterFormError: FC<{ emailHidden: boolean }> = ({
  emailHidden,
}) => {
  const {
    formState: { errors },
  } = useFormContext<{ email: string }>();
  const message = errors.email?.message;
  if (!emailHidden || !message) {
    return null;
  }
  return (
    <div role="alert" className="text-red-400 text-[12px] mt-[4px]">
      {String(message)}
    </div>
  );
};
