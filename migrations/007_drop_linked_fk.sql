-- 007_drop_linked_fk.sql
-- Remove FK constraint on linked_budget_item_id so saves never fail
-- due to referential integrity issues during project creation order
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'projects_linked_budget_item_id_fkey'
      AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT projects_linked_budget_item_id_fkey;
  END IF;
  -- Ensure column exists without FK (safe if already plain uuid)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='projects' AND column_name='linked_budget_item_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN linked_budget_item_id uuid;
  END IF;
  -- Ensure is_budget_item exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='projects' AND column_name='is_budget_item'
  ) THEN
    ALTER TABLE projects ADD COLUMN is_budget_item boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Re-seed in case migration 006 was skipped
UPDATE projects SET is_budget_item = true WHERE id IN (
  'bb644402-5eb9-4b40-85e7-56a555f20a1a','10117f84-31ff-4b2b-8c9c-bdb566851f01',
  '22aa6995-b149-455c-b364-58725544969c','e1f4656e-a17b-4f6d-b182-48500b9c8994',
  '90bee722-5f8e-4255-b11b-35b2a86da290','8de979e9-cfff-404b-a211-2f62706491f9',
  '16c1b277-824b-40a5-9694-8531dbfbe072','fcbc2db6-37c5-45c1-944e-6bdb9ed1bf21',
  '4de13189-dd1a-4074-9319-6d171ed29346','08acfbe7-a08d-4cfc-a744-c060ee425d6e',
  '0be24236-d6af-4f6a-b8d0-a6a70233ad19'
);
