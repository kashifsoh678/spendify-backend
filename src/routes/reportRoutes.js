const express = require("express");
const router = express.Router();
const {
  getMonthlyReport,
  exportReportPDF,
  exportReportCSV,
} = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/monthly", getMonthlyReport);
router.get("/monthly/pdf", exportReportPDF);
router.get("/monthly/csv", exportReportCSV);

module.exports = router;
