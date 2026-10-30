-- A dispatcher's band override survives later re-assessments (humans decide).
-- incidents.band = coalesce(band_override, latest computed band); assessments keep the computed value.
alter table public.incidents add column band_override public.band;
