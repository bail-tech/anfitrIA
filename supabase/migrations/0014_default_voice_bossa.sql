-- Bossa is Anfi's default live voice; hosts still on the old default (coral) move to it.
alter table profiles alter column voice set default 'bossa';
update profiles set voice = 'bossa' where voice = 'coral';
