import 'server-only';
import { createHmac } from 'node:crypto';
import { env } from '../env';

/** Keyed hash of a phone number or IP: lets us rate-limit and group reports without storing the identifier. */
export const senderHash = (identifier: string): string =>
  createHmac('sha256', env().LINK_SIGNING_SECRET).update(`sender:${identifier.trim()}`).digest('hex').slice(0, 32);
