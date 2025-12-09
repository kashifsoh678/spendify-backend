const express = require("express");
const router = express.Router();
const {
  getAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  triggerAlertGeneration,
} = require("../controllers/alertController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/", getAlerts);
router.patch("/:id/read", markAlertAsRead);
router.patch("/read-all", markAllAlertsAsRead);
router.post("/generate", triggerAlertGeneration);

module.exports = router;
