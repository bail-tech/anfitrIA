-- Welcome tour: shown once per host after sign-up. Hosts who already used the app skip it.
alter table profiles add column if not exists onboarded_at timestamptz;
update profiles set onboarded_at = now() where onboarded_at is null and email not like '%@demo.anfitria.test';
revoke update on profiles from authenticated;
grant update (name, assistant_language, voice, voice_custom_id, onboarded_at) on profiles to authenticated;
