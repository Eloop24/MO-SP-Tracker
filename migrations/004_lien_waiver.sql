-- Lien waiver file storage on projects
alter table projects
  add column if not exists lien_file_key  text,
  add column if not exists lien_file_name text;
