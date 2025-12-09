const mongoose = require("mongoose");

const billSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    billName: {
      type: String,
      required: [true, "Please add a bill name"],
    },
    amount: {
      type: Number,
      required: [true, "Please add an amount"],
      validate: {
        validator: function (v) {
          return v > 0;
        },
        message: "Amount must be greater than 0",
      },
    },
    dueDate: {
      type: Date,
      required: [true, "Please add a due date"],
    },
    status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Bill", billSchema);
