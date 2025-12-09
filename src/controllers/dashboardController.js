const Transaction = require("../models/Transaction");
const Budget = require("../models/Budget");
const Bill = require("../models/Bill");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

// Helper to get current month date range
const getCurrentMonthRange = () => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );
  return { startDate, endDate };
};

// Helper to get specific month date range
const getMonthRange = (monthStr) => {
  if (!monthStr) return getCurrentMonthRange();
  const [year, month] = monthStr.split("-");
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return { startDate, endDate };
};

// @desc    Get Dashboard KPIs
// @route   GET /api/dashboard/kpis
const getDashboardKPIs = asyncHandler(async (req, res) => {
  const { startDate, endDate } = getCurrentMonthRange();

  // Aggregate current month income/expenses
  const stats = await Transaction.aggregate([
    {
      $match: {
        user: req.user._id,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalIncome: {
          $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
        },
        totalExpenses: {
          $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
        },
      },
    },
  ]);

  const totals = stats[0] || { totalIncome: 0, totalExpenses: 0 };

  // Get monthly budget
  const budget = await Budget.findOne({ user: req.user.id });
  const monthlyBudget = budget ? budget.limit : 0;

  // Count upcoming bills (due within 7 days)
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const upcomingBills = await Bill.countDocuments({
    user: req.user.id,
    dueDate: {
      $gte: new Date(),
      $lte: sevenDaysFromNow,
    },
    status: { $ne: "paid" },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        totalIncome: totals.totalIncome,
        totalExpenses: totals.totalExpenses,
        monthlyBudget,
        upcomingBills,
      },
      "Dashboard KPIs retrieved"
    )
  );
});

// @desc    Get Category Spending Breakdown
// @route   GET /api/dashboard/category-spending?month=YYYY-MM
const getCategorySpending = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const { startDate, endDate } = getMonthRange(month);

  // Predefined color palette
  const colorPalette = [
    "rgba(239, 68, 68, 0.8)", // Red
    "rgba(59, 130, 246, 0.8)", // Blue
    "rgba(16, 185, 129, 0.8)", // Green
    "rgba(245, 158, 11, 0.8)", // Amber
    "rgba(139, 92, 246, 0.8)", // Purple
    "rgba(236, 72, 153, 0.8)", // Pink
    "rgba(20, 184, 166, 0.8)", // Teal
    "rgba(251, 146, 60, 0.8)", // Orange
  ];

  const categoryData = await Transaction.aggregate([
    {
      $match: {
        user: req.user._id,
        type: "expense",
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$category",
        amount: { $sum: "$amount" },
      },
    },
    {
      $sort: { amount: -1 },
    },
  ]);

  const categories = categoryData.map((cat, index) => ({
    category: cat._id,
    amount: cat.amount,
    color: colorPalette[index % colorPalette.length],
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        categories,
      },
      "Category spending retrieved"
    )
  );
});

// @desc    Get Monthly Spending Trend
// @route   GET /api/dashboard/spending-trend?month=YYYY-MM
const getSpendingTrend = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const { startDate, endDate } = getMonthRange(month);

  const dailyData = await Transaction.aggregate([
    {
      $match: {
        user: req.user._id,
        type: "expense",
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dayOfMonth: "$date" },
        amount: { $sum: "$amount" },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  // Create a map for quick lookup
  const dataMap = {};
  dailyData.forEach((item) => {
    dataMap[item._id] = item.amount;
  });

  // Fill in all days of the month (including 0s for missing days)
  const daysInMonth = new Date(
    endDate.getFullYear(),
    endDate.getMonth() + 1,
    0
  ).getDate();
  const trend = [];

  for (let day = 1; day <= daysInMonth; day++) {
    trend.push({
      day,
      amount: dataMap[day] || 0,
    });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        trend,
      },
      "Spending trend retrieved"
    )
  );
});

// @desc    Get Consolidated AI Insights
// @route   GET /api/dashboard/ai-insights
const getAIInsights = asyncHandler(async (req, res) => {
  const insights = [];
  const userId = req.user.id;
  const User = require("../models/User");

  const user = await User.findById(userId);
  if (!user.settings?.aiPreferences) {
    return res
      .status(200)
      .json(new ApiResponse(200, { insights: [] }, "AI disabled"));
  }

  const { startDate, endDate } = getCurrentMonthRange();

  // 1. FORECAST INSIGHT
  if (user.settings.aiPreferences.forecast) {
    const month = `${startDate.getFullYear()}-${String(
      startDate.getMonth() + 1
    ).padStart(2, "0")}`;
    const budget = await Budget.findOne({ user: userId, month });

    if (budget && budget.monthlyBudget > 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const expenses = await Transaction.find({
        user: userId,
        type: "expense",
        date: { $gte: thirtyDaysAgo },
      });

      if (expenses.length > 0) {
        const total = expenses.reduce((sum, t) => sum + t.amount, 0);
        const dailyAvg = total / 30;
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const remainingDays = lastDay.getDate() - now.getDate();
        const predicted = budget.spentSoFar + dailyAvg * remainingDays;
        const percentage = (predicted / budget.monthlyBudget) * 100;

        let severity, message;
        if (percentage > 100) {
          severity = "high";
          message = `Based on your current trend, you may exceed your monthly budget by ${Math.round(
            percentage - 100
          )}%.`;
        } else if (percentage > 75) {
          severity = "medium";
          message = `You may reach your budget limit by the end of the month. Small reductions can help.`;
        } else {
          severity = "low";
          message = `You're on track! You will comfortably stay within your monthly budget.`;
        }

        insights.push({
          id: "1",
          type: "forecast",
          title: "AI Spending Forecast",
          message,
          severity,
          timestamp: new Date(),
        });
      }
    }
  }

  // 2. PERSONALITY INSIGHT
  if (user.settings.aiPreferences.personality) {
    const categoryData = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          type: "expense",
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$category",
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 1 },
    ]);

    if (categoryData.length > 0) {
      const topCategory = categoryData[0];
      const totalExpenses = await Transaction.aggregate([
        {
          $match: {
            user: req.user._id,
            type: "expense",
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      if (totalExpenses.length > 0) {
        const percentage = Math.round(
          (topCategory.amount / totalExpenses[0].total) * 100
        );
        insights.push({
          id: "2",
          type: "personality",
          title: "Personality Insight",
          message: `You are a ${topCategory._id} Spender — ${percentage}% of your expenses are on ${topCategory._id}.`,
          severity: "info",
          timestamp: new Date(),
        });
      }
    }
  }

  // 3. SUGGESTION INSIGHT
  if (user.settings.aiPreferences.suggestions) {
    const categoryData = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          type: "expense",
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$category",
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 1 },
    ]);

    if (categoryData.length > 0) {
      const topCategory = categoryData[0];
      const reduction = Math.round(topCategory.amount * 0.1);
      insights.push({
        id: "3",
        type: "suggestion",
        title: "Smart Suggestion",
        message: `Reduce ${
          topCategory._id
        } expenses by 10% to save $${reduction.toLocaleString()} this month.`,
        severity: "info",
        timestamp: new Date(),
      });
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, { insights }, "AI insights retrieved"));
});

module.exports = {
  getDashboardKPIs,
  getCategorySpending,
  getSpendingTrend,
  getAIInsights,
};
