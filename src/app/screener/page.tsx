import { getScreenerData } from '@/app/actions/screener';
import ScreenerClient from '@/components/screener/ScreenerClient';

export const dynamic = 'force-dynamic';

export default async function ScreenerPage() {
  const data = await getScreenerData('portfolio');

  return <ScreenerClient initialData={data} />;
}
