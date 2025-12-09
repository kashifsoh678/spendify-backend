const express = require("express");
const router = express.Router();
const {
  createBill,
  getAllBills,
  getUpcomingBills,
  markBillAsPaid,
  deleteBill,
} = require("../controllers/billController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", createBill);
router.get("/", getAllBills);
router.get("/upcoming", getUpcomingBills);
router.put("/:id/paid", markBillAsPaid);
router.delete("/:id", deleteBill);

module.exports = router;
