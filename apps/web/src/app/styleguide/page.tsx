import type { Metadata } from 'next';
import { Styleguide } from './styleguide';
import { BRAND } from '@/brand';

export const metadata: Metadata = { title: `${BRAND.name} styleguide` };

export default function Page() {
  return <Styleguide />;
}
