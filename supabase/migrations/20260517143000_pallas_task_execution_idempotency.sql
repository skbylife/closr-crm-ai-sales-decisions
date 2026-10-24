-- Guard Pallas local task execution from creating duplicate Closr tasks.
-- Pallas uses source_id = 'pallas_proposal:{proposal_id}' for the internal task it creates.

create unique index if not exists tasks_pallas_proposal_source_uidx
  on tasks(org_id, source_id)
  where source_id like 'pallas_proposal:%';

comment on index tasks_pallas_proposal_source_uidx is
  'Ensures a Pallas proposal can create at most one Closr internal task.';
