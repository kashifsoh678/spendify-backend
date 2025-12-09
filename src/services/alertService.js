const Alert = require("../models/Alert");
const Budget = require("../models/Budget");
const Bill = require("../models/Bill");
const Transaction = require("../models/Transaction");

// Helper to get current month
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Generate Budget Alerts (50%, 75%, 90%, 100% thresholds)
const generateBudgetAlerts = async (userId) => {
  const month = getCurrentMonth();
  const budget = await Budget.findOne({ user: userId, month });

  if (!budget || budget.monthlyBudget === 0) return;

  const usage = (budget.spentSoFar / budget.monthlyBudget) * 100;

  // Remove old budget alerts for this month
  await Alert.deleteMany({
    user: userId,
    type: "budget",
    "metadata.month": month,
  });

  let severity, message;

  if (usage >= 100) {
    severity = "high";
    message = `You have exceeded your monthly budget by ${Math.round(
      usage - 100
    )}%.`;
  } else if (usage >= 90) {
    severity = "high";
    message = `You have used ${Math.round(usage)}% of your monthly budget.`;
  } else if (usage >= 75) {
    severity = "medium";
    message = `You have used ${Math.round(usage)}% of your monthly budget.`;
  } else if (usage >= 50) {
    severity = "low";
    message = `You have used ${Math.round(usage)}% of your monthly budget.`;
  } else {
    return; // No alert needed
  }

  await Alert.create({
    user: userId,
    type: "budget",
    severity,
    message,
    metadata: {
      budgetUsage: Math.round(usage),
      month,
    },
  });
};

// Generate Bill Alerts (7 days, 3 days, 1 day, overdue)
const generateBillAlerts = async (userId) => {
  const now = new Date();
  const bills = await Bill.find({ user: userId, status: { $ne: "paid" } });

  // Remove old bill alerts
  await Alert.deleteMany({ user: userId, type: "bill" });

  for (const bill of bills) {
    const dueDate = new Date(bill.dueDate);
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let severity, message;

    if (diffDays < 0) {
      severity = "high";
      message = `Overdue: ${
        bill.billName
      } was due on ${dueDate.toLocaleDateString()}.`;
    } else if (diffDays === 0) {
      severity = "high";
      message = `${bill.billName} is due today.`;
    } else if (diffDays === 1) {
      severity = "medium";
      message = `${bill.billName} is due tomorrow.`;
    } else if (diffDays <= 3) {
      severity = "medium";
      message = `${bill.billName} is due in ${diffDays} days.`;
    } else if (diffDays <= 7) {
      severity = "low";
      message = `${bill.billName} is due in ${diffDays} days.`;
    } else {
      continue; // No alert needed
    }

    await Alert.create({
      user: userId,
      type: "bill",
      severity,
      message,
      metadata: {
        billId: bill._id,
        billName: bill.billName,
        dueDate: bill.dueDate,
      },
    });
  }
};

// Generate Trend Alerts (20%+ spending increase week-over-week)
const generateTrendAlerts = async (userId) => {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Get this week's expenses
  const thisWeekExpenses = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        type: "expense",
        date: { $gte: oneWeekAgo, $lte: now },
      },
    },
    {
      $group: {
        _id: "$category",
        amount: { $sum: "$amount" },
      },
    },
  ]);

  // Get last week's expenses
  const lastWeekExpenses = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        type: "expense",
        date: { $gte: twoWeeksAgo, $lt: oneWeekAgo },
      },
    },
    {
      $group: {
        _id: "$category",
        amount: { $sum: "$amount" },
      },
    },
  ]);

  // Remove old trend alerts
  await Alert.deleteMany({ user: userId, type: "trend" });

  // Create maps for comparison
  const lastWeekMap = {};
  lastWeekExpenses.forEach((cat) => {
    lastWeekMap[cat._id] = cat.amount;
  });

  // Check for significant increases
  for (const cat of thisWeekExpenses) {
    const category = cat._id;
    const thisWeekAmount = cat.amount;
    const lastWeekAmount = lastWeekMap[category] || 0;

    if (lastWeekAmount === 0) continue;

    const increasePercent =
      ((thisWeekAmount - lastWeekAmount) / lastWeekAmount) * 100;

    if (increasePercent >= 20) {
      await Alert.create({
        user: userId,
        type: "trend",
        severity: increasePercent >= 50 ? "high" : "medium",
        message: `Your ${category} spending increased by ${Math.round(
          increasePercent
        )}% this week.`,
        metadata: {
          category,
          trendPercentage: Math.round(increasePercent),
        },
      });
    }
  }
};

// Generate all alerts for a user
const generateAllAlerts = async (userId) => {
  await Promise.all([
    generateBudgetAlerts(userId),
    generateBillAlerts(userId),
    generateTrendAlerts(userId),
  ]);
};

// Cleanup old alerts (older than 30 days)
const cleanupOldAlerts = async (userId) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await Alert.deleteMany({
    user: userId,
    createdAt: { $lt: thirtyDaysAgo },
  });
};

module.exports = {
  generateBudgetAlerts,
  generateBillAlerts,
  generateTrendAlerts,
  generateAllAlerts,
  cleanupOldAlerts,
};
