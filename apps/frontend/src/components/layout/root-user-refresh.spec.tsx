import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import useSWR, { SWRConfig } from 'swr';
import { OrganizationCache } from './organization.cache';
import { PublicComponent } from '../public-api/public.component';
import { LifetimeDeal } from '../billing/lifetime.deal';

const mockFetch = jest.fn();
const mockApprove = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('./user.context', () => ({ useUser: () => ({ publicApi: 'old-key', tier: { current: 'FREE' }, totalChannels: 1 }) }));
jest.mock('./new-modal', () => ({ useDecisionModal: () => ({ open: mockApprove }) }));
jest.mock('@gitroom/react/toaster/toaster', () => ({ useToaster: () => ({ show: jest.fn() }) }), { virtual: true });
jest.mock('@gitroom/react/helpers/variable.context', () => ({ useVariables: () => ({ backendUrl: 'https://example.test', frontEndUrl: 'https://example.test' }) }), { virtual: true });
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({ useT: () => (_key: string, fallback: string) => fallback }), { virtual: true });
jest.mock('@gitroom/react/form/input', () => ({ Input: ({ disableForm, translationKey, ...props }: any) => <input {...props} /> }), { virtual: true });
jest.mock('@gitroom/react/form/button', () => ({ Button: (props: any) => <button {...props} /> }), { virtual: true });
jest.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing', () => ({ pricing: { STANDARD: { channel: 5 } } }), { virtual: true });
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({ useFireEvents: () => jest.fn() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('../public-api/mcp.client.icons', () => ({ McpClientIcon: () => null }));

function Root({ children, load }: any) {
  const { data } = useSWR('/user/self', load);
  return <><div data-testid="root-user">{data}</div><OrganizationCache>{children}</OrganizationCache></>;
}

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue({ json: async () => ({ success: true }) });
  mockApprove.mockReset().mockResolvedValue(true);
});

test.each(['rotation', 'redemption'])('%s refreshes the root user cache through the org provider', async (action) => {
  const load = jest.fn().mockResolvedValueOnce('old user').mockResolvedValue('updated user');
  render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><Root load={load}>
    {action === 'rotation' ? <PublicComponent /> : <LifetimeDeal />}
  </Root></SWRConfig>);
  await screen.findByText('old user');
  if (action === 'rotation') {
    fireEvent.click(screen.getByRole('button', { name: /Rotate/ }));
  } else {
    fireEvent.change(screen.getByPlaceholderText('Enter your code'), { target: { value: 'valid-code' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
  }
  await waitFor(() => expect(screen.getByTestId('root-user').textContent).toBe('updated user'));
  expect(load).toHaveBeenCalledTimes(2);
});
