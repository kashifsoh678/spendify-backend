const express = require("express");
const router = express.Router();
const {
  getForecast,
  getPersonality,
  getSuggestions,
  getMoodInsights,
  getChallenges,
} = require("../controllers/aiController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/forecast", getForecast);
router.get("/personality", getPersonality);
router.get("/suggestions", getSuggestions);
router.get("/mood-insights", getMoodInsights);
router.get("/challenges", getChallenges);

module.exports = router;
