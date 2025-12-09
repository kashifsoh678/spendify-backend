const express = require("express");
const router = express.Router();
const {
  updateProfile,
  changePassword,
  uploadAvatar,
  getNotificationSettings,
  updateNotificationSettings,
  getAIPreferences,
  updateAIPreferences,
  getCategories,
  addCategory,
  deleteCategory,
} = require("../controllers/settingsController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.use(protect);

// Profile
router.put("/users/profile", updateProfile);
router.put("/users/change-password", changePassword);
router.post("/users/avatar", upload.single("avatar"), uploadAvatar);

// Notifications
router.get("/settings/notifications", getNotificationSettings);
router.put("/settings/notifications", updateNotificationSettings);

// AI
router.get("/settings/ai", getAIPreferences);
router.put("/settings/ai", updateAIPreferences);

// Categories
router.get("/categories", getCategories);
router.post("/categories", addCategory);
router.delete("/categories/:id", deleteCategory);

module.exports = router;
