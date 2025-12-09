const Budget = require("../models/Budget");
const Bill = require("../models/Bill");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiResponse } = require("../utils/ApiResponse");

// Helper to get Forecast Risk (Reused simplified logic)
// ideally shared in a service, but for now duplicating light logic to avoid circular deps
const getForecastRisk = async (userId, budget) => {
  if (!budget) return "low";

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const expenses = await Transaction.find({
    user: userId,
    type: "expense",
    date: { $gte: thirtyDaysAgo },
  });

  if (expenses.length === 0) return "low";

  const total = expenses.reduce((sum, t) => sum + t.amount, 0);
  const dailyAvg = total / 30;

  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const remainingDays = lastDay.getDate() - now.getDate();

  const predicted = budget.spentSoFar + dailyAvg * remainingDays;
  const pct = (predicted / budget.monthlyBudget) * 100;

  if (pct > 100) return "high";
  if (pct > 75) return "medium";
  return "low";
};

// @desc    Get Consolidated Alerts
// @route   GET /api/alerts
// @access  Private
const getAlerts = asyncHandler(async (req, res) => {
  const alerts = [];
  const userId = req.user.id;
  let idCounter = 1;

  // 1. Budget Alerts
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const budget = await Budget.findOne({ user: userId, month: currentMonth });

  if (budget) {
    const usage = (budget.spentSoFar / budget.monthlyBudget) * 100;

    if (usage > 100) {
      alerts.push({
        id: String(idCounter++),
        type: "danger",
        message: `You have exceeded your monthly budget by ${Math.round(
          usage - 100
        )}%.`,
        date: new Date(),
        isRead: false,
      });
    } else if (usage > 80) {
      alerts.push({
        id: String(idCounter++),
        type: "warning",
        message: `You have exceeded ${Math.round(
          usage
        )}% of your monthly budget.`,
        date: new Date(),
        isRead: false,
      });
    }
  } else {
    alerts.push({
      id: String(idCounter++),
      type: "info",
      message: "You haven't set a budget for this month yet.",
      date: new Date(),
      isRead: false,
    });
  }

  // 2. Bill Alerts (Overdue & Due Soon)
  const upcomingBills = await Bill.find({
    user: userId,
    status: "pending",
    // Due date <= 3 days from now, OR overdue
    // We fetch generic pending and filter logic here
  });

  upcomingBills.forEach((bill) => {
    const dueDate = new Date(bill.dueDate);
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      alerts.push({
        id: String(idCounter++),
        type: "danger",
        message: `Overdue: ${
          bill.billName
        } was due on ${dueDate.toLocaleDateString()}.`,
        date: dueDate, // Show original due date
        isRead: false,
      });
    } else if (diffDays <= 3) {
      alerts.push({
        id: String(idCounter++),
        type: "warning",
        message: `${bill.billName} is due ${
          diffDays === 0 ? "today" : "in " + diffDays + " days"
        }.`,
        date: new Date(),
        isRead: false,
      });
    }
  });

  // 3. AI Forecast Alerts
  const user = await User.findById(userId);
  if (user.settings?.aiPreferences?.forecast && budget) {
    const risk = await getForecastRisk(userId, budget);
    if (risk === "high") {
      alerts.push({
        id: String(idCounter++),
        type: "danger",
        message:
          "AI Forecast: High risk of overspending this month based on current habits.",
        date: new Date(),
        isRead: false,
      });
    }
  }

  // Sort by type priority (danger > warning > info)
  const priority = { danger: 3, warning: 2, info: 1 };
  alerts.sort((a, b) => priority[b.type] - priority[a.type]);

  res
    .status(200)
    .json(new ApiResponse(200, { alerts }, "Alerts retrieved successfully"));
});

module.exports = {
  getAlerts,
};
