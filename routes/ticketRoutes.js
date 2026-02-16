const express = require('express');
const router = express.Router();
const {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    deleteTicket,
    addComment,
    updateComment
} = require('../controllers/ticketController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect); // Protect all ticket routes

router.post('/', createTicket);
router.get('/', getTickets);
router.get('/:id', getTicketById);
router.put('/:id', updateTicket);
router.delete('/:id', deleteTicket);

router.post('/:id/comments', addComment);
router.put('/:id/comments/:commentId', updateComment);

module.exports = router;
