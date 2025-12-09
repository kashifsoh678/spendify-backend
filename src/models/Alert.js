const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["budget", "bill", "trend", "goal"],
    required: true,
  },
  severity: {
    type: String,
    enum: ["high", "medium", "low"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  metadata: {
    budgetUsage: Number,
    billId: mongoose.Schema.Types.ObjectId,
    billName: String,
    dueDate: Date,
    trendPercentage: Number,
    category: String,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    index: true,
  },
});

// TTL Index for auto-cleanup
alertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for efficient queries
alertSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);
