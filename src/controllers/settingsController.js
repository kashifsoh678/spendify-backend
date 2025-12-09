const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");
const bcrypt = require("bcryptjs");

// --- PROFILE SETTINGS ---

// @desc    Update User Profile
// @route   PUT /api/users/profile
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.name = req.body.name || user.name;
  user.email = req.body.email || user.email;

  const updatedUser = await user.save();

  res.status(200).json(
    new ApiResponse(
      200,
      {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
      },
      "Profile updated successfully"
    )
  );
});

// @desc    Change Password
// @route   PUT /api/users/change-password
// @desc    Change Password
// @route   PUT /api/users/change-password
const changePassword = asyncHandler(async (req, res) => {
  // Support both naming conventions
  const currentPassword = req.body.currentPassword || req.body.current;
  const newPassword = req.body.newPassword || req.body.new;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Please provide both current and new password");
  }

  const user = await User.findById(req.user.id).select("+password");

  if (!(await user.matchPassword(currentPassword))) {
    throw new ApiError(401, "Invalid current password");
  }

  user.password = newPassword;
  await user.save();

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// --- AVATAR MANAGEMENT ---

// @desc    Upload Avatar (File Upload Only)
// @route   POST /api/users/avatar
const uploadAvatar = asyncHandler(async (req, res) => {
  const imagekit = require("../config/imagekit");
  let avatarUrl;

  if (!req.file) {
    throw new ApiError(400, "Please upload an image file");
  }

  // Get current user to check for existing avatar
  const user = await User.findById(req.user.id);

  // Delete old avatar from ImageKit if it exists
  if (user.avatar && user.avatar.includes("ik.imagekit.io")) {
    try {
      // Extract fileId from ImageKit URL
      // URL format: https://ik.imagekit.io/alt5i0gkh/avatars/avatar_123_1733764800000.jpg
      // We need to get the file path: /avatars/avatar_123_1733764800000.jpg
      const urlObj = new URL(user.avatar);
      const filePath = urlObj.pathname; // Gets /avatars/avatar_123_1733764800000.jpg

      // List files to get fileId
      const files = await imagekit.listFiles({
        searchQuery: `name="${filePath.split("/").pop()}"`,
      });

      if (files.length > 0) {
        console.log(`Deleting old avatar: ${files[0].fileId}`);
        await imagekit.deleteFile(files[0].fileId);
        console.log("Old avatar deleted successfully");
      } else {
        console.log("Old avatar file not found in ImageKit");
      }
    } catch (error) {
      console.error("Error deleting old avatar:", error.message);
      // Continue with upload even if deletion fails
    }
  }

  // Upload new file to ImageKit
  const uploadResponse = await imagekit.upload({
    file: req.file.buffer.toString("base64"),
    fileName: `avatar_${req.user.id}_${Date.now()}.${
      req.file.mimetype.split("/")[1]
    }`,
    folder: "/avatars",
    useUniqueFileName: true,
  });

  avatarUrl = uploadResponse.url;
  user.avatar = avatarUrl;
  await user.save();

  res
    .status(200)
    .json(new ApiResponse(200, { avatar: avatarUrl }, "Avatar updated"));
});

// --- NOTIFICATION SETTINGS ---

// @desc    Get Notification Settings
// @route   GET /api/settings/notifications
const getNotificationSettings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user.settings.notifications,
        "Notification settings retrieved"
      )
    );
});

// @desc    Update Notification Settings
// @route   PUT /api/settings/notifications
const updateNotificationSettings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  // Merge existing with new
  user.settings.notifications = {
    ...user.settings.notifications,
    ...req.body,
  };

  await user.save();
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user.settings.notifications,
        "Notification settings updated"
      )
    );
});

// --- AI PREFERENCES ---

// @desc    Get AI Preferences
// @route   GET /api/settings/ai
const getAIPreferences = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user.settings.aiPreferences,
        "AI preferences retrieved"
      )
    );
});

// @desc    Update AI Preferences
// @route   PUT /api/settings/ai
const updateAIPreferences = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  // Handle both flat and nested structure
  const updates = req.body.aiPreferences || req.body;

  user.settings.aiPreferences = {
    ...user.settings.aiPreferences,
    ...updates,
  };

  await user.save();
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user.settings.aiPreferences,
        "AI preferences updated"
      )
    );
});

// --- CUSTOM CATEGORIES ---

// @desc    Get All Categories (Default + Custom)
// @route   GET /api/categories
const getCategories = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  // Default categories (could be hardcoded or from DB field 'categories')
  // Combining them for the response
  const defaultCategories = user.categories.map((name) => ({
    id: name.toLowerCase(),
    name,
    type: "expense",
    color: "#808080", // Default grey
    icon: "📁",
    isCustom: false,
  }));

  const customCategories = user.customCategories.map((cat) => ({
    id: cat._id,
    name: cat.name,
    type: cat.type,
    color: cat.color,
    icon: cat.icon,
    isCustom: true,
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        categories: [...defaultCategories, ...customCategories],
      },
      "Categories retrieved"
    )
  );
});

// @desc    Add Custom Category
// @route   POST /api/categories
const addCategory = asyncHandler(async (req, res) => {
  const { name, type, color, icon } = req.body;

  if (!name) throw new ApiError(400, "Category name is required");

  const user = await User.findById(req.user.id);

  // Check duplicates
  const exists = user.customCategories.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) throw new ApiError(400, "Category already exists");

  const newCategory = { name, type, color, icon };
  user.customCategories.push(newCategory);

  await user.save();

  // Return the specific new category with ID
  const added = user.customCategories[user.customCategories.length - 1];

  res
    .status(201)
    .json(new ApiResponse(201, added, "Category added successfully"));
});

// @desc    Delete Custom Category
// @route   DELETE /api/categories/:id
const deleteCategory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  const initialLen = user.customCategories.length;
  user.customCategories = user.customCategories.filter(
    (c) => c._id.toString() !== req.params.id
  );

  if (user.customCategories.length === initialLen) {
    throw new ApiError(404, "Category not found (or cannot delete default)");
  }

  await user.save();
  res
    .status(200)
    .json(new ApiResponse(200, {}, "Category deleted successfully"));
});

module.exports = {
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
};
