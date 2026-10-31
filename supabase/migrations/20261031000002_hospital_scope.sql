-- P7 security review: a hospital account could read EVERY incident (exact location) and assessment through
-- PostgREST / Realtime with its own JWT. A hospital now sees only the incidents it has been pre-alerted for,
-- which is all the ED view needs (it also gets the crew update on those rows through Realtime).

drop policy if exists "staff read incidents" on public.incidents;
drop policy if exists "staff read assessments" on public.assessments;

create policy "dispatch read incidents" on public.incidents
  for select to authenticated using (public.current_role_name() in ('dispatcher', 'admin'));
create policy "hospital reads pre-alerted incidents" on public.incidents
  for select to authenticated using (
    public.current_role_name() = 'hospital'
    and exists (select 1 from public.prealerts p where p.incident_id = incidents.id and p.hospital_id = public.current_hospital_id())
  );

create policy "dispatch read assessments" on public.assessments
  for select to authenticated using (public.current_role_name() in ('dispatcher', 'admin'));
create policy "hospital reads pre-alerted assessments" on public.assessments
  for select to authenticated using (
    public.current_role_name() = 'hospital'
    and exists (select 1 from public.prealerts p where p.incident_id = assessments.incident_id and p.hospital_id = public.current_hospital_id())
  );
