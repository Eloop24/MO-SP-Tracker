-- Migration 012: Enable SP budget tracker for Hunters Ridge (HRMO)
-- No items seeded — add via "+ Add item" in the tracker UI
-- This migration just ensures the property shows the tracker view (routing is in app.js)
-- and that the is_new column exists on gl_lines for the new import workflow.
ALTER TABLE gl_lines ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false;
