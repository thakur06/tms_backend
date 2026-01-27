ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';
UPDATE projects SET status = 'Active' WHERE status IS NULL;
