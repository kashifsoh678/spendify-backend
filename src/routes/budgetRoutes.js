const express = require("express");
const router = express.Router();
const {
  setBudget,
  getCurrentBudget,
  getBudgetStatus,
} = require("../controllers/budgetController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", setBudget);
router.get("/", getCurrentBudget);
router.get("/status", getBudgetStatus);

module.exports = router;
