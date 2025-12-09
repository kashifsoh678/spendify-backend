const Budget = require("../models/Budget");
const Transaction = require("../models/Transaction");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

// Helper function to get current month in YYYY-MM format
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Helper function to calculate budget fields
const calculateBudgetFields = (budget) => {
  const remaining = budget.monthlyBudget - budget.spentSoFar;
  const percentageUsed = Math.round(
    (budget.spentSoFar / budget.monthlyBudget) * 100
  );

  let statusColor = "green";
  if (percentageUsed > 95) {
    statusColor = "red";
  } else if (percentageUsed > 80) {
    statusColor = "orange";
  } else if (percentageUsed > 50) {
    statusColor = "yellow";
  }

  return {
    month: budget.month,
    monthlyBudget: budget.monthlyBudget,
    spentSoFar: budget.spentSoFar,
    remaining,
    percentageUsed,
    statusColor,
  };
};

// @desc    Set or Update Monthly Budget
// @route   POST /api/budget
// @access  Private
const setBudget = asyncHandler(async (req, res) => {
  const { monthlyBudget } = req.body;

  if (!monthlyBudget || monthlyBudget <= 0) {
    throw new ApiError(
      400,
      "Please provide a valid monthly budget greater than 0"
    );
  }

  const month = getCurrentMonth();

  // Calculate spentSoFar from all expenses this month
  const startDate = new Date(month + "-01");
  const endDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );

  const expenses = await Transaction.find({
    user: req.user.id,
    type: "expense",
    date: { $gte: startDate, $lte: endDate },
  });

  const spentSoFar = expenses.reduce((sum, txn) => sum + txn.amount, 0);

  // Find or create budget
  let budget = await Budget.findOne({
    user: req.user.id,
    month,
  });

  if (budget) {
    // Update existing budget
    budget.monthlyBudget = monthlyBudget;
    budget.spentSoFar = spentSoFar;
    await budget.save();
  } else {
    // Create new budget
    budget = await Budget.create({
      user: req.user.id,
      month,
      monthlyBudget,
      spentSoFar,
    });
  }

  const budgetData = calculateBudgetFields(budget);

  res
    .status(200)
    .json(
      new ApiResponse(200, { budget: budgetData }, "Budget set successfully")
    );
});

// @desc    Get Current Month Budget
// @route   GET /api/budget
// @access  Private
const getCurrentBudget = asyncHandler(async (req, res) => {
  const month = getCurrentMonth();

  const budget = await Budget.findOne({
    user: req.user.id,
    month,
  });

  if (!budget) {
    throw new ApiError(404, "No budget set for this month");
  }

  const budgetData = calculateBudgetFields(budget);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { budget: budgetData },
        "Budget fetched successfully"
      )
    );
});

// @desc    Get Budget Status with Alert Messages
// @route   GET /api/budget/status
// @access  Private
const getBudgetStatus = asyncHandler(async (req, res) => {
  const month = getCurrentMonth();

  const budget = await Budget.findOne({
    user: req.user.id,
    month,
  });

  if (!budget) {
    throw new ApiError(404, "No budget set for this month");
  }

  const budgetData = calculateBudgetFields(budget);
  const { percentageUsed, statusColor } = budgetData;

  let alert = "";
  if (percentageUsed >= 100) {
    alert = "Alert: You have exceeded your budget this month.";
  } else if (percentageUsed >= 95) {
    alert = "Alert: You have used 95%+ of your budget.";
  } else if (percentageUsed >= 80) {
    alert = "Warning: You have used 80%+ of your budget.";
  } else if (percentageUsed >= 50) {
    alert = `You have used ${percentageUsed}% of your budget. Keep going!`;
  } else {
    alert = `You have used ${percentageUsed}% of your budget. Great job!`;
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        alert,
        statusColor,
        budget: budgetData,
      },
      "Budget status fetched successfully"
    )
  );
});

module.exports = {
  setBudget,
  getCurrentBudget,
  getBudgetStatus,
};
