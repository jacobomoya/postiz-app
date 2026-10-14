'use client';

import React, { FC, useEffect, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  normalizeDomain,
  normalizeDomains,
  useAdminOrganizations,
  useAdminRequest,
  useRegistrationSettings,
} from '@gitroom/frontend/components/admin/admin-users.api';
import {
  Field,
  FormError,
  inputClass,
} from '@gitroom/frontend/components/admin/admin-create-user.form';

export const AdminRegistrationSettings: FC = () => {
  const toaster = useToaster();
  const request = useAdminRequest();
  const { data: settings, error: loadError, mutate } = useRegistrationSettings();
  const { data: organizations } = useAdminOrganizations();
  const [domains, setDomains] = useState<string[]>([]);
  const [defaultOrganizationId, setDefaultOrganizationId] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDomains(normalizeDomains(settings.allowedEmailDomains || []));
    setDefaultOrganizationId(settings.defaultOrganizationId || '');
  }, [settings]);

  const addDraft = () => {
    const domain = normalizeDomain(draft);
    if (!domain) return;
    setDomains((current) => normalizeDomains([...current, domain]));
    setDraft('');
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const body = {
      allowedEmailDomains: normalizeDomains(domains),
      defaultOrganizationId: defaultOrganizationId || null,
    };
    const failure = await request('/admin/settings/registration', 'PUT', body);
    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }
    await mutate(body, { revalidate: false });
    toaster.show('Registration settings saved', 'success');
  };

  if (!settings) {
    return (
      <section className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px] text-[13px] opacity-70">
        {loadError
          ? 'Could not load the registration settings.'
          : 'Loading registration settings…'}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="registration-settings-title"
      className="flex flex-col gap-[12px] bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[16px]"
    >
      <div
        id="registration-settings-title"
        className="text-[16px] font-[600]"
      >
        Registration
      </div>
      <p className="text-[13px] opacity-70">
        While at least one domain is listed, email/password self-registration
        is closed and only Google accounts from these domains can sign up; new
        accounts join the default organization. Existing users can always log
        in. Leave the list empty to keep registration open.
      </p>

      <ul
        aria-label="Allowed email domains"
        className="flex flex-wrap gap-[8px]"
      >
        {domains.length === 0 && (
          <li className="text-[13px] opacity-60">No domain restriction</li>
        )}
        {domains.map((domain) => (
          <li
            key={domain}
            className="flex items-center gap-[6px] bg-sixth rounded-[12px] px-[10px] py-[2px] text-[13px]"
          >
            {domain}
            <button
              type="button"
              aria-label={`Remove ${domain}`}
              className="opacity-70 hover:opacity-100"
              onClick={() =>
                setDomains((current) => current.filter((d) => d !== domain))
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-[12px] items-end">
        <Field id="registration-domain" label="Add domain">
          <div className="flex gap-[8px]">
            <input
              id="registration-domain"
              value={draft}
              placeholder="example.com"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraft();
                }
              }}
              className={`${inputClass} min-w-[200px]`}
            />
            <Button secondary type="button" onClick={addDraft}>
              Add
            </Button>
          </div>
        </Field>
        <Field id="registration-default-org" label="Default organization">
          <select
            id="registration-default-org"
            value={defaultOrganizationId}
            onChange={(e) => setDefaultOrganizationId(e.target.value)}
            className={`${inputClass} min-w-[200px]`}
          >
            <option value="">None (new users get their own)</option>
            {(organizations || []).map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>
        <Button
          type="button"
          loading={saving}
          onClick={save}
          aria-label="Save registration settings"
        >
          Save
        </Button>
      </div>
      <FormError message={error} />
    </section>
  );
};
