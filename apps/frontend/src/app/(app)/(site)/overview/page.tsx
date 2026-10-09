import { Metadata } from 'next';
import { OrganizationsOverview } from '@gitroom/frontend/components/overview/organizations.overview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Company overview',
};

export default function Index() {
  return <OrganizationsOverview />;
}
