-- Voice notes (guest and host audio) in a private bucket, one folder per organisation:
--   voice-notes/<org_id>/<conversation_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 16777216,
        array['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/webm', 'audio/wav'])
on conflict (id) do nothing;

create policy voice_notes_read on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = private.current_org()::text);
create policy voice_notes_write on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = private.current_org()::text);
