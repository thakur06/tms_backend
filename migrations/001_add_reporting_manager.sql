-- Migration: Add Reporting Manager and Timesheet Approval System
-- Description: Adds manager hierarchy and timesheet approval workflow

-- Step 1: Add reporting manager columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_manager BOOLEAN DEFAULT FALSE;

-- Step 2: Create timesheet_approvals table
CREATE TABLE IF NOT EXISTS timesheet_approvals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_hours DECIMAL(5,2),
  UNIQUE(user_id, week_start_date, week_end_date)
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_user ON timesheet_approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_status ON timesheet_approvals(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_approver ON timesheet_approvals(approved_by);
CREATE INDEX IF NOT EXISTS idx_users_reporting_manager ON users(reporting_manager_id);

-- Step 4: Add comment for documentation
COMMENT ON TABLE timesheet_approvals IS 'Stores weekly timesheet submission and approval status';
COMMENT ON COLUMN users.reporting_manager_id IS 'References the user who is this users reporting manager';
COMMENT ON COLUMN users.is_manager IS 'Indicates if this user can approve timesheets';
