const Transaction = require("../models/Transaction");
const Budget = require("../models/Budget");
const Bill = require("../models/Bill");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

// Helper function to get current month in YYYY-MM format
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Helper function to get remaining days in current month
const getRemainingDays = () => {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const remaining = lastDay.getDate() - now.getDate();
  return remaining;
};

// Helper function to generate AI message based on risk
const generateAIMessage = (riskLevel, percentage) => {
  const overagePercent = Math.round(percentage - 100);

  if (riskLevel === "low") {
    return "You're on track! Based on your past 30 days, you will comfortably stay within your monthly budget.";
  } else if (riskLevel === "medium") {
    return "You may reach your budget limit by the end of the month. Small reductions in daily expenses can help.";
  } else {
    return `Warning! At your current spending pace, you may exceed your monthly budget by ${overagePercent}%. Consider reducing non-essential expenses.`;
  }
};

// @desc    Get AI Spending Forecast
// @route   GET /api/ai/forecast
// @access  Private
const getForecast = asyncHandler(async (req, res) => {
  // 1. Check if user has AI enabled
  const user = await User.findById(req.user.id);

  if (!user.settings?.aiPreferences?.forecast) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "AI Forecast disabled in settings"));
  }

  // 2. Get current month budget
  const month = getCurrentMonth();
  const budget = await Budget.findOne({
    user: req.user.id,
    month,
  });

  if (!budget) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "Please set your monthly budget to enable forecasting"
        )
      );
  }

  // 3. Get last 30 days of expense transactions
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const last30DaysExpenses = await Transaction.find({
    user: req.user.id,
    type: "expense",
    date: { $gte: thirtyDaysAgo },
  });

  if (last30DaysExpenses.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Not enough data to generate forecast"));
  }

  // 4. Calculate daily average
  const totalExpenses = last30DaysExpenses.reduce(
    (sum, txn) => sum + txn.amount,
    0
  );
  const dailyAverage = Math.round(totalExpenses / 30);

  // 5. Calculate remaining days in month
  const remainingDays = getRemainingDays();

  // 6. Predict end-of-month expenses
  const predictedExpenses = budget.spentSoFar + dailyAverage * remainingDays;

  // 7. Calculate difference
  const difference = predictedExpenses - budget.monthlyBudget;

  // 8. Determine risk level
  const percentage = (predictedExpenses / budget.monthlyBudget) * 100;
  let riskLevel = "low";
  if (percentage > 100) {
    riskLevel = "high";
  } else if (percentage > 60) {
    riskLevel = "medium";
  }

  // 9. Generate AI message
  const message = generateAIMessage(riskLevel, percentage);

  // 10. Build response
  const forecast = {
    predictedExpenses: Math.round(predictedExpenses),
    monthlyBudget: budget.monthlyBudget,
    spentSoFar: budget.spentSoFar,
    remainingDays,
    dailyAverage,
    difference: Math.round(difference),
    riskLevel,
    message,
  };

  res
    .status(200)
    .json(
      new ApiResponse(200, { forecast }, "Forecast generated successfully")
    );
});

// @desc    Get AI Financial Personality
// @route   GET /api/ai/personality
// @access  Private
const getPersonality = asyncHandler(async (req, res) => {
  // 1. Check if AI personality enabled
  const user = await User.findById(req.user.id);

  // Check using 'personality' (boolean) as per model definition
  if (!user.settings?.aiPreferences?.personality) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          "AI Personality detection disabled in settings"
        )
      );
  }

  // 2. Get last 90 days of transactions
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await Transaction.find({
    user: req.user.id,
    type: "expense",
    date: { $gte: ninetyDaysAgo },
  });

  if (transactions.length < 5) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Not enough data to detect personality"));
  }

  // 3. Calculate Metrics
  const totalSpending = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  const uniqueCategories = [...new Set(transactions.map((t) => t.category))];
  const highValueCount = transactions.filter((t) => t.amount > 2000).length;

  // Transactions per week (approx 12 weeks in 90 days)
  const txnsPerWeek = transactions.length / 12;

  // Category Breakdown
  const categoryTotals = {};
  transactions.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const categories = Object.keys(categoryTotals)
    .map((cat) => ({
      category: cat,
      percentage: Math.round((categoryTotals[cat] / totalSpending) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const topCategory = categories[0];

  // Budget Usage (for Saver type)
  const currentMonth = getCurrentMonth();
  const currentBudget = await Budget.findOne({
    user: req.user.id,
    month: currentMonth,
  });
  const budgetUsagePercent = currentBudget
    ? (currentBudget.spentSoFar / currentBudget.monthlyBudget) * 100
    : 100; // Default to 100 if no budget to avoid false Saver detection

  // 4. Rule-Based Logic (Priority Order)
  let type = "Balanced Spender";
  let description = "You maintain a healthy balance between needs and wants.";
  let reason =
    "Spending is evenly split across categories with no extreme spikes.";
  let advice = "Stay consistent — consider increasing savings goals.";

  // Priority 1: Impulsive Spender
  if (uniqueCategories.length > 5 && txnsPerWeek > 10) {
    type = "Impulsive Spender";
    description =
      "You make quick purchase decisions and don’t always think ahead.";
    reason =
      "High daily spending frequency and purchases across many different categories.";
    advice =
      "Consider a 24-hour spending rule before buying non-essential items.";
  }
  // Priority 2: Foodie Spender
  else if (categories.find((c) => c.category === "Food" && c.percentage > 30)) {
    type = "Foodie Spender";
    description =
      "You love food experiences and spend a significant part of your budget on meals.";
    reason = "Food is consistently your top spending category (over 30%).";
    advice = "Try meal planning or cooking at home twice a week to save money.";
  }
  // Priority 3: Occasional Big Spender
  else if (txnsPerWeek < 5 && highValueCount > 2) {
    type = "Occasional Big Spender";
    description = "You don’t spend often, but when you do — it’s big.";
    reason =
      "Few transactions overall, but multiple large-value purchases (>2000).";
    advice = "Plan for big purchases in advance to avoid budget pressure.";
  }
  // Priority 4: Category Loyalist
  else if (topCategory.percentage > 60) {
    type = "Category Loyalist";
    description = "You tend to stick to one main spending area each month.";
    reason = `${topCategory.category} dominates your spending, taking up ${topCategory.percentage}% of your expenses.`;
    advice = "Review if this category aligns with your long-term goals.";
  }
  // Priority 5: Saver
  else if (budgetUsagePercent < 50 && txnsPerWeek < 5) {
    type = "Saver";
    description = "You are disciplined and manage your money carefully.";
    reason =
      "Monthly expenses differ significantly from income/budget, with few transaction spikes.";
    advice = "Continue saving — consider investing or long-term planning.";
  }

  // Balanced Spender is default

  res.status(200).json(
    new ApiResponse(
      200,
      {
        personality: {
          type,
          description,
          reason,
          advice,
          topCategories: categories.slice(0, 3), // Return top 3
        },
      },
      "Personality detected successfully"
    )
  );
});

// Helper to determine personality (reused logic)
const determinePersonality = async (userId) => {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await Transaction.find({
    user: userId,
    type: "expense",
    date: { $gte: ninetyDaysAgo },
  });

  if (transactions.length < 5) return null;

  const totalSpending = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  const uniqueCategories = [...new Set(transactions.map((t) => t.category))];
  const highValueCount = transactions.filter((t) => t.amount > 2000).length;
  const txnsPerWeek = transactions.length / 12;

  const categoryTotals = {};
  transactions.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const categories = Object.keys(categoryTotals)
    .map((cat) => ({
      category: cat,
      percentage: Math.round((categoryTotals[cat] / totalSpending) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const topCategory = categories[0];

  // Budget Usage for Saver
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const currentBudget = await Budget.findOne({
    user: userId,
    month: currentMonth,
  });
  const budgetUsagePercent = currentBudget
    ? (currentBudget.spentSoFar / currentBudget.monthlyBudget) * 100
    : 100;

  if (uniqueCategories.length > 5 && txnsPerWeek > 10)
    return "Impulsive Spender";
  if (categories.find((c) => c.category === "Food" && c.percentage > 30))
    return "Foodie Spender";
  if (txnsPerWeek < 5 && highValueCount > 2) return "Occasional Big Spender";
  if (topCategory && topCategory.percentage > 60) return "Category Loyalist";
  if (budgetUsagePercent < 50 && txnsPerWeek < 5) return "Saver";

  return "Balanced Spender";
};

// @desc    Get AI Smart Suggestions
// @route   GET /api/ai/suggestions
// @access  Private
const getSuggestions = asyncHandler(async (req, res) => {
  // 1. Check settings
  const user = await User.findById(req.user.id);
  // Check if key exists, default true if undefined or check explicit false if preference
  // User model default is true for suggestions.
  if (user.settings?.aiPreferences?.suggestions === false) {
    return res
      .status(200)
      .json(
        new ApiResponse(200, {}, "AI Suggestions are turned off in settings")
      );
  }

  const suggestions = [];
  const userId = req.user.id;

  // 2. Fetch Data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const transactions = await Transaction.find({
    user: userId,
    type: "expense",
    date: { $gte: thirtyDaysAgo },
  });

  if (transactions.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Not enough data for AI suggestions"));
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
  const budget = await Budget.findOne({ user: userId, month: currentMonth });

  const upcomingBills = await Bill.find({
    user: userId,
    status: "pending",
    dueDate: {
      $gte: now,
      $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    }, // Next 7 days
  });

  // 3. Rule Engine

  // Rule 1: Category Analysis
  const totalSpending = transactions.reduce((sum, t) => sum + t.amount, 0);
  const categoryTotals = {};
  transactions.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  Object.entries(categoryTotals).forEach(([cat, amount]) => {
    const pct = (amount / totalSpending) * 100;
    if (pct > 25) {
      suggestions.push({
        title: `Reduce ${cat} Spending`,
        description: `${cat} category makes up ${Math.round(
          pct
        )}% of your monthly spending. Try reducing expenses here.`,
        reason: `High ${cat} category spending`,
      });
    }
  });

  // Rule 2: Budget Health
  if (budget) {
    const usage = (budget.spentSoFar / budget.monthlyBudget) * 100;
    if (usage > 100) {
      suggestions.push({
        title: "Spending Freeze Recommended",
        description:
          "You have exceeded your monthly budget. Consider a 3-day spending freeze.",
        reason: "Budget exceeded",
      });
    } else if (usage > 80) {
      suggestions.push({
        title: "Budget Alert",
        description: `You've used ${Math.round(
          usage
        )}% of your monthly budget. Reduce daily spending to avoid overshooting.`,
        reason: "High budget usage",
      });
    }
  }

  // Rule 3: Personality Tips
  const personality = await determinePersonality(userId);
  if (personality) {
    if (personality === "Impulsive Spender") {
      suggestions.push({
        title: "Control Impulse Purchases",
        description: "Limit yourself to one non-essential purchase per week.",
        reason: "Impulsive spending pattern detected",
      });
    } else if (personality === "Foodie Spender") {
      suggestions.push({
        title: "Cook More, Order Less",
        description: "Cook at home twice a week to reduce food expenses.",
        reason: "Foodie spending pattern detected",
      });
    } else if (personality === "Occasional Big Spender") {
      suggestions.push({
        title: "Plan Big Purchases",
        description: "Plan big purchases 14 days ahead to avoid budget stress.",
        reason: "Large purchase pattern detected",
      });
    } else if (personality === "Saver") {
      suggestions.push({
        title: "Invest Your Savings",
        description:
          "Excellent discipline. Consider investing your leftover savings.",
        reason: "Saver personality detected",
      });
    }
  }

  // Rule 4: High frequency
  // (Simple check: avg txns per day)
  const txnsPerDay = transactions.length / 30; // Approx
  if (txnsPerDay > 4) {
    suggestions.push({
      title: "High Daily Spending",
      description:
        "Your daily spending frequency is high. Set categories to Essentials vs Non-Essentials.",
      reason: "High frequency spending",
    });
  }

  // Rule 5: High Value
  const highValueTxns = transactions.filter((t) => t.amount > 3000);
  if (highValueTxns.length > 1) {
    const totalHigh = highValueTxns.reduce((sum, t) => sum + t.amount, 0);
    suggestions.push({
      title: "Large Purchase Alert",
      description: `Your large purchases this month total ${totalHigh}. Try spacing them out.`,
      reason: "Multiple high-value purchases",
    });
  }

  // Rule 7: Upcoming Bills
  upcomingBills.forEach((bill) => {
    const daysLeft = Math.ceil(
      (new Date(bill.dueDate) - now) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft <= 4 && daysLeft >= 0) {
      suggestions.push({
        title: "Upcoming Bill Alert",
        description: `Your ${bill.billName} is due in ${daysLeft} days. Keep extra ${bill.amount} saved.`,
        reason: "Upcoming bill detected",
      });
    }
  });

  res
    .status(200)
    .json(new ApiResponse(200, { suggestions }, "Smart suggestions generated"));
});

// @desc    Get AI Mood Insights
// @route   GET /api/ai/mood-insights
// @access  Private
const getMoodInsights = asyncHandler(async (req, res) => {
  // 1. Fetch Transactions with Mood data (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await Transaction.find({
    user: req.user.id,
    type: "expense",
    date: { $gte: ninetyDaysAgo },
    mood: { $exists: true, $ne: null }, // Only get transactions with mood
  });

  if (transactions.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "No mood data available"));
  }

  // 2. Aggregate Data
  const moodStats = {};
  const hourStats = {};

  transactions.forEach((txn) => {
    // Group by Mood
    if (!moodStats[txn.mood]) {
      moodStats[txn.mood] = {
        count: 0,
        categories: {},
      };
    }
    moodStats[txn.mood].count++;
    moodStats[txn.mood].categories[txn.category] =
      (moodStats[txn.mood].categories[txn.category] || 0) + 1;

    // Group by Hour for Peak Time
    const hour = new Date(txn.date).getHours(); // Note: 'date' in DB might be 00:00:00 if just datepicker used.
    // Logic assumes timestamps are preserved. If not, this might need refinement.
    // Assuming frontend sends full ISO string.
    hourStats[hour] = (hourStats[hour] || 0) + 1;
  });

  // 3. Find Top Mood and Patterns
  let topMood = "";
  let maxCount = 0;
  const totalMoodTxns = transactions.length;

  Object.entries(moodStats).forEach(([mood, data]) => {
    if (data.count > maxCount) {
      maxCount = data.count;
      topMood = mood;
    }
  });

  // 4. Generate Patterns
  const moodEmojis = {
    happy: "😊",
    sad: "😔",
    angry: "😤",
    stressed: "😓",
    bored: "😐",
    excited: "🤩",
    neutral: "😐",
  };

  const patterns = Object.entries(moodStats)
    .map(([mood, data]) => {
      // Find top category for this mood
      const topCat = Object.entries(data.categories).sort(
        (a, b) => b[1] - a[1]
      )[0][0];
      const percentage = Math.round((data.count / totalMoodTxns) * 100);

      return {
        mood: moodEmojis[mood] || "❓",
        label: mood.charAt(0).toUpperCase() + mood.slice(1),
        category: topCat,
        percentage,
      };
    })
    .sort((a, b) => b.percentage - a.percentage); // Sort by prevalence

  // 5. Find Peak Hours
  const topHour = Object.entries(hourStats).sort((a, b) => b[1] - a[1])[0];
  let peakHours = "N/A";

  if (topHour) {
    const hour = parseInt(topHour[0]);
    const endHour = (hour + 3) % 24;
    // Simple formatter
    const formatTime = (h) => {
      const ampm = h >= 12 ? "pm" : "am";
      const h12 = h % 12 || 12;
      return `${h12}${ampm}`;
    };
    peakHours = `${formatTime(hour)} - ${formatTime(endHour)}`;
  }

  // 6. Build Description
  const topPattern = patterns.find((p) => p.label.toLowerCase() === topMood);

  const description = topPattern
    ? `You mostly spend on ${topPattern.category} when feeling ${topMood}.`
    : `You spend most frequently when feeling ${topMood}.`;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        topMood: moodEmojis[topMood] || "❓",
        moodLabel: topMood.charAt(0).toUpperCase() + topMood.slice(1),
        description,
        patterns,
        peakHours,
      },
      "Mood insights generated"
    )
  );
});

// @desc    Get AI Spending Challenges
// @route   GET /api/ai/challenges
// @access  Private
const getChallenges = asyncHandler(async (req, res) => {
  // 1. Fetch recent transactions (last 30 days) to personalize
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const transactions = await Transaction.find({
    user: req.user.id,
    type: "expense",
    date: { $gte: thirtyDaysAgo },
  });

  // 2. Determine Top Categories
  const categoryTotals = {};
  transactions.forEach((t) => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const sortedExps = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const topCategories = sortedExps.slice(0, 3).map((i) => i[0]); // Top 3 categories

  // 3. Challenge Repository
  const challengePool = {
    Food: [
      {
        title: "No Food Delivery Challenge",
        desc: "Avoid ordering food delivery for 3 consecutive days",
        icon: "🍕",
        duration: "3 days",
      },
      {
        title: "Coffee at Home",
        desc: "Make your own coffee instead of buying it for a week",
        icon: "☕",
        duration: "7 days",
      },
      {
        title: "Meal Prep Sunday",
        desc: "Prep all your lunches for the week on Sunday",
        icon: "🍱",
        duration: "7 days",
      },
    ],
    Shopping: [
      {
        title: "No New Clothes",
        desc: "Do not buy any new clothes for 2 weeks",
        icon: "👗",
        duration: "14 days",
      },
      {
        title: "24-Hour Rule",
        desc: "Wait 24 hours before making any non-essential purchase",
        icon: "⏳",
        duration: "7 days",
      },
    ],
    Transport: [
      {
        title: "Walk More",
        desc: "Walk for short trips instead of taking a cab",
        icon: "🚶",
        duration: "7 days",
      },
      {
        title: "Public Transport Week",
        desc: "Use public transport instead of ride-hailing apps",
        icon: "🚌",
        duration: "7 days",
      },
    ],
    Entertainment: [
      {
        title: "Free Fun Weekend",
        desc: "Find free entertainment activities this weekend",
        icon: "🎉",
        duration: "2 days",
      },
      {
        title: "Entertainment Cap",
        desc: "Keep entertainment spending under limit",
        icon: "🎮",
        duration: "7 days",
      },
    ],
    General: [
      {
        title: "Zero Spend Day",
        desc: "Go a full day without spending a single rupee",
        icon: "🚫",
        duration: "1 day",
      },
      {
        title: "Savings Sprint",
        desc: "Save 500 daily for 5 days",
        icon: "💰",
        duration: "5 days",
      },
    ],
  };

  // 4. Generate Personalized Challenges
  let challenges = [];
  let idCounter = 1;

  // A. Add Category-Specific Challenges
  topCategories.forEach((cat) => {
    const catChallenges = challengePool[cat];
    if (catChallenges) {
      // Pick random 1 from category
      const challenge =
        catChallenges[Math.floor(Math.random() * catChallenges.length)];

      // Calculate dynamic expected save (approx 20% of weekly avg or fixed)
      // Just simplifying: 15% of monthly spend on that category / 4 (for 1 week)
      const monthlySpend = categoryTotals[cat];
      let expectedSave = Math.round((monthlySpend * 0.15) / 4);
      if (expectedSave < 100) expectedSave = 500; // Min

      challenges.push({
        id: idCounter++,
        title: challenge.title,
        description: challenge.desc,
        expectedSave,
        duration: challenge.duration,
        difficulty: "Medium",
        icon: challenge.icon,
        status: "available",
      });
    }
  });

  // B. Fill with General Challenges if not enough
  if (challenges.length < 2) {
    const generalPool = challengePool["General"];
    const genChallenge =
      generalPool[Math.floor(Math.random() * generalPool.length)];
    challenges.push({
      id: idCounter++,
      title: genChallenge.title,
      description: genChallenge.desc,
      expectedSave: 500,
      duration: genChallenge.duration,
      difficulty: "Easy",
      icon: genChallenge.icon,
      status: "available",
    });
  }

  // Limit to 2-3 challenges
  challenges = challenges.slice(0, 3);

  res
    .status(200)
    .json(
      new ApiResponse(200, { challenges }, "Challenges generated successfully")
    );
});

module.exports = {
  getForecast,
  getPersonality,
  getSuggestions,
  getMoodInsights,
  getChallenges,
};
