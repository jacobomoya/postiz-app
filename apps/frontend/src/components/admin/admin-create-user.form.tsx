'use client';

import React, { FC, FormEvent, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import {
  ADMIN_ROLES,
  AdminOrganization,
  AdminRole,
  useAdminRequest,
} from '@gitroom/frontend/components/admin/admin-users.api';

export const inputClass =
  'bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor';

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';

export const generatePassword = (length = 16) => {
  const values = new Uint32Array(length);
  globalThis.crypto.getRandomValues(values);
  return Array.from(
    values,
    (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]
  ).join('');
};

export const validPassword = (password: string) =>
  password.length >= 8 && password.length <= 72;

export const PASSWORD_RULE = 'Password must be 8 to 72 characters';

export const FormError: FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div role="alert" className="text-red-400 text-[13px]">
      {message}
    </div>
  ) : null;

export const Field: FC<{
  id: string;
  label: string;
  children: React.ReactNode;
}> = ({ id, label, children }) => (
  <div className="flex flex-col gap-[6px]">
    <label htmlFor={id} className="text-[12px] opacity-70">
      {label}
    </label>
    {children}
  </div>
);

export const PasswordInput: FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, value, onChange }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-[8px]">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} flex-1`}
      />
      <Button secondary type="button" onClick={() => setVisible((v) => !v)}>
        {visible ? 'Hide' : 'Show'}
      </Button>
      <Button
        secondary
        type="button"
        onClick={() => {
          onChange(generatePassword());
          setVisible(true);
        }}
      >
        Generate
      </Button>
    </div>
  );
};

export const AdminCreateUserForm: FC<{
  organizations: AdminOrganization[];
  onCreated: () => void;
}> = ({ organizations, onCreated }) => {
  const request = useAdminRequest();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id || ''
  );
  const [role, setRole] = useState<AdminRole>('USER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }
    if (!validPassword(password)) {
      setError(PASSWORD_RULE);
      return;
    }
    if (!organizationId) {
      setError('Choose an organization');
      return;
    }
    setSaving(true);
    setError(null);
    const failure = await request('/admin/users', 'POST', {
      email: normalizedEmail,
      password,
      ...(name.trim() ? { name: name.trim() } : {}),
      organizationId,
      role,
    });
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    onCreated();
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-[12px] text-textColor"
    >
      <Field id="create-user-email" label="Email">
        <input
          id="create-user-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field id="create-user-name" label="Name">
        <input
          id="create-user-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field id="create-user-password" label="Password">
        <PasswordInput
          id="create-user-password"
          value={password}
          onChange={setPassword}
        />
      </Field>
      <Field id="create-user-org" label="Organization">
        <select
          id="create-user-org"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          className={inputClass}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="create-user-role" label="Role">
        <select
          id="create-user-role"
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
          className={inputClass}
        >
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Create user
        </Button>
      </div>
    </form>
  );
};
