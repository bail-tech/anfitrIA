-- Per-host preferences for Anfi: reply language and GPT-Live voice (built-in name or a custom voice id).
alter table profiles add column if not exists assistant_language text not null default 'auto'
  check (assistant_language in ('auto', 'es', 'en', 'fr', 'de', 'it'));
alter table profiles add column if not exists voice text not null default 'coral'
  check (voice ~ '^[a-z]{3,16}$');
alter table profiles add column if not exists voice_custom_id text
  check (voice_custom_id is null or voice_custom_id ~ '^[A-Za-z0-9_-]{4,64}$');

-- Hosts may edit their own name and these preferences; role and organisation stay locked.
revoke update on profiles from authenticated;
grant update (name, assistant_language, voice, voice_custom_id) on profiles to authenticated;
