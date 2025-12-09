const express = require("express");
const router = express.Router();
const {
  getDashboardKPIs,
  getCategorySpending,
  getSpendingTrend,
  getAIInsights,
} = require("../controllers/dashboardController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/kpis", getDashboardKPIs);
router.get("/category-spending", getCategorySpending);
router.get("/spending-trend", getSpendingTrend);
router.get("/ai-insights", getAIInsights);

module.exports = router;
