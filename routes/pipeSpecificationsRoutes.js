const express = require("express");
const router = express.Router();
const { getPipeSpecifications, createPipeSpecification } = require("../controllers/pipeSpecificationsController");
const { protect } = require("../middlewares/authMiddleware");

// GET /api/pipe-specifications
router.get("/", protect, getPipeSpecifications);

// POST /api/pipe-specifications
router.post("/", protect, createPipeSpecification);

module.exports = router;
