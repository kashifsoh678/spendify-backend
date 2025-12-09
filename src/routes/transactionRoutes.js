const express = require("express");
const router = express.Router();
const {
  addTransaction,
  getTransactions,
  getMonthlyTransactions,
  deleteTransaction,
  updateTransaction,
} = require("../controllers/transactionController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", addTransaction);
router.get("/", getTransactions);
router.get("/month/:year-:month", getMonthlyTransactions);
router.delete("/:id", deleteTransaction);
router.put("/:id", updateTransaction);

module.exports = router;
