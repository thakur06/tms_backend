-- Migration: Add Role-based Permissions
-- Description: Adds a role column and migrates is_manager data to roles

-- Step 1: Add role column with default 'employee'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'employee';

-- Step 2: Migrate data
-- Anyone marked as a manager becomes an 'admin' (assuming for now that managers had elevated access)
-- Or we keep them as employee but they get approval rights via reportingCount.
-- Special requirement: "instaead of is manager i want role option like admin or employee"
-- "if he is not an employee he can see tasks users projects reports tabs" -> Admin role.

UPDATE users SET role = 'admin' WHERE is_manager = TRUE;
UPDATE users SET role = 'employee' WHERE is_manager = FALSE OR is_manager IS NULL;

-- Step 3: We keep is_manager for backward compatibility for a bit if needed, or we can drop it.
-- User said "instead of is manager", so let's keep it for now but stop using it.

-- Step 4: Verify indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
