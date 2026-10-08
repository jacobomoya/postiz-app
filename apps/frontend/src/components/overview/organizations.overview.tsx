'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useOrganizationSwitch } from '../layout/use.organization.switch';

type OrganizationOverview = {
  id: string;
  name: string;
  planned: number;
  errors: number;
};

export const OrganizationsOverview = () => {
  const fetch = useFetch();
  const t = useT();
  const switchOrganization = useOrganizationSwitch();
  const [organizations, setOrganizations] = useState<OrganizationOverview[]>();
  const [loadError, setLoadError] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    const load = async () => {
      try {
        const response = await fetch('/user/organizations/overview');
        if (!response.ok) throw new Error('Could not load organizations');
        const data: OrganizationOverview[] = await response.json();
        if (active) setOrganizations(data);
      } catch {
        if (active) setLoadError(true);
      }
    };
    void load();
    return () => { active = false; };
  }, [fetch, attempt]);

  const changeOrganization = async (id: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setSwitchError(false);
    try {
      await switchOrganization(id);
    } catch {
      setSwitchError(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <section className="flex flex-col gap-[16px] p-[24px] mobile:p-[12px] bg-newBgColorInner text-newTextColor">
      <h1 className="text-[24px] font-semibold">{t('company_overview', 'Company overview')}</h1>
      {loadError ? (
        <div>
          <p role="alert">{t('company_overview_load_error', 'Could not load the company overview. Please try again.')}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded bg-btnPrimary px-[12px] py-[8px]">
            {t('retry', 'Retry')}
          </button>
        </div>
      ) : !organizations ? (
        <p role="status">{t('company_overview_loading', 'Loading company overview...')}</p>
      ) : organizations.length < 2 ? (
        <p>{t('company_overview_empty', 'The company overview is available when you belong to two or more organizations.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start" aria-label={t('company_overview', 'Company overview')} aria-busy={pending}>
            <thead>
              <tr className="border-b border-tableBorder">
                <th scope="col" className="p-[12px] text-start">{t('company', 'Company')}</th>
                <th scope="col" className="p-[12px] text-start">{t('planned', 'Planned')}</th>
                <th scope="col" className="p-[12px] text-start">{t('errors', 'Errors')}</th>
                <th scope="col" className="p-[12px] text-start">{t('organization', 'Organization')}</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} className="border-b border-tableBorder">
                  <th scope="row" className="p-[12px] text-start break-words">{org.name}</th>
                  <td className="p-[12px]">{org.planned}</td>
                  <td className={clsx('p-[12px]', org.errors > 0 && 'text-red-500 font-semibold')}>{org.errors}</td>
                  <td className="p-[12px]">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void changeOrganization(org.id)}
                      aria-label={`${t('switch_to', 'Switch to')} ${org.name}`}
                      className="rounded bg-btnPrimary px-[12px] py-[8px] disabled:opacity-50 disabled:cursor-wait"
                    >
                      {t('switch_organization', 'Switch organization')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending && <p role="status">{t('switching_organization', 'Switching organization...')}</p>}
      {switchError && <p role="alert">{t('switch_organization_error', 'Could not switch organization. Please try again.')}</p>}
    </section>
  );
};
