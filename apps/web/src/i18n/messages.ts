import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import type { Locale } from './config';

/** Static catalogues, for places that render several locales on one page (the /styleguide). */
export const MESSAGES: Record<Locale, typeof en> = { ar, fr, en };
