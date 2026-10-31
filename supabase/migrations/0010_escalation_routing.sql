-- Team: who receives escalated conversations that nobody owns yet.
alter table organizations add column if not exists escalation_profile uuid references profiles(id) on delete set null;
