const express = require("express");
const router = express.Router();
const { getAlerts } = require("../controllers/alertController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/", getAlerts);

module.exports = router;
