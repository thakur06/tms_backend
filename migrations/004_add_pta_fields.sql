-- Migration to add base_hours and remarks columns to user_projects
ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS base_hours INTEGER;

-- Initialize base_hours with current allocation_hours for existing records
UPDATE user_projects SET base_hours = allocation_hours WHERE base_hours IS NULL;
