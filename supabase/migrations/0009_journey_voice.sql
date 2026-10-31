-- Journey messages can go out as a voice note in Anfi's voice (WhatsApp).
alter table message_templates add column if not exists as_voice boolean not null default false;
