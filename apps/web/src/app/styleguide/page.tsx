import type { Metadata } from 'next';
import { Styleguide } from './styleguide';

export const metadata: Metadata = { title: 'NAJDA styleguide' };

export default function Page() {
  return <Styleguide />;
}
