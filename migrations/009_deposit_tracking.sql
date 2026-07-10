-- Deposit tracking fields on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount numeric;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_paid boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_gl_line_id text;
