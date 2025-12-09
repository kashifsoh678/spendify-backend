const mongoose = require("mongoose");

const transactionSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    type: {
      type: String,
      required: [true, "Please add a transaction type"],
      enum: ["income", "expense"],
    },
    category: {
      type: String,
      required: [true, "Please add a category"],
    },
    amount: {
      type: Number,
      required: [true, "Please add a positive amount"],
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Amount must be greater than 0",
      },
    },
    date: {
      type: Date,
      required: [true, "Please add a date"],
    },
    note: {
      type: String,
      required: false,
    },
    mood: {
      type: String,
      enum: [
        "happy",
        "sad",
        "angry",
        "stressed",
        "bored",
        "excited",
        "neutral",
      ],
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Transaction", transactionSchema);
