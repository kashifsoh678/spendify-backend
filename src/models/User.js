const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 6,
      select: false, // Do not return password by default
    },
    avatar: {
      type: String, // URL to profile picture
      default: "",
    },
    settings: {
      notifications: {
        email: { type: Boolean, default: true },
        bills: { type: Boolean, default: true },
        budget: { type: Boolean, default: true },
        weeklyReports: { type: Boolean, default: true },
      },
      aiPreferences: {
        enableAI: { type: Boolean, default: true },
        forecast: { type: Boolean, default: true },
        personality: { type: Boolean, default: true },
        suggestions: { type: Boolean, default: true },
        challenges: { type: Boolean, default: true },
        riskTolerance: {
          type: String,
          enum: ["low", "medium", "high"],
          default: "medium",
        },
      },
    },
    customCategories: [
      {
        name: { type: String, required: true },
        type: { type: String, enum: ["income", "expense"], default: "expense" },
        color: { type: String, default: "#000000" },
        icon: { type: String, default: "🏷️" },
      },
    ],
    // Keeping legacy categories for backward compat if needed, or deprecating in favor of transaction logic
    // For now, removing the simple string array default to rely on logic using customCategories + hardcoded defaults in frontend/backend
    // But since the request mentions GET /api/categories, we will store them here.
    // NOTE: The previous `categories` field was [String].
    // If we want to support the new "Custom Category" feature with color/icon, we should use `customCategories`.
    categories: {
      type: [String],
      default: ["Food", "Travel", "Utilities", "Shopping", "Other"],
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 Minutes

  return resetToken;
};

module.exports = mongoose.model("User", userSchema);
