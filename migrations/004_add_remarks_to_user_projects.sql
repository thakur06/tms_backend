-- Migration to add remarks column to user_projects
ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS remarks TEXT;
