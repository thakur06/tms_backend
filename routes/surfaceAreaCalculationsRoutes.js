const express = require("express");
const router = express.Router();
const controller = require("../controllers/surfaceAreaCalculationsController");
const { protect } = require("../middlewares/authMiddleware");

router.get("/", protect, controller.getCalculations);
router.get("/:id", protect, controller.getCalculationById);
router.post("/", protect, controller.saveCalculation);
router.delete("/:id", protect, controller.deleteCalculation);

module.exports = router;
