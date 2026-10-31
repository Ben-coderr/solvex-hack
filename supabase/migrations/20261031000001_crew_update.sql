-- D9 crew update (docs/05 §2.1): the ambulance crew's vitals arrive on their own channel and are stored as a report
-- (source 'crew', parsed = {"crew": {...}}, no packet). The hospitals already pre-alerted get an SMS update.
alter table public.reports drop constraint reports_channel_check;
alter table public.reports add constraint reports_channel_check
  check (channel in ('https','sms','paste','witness','sim','crew'));

alter table public.sms_outbox drop constraint sms_outbox_purpose_check;
alter table public.sms_outbox add constraint sms_outbox_purpose_check
  check (purpose in ('ack','prealert','status_reply','crew_update'));
