const express = require('express');
const router = express.Router();
const timesheetApprovalController = require('../controllers/timesheetApprovalController');
const { protect } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(protect);

// Submit timesheet for approval
router.post('/submit', timesheetApprovalController.submitTimesheetForApproval);

// Get pending timesheets for approval (managers only)
router.get('/pending', timesheetApprovalController.getTimesheetsForApproval);

// Get my timesheet submission status
router.get('/my-status', timesheetApprovalController.getMyTimesheetStatus);

// Get detailed entries for a timesheet
router.get('/:id/details', timesheetApprovalController.getTimesheetDetails);

// Get team timesheet history (managers only)
router.get('/team', timesheetApprovalController.getTeamTimesheetHistory);

// Get compliance report (daily summaries + status)
router.get('/compliance', timesheetApprovalController.getTimesheetComplianceReport);

// Approve timesheet
router.put('/:id/approve', timesheetApprovalController.approveTimesheet);

// Reject timesheet
router.put('/:id/reject', timesheetApprovalController.rejectTimesheet);

module.exports = router;
