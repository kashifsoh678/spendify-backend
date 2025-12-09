const mongoose = require("mongoose");

const budgetSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    month: {
      type: String, // Format: YYYY-MM
      required: true,
    },
    monthlyBudget: {
      type: Number,
      required: [true, "Please add a monthly budget"],
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Monthly budget must be greater than 0",
      },
    },
    spentSoFar: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one budget per user per month
budgetSchema.index({ user: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("Budget", budgetSchema);
