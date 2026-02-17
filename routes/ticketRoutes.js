const express = require('express');
const router = express.Router();
const {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    deleteTicket,
    addComment,
    updateComment,
    deleteComment,
    createBulkTickets
} = require('../controllers/ticketController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect); // Protect all ticket routes

router.post('/', createTicket);
router.post('/bulk', createBulkTickets);
router.get('/', getTickets);
router.get('/:id', getTicketById);
router.put('/:id', updateTicket);
router.delete('/:id', deleteTicket);

router.post('/:id/comments', addComment);
router.put('/:id/comments/:commentId', updateComment);
router.delete('/:id/comments/:commentId', deleteComment);

module.exports = router;
