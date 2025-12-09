const Transaction = require("../models/Transaction");
const Budget = require("../models/Budget");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

// @desc    Add transaction
// @route   POST /api/transactions
// @access  Private
const addTransaction = asyncHandler(async (req, res) => {
  const { amount, type, category, date, note, mood } = req.body;

  if (!amount || !type || !category || !date) {
    throw new ApiError(400, "Amount, type, category, and date are required");
  }

  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  const transaction = await Transaction.create({
    user: req.user.id,
    amount,
    type,
    category,
    date,
    note,
    mood,
  });

  // Rule 1: Update Budget Module Automatically
  if (type === "expense") {
    const transactionDate = new Date(date);
    const month = `${transactionDate.getFullYear()}-${String(
      transactionDate.getMonth() + 1
    ).padStart(2, "0")}`;

    // Find budget for this user and month (one budget per month)
    const budget = await Budget.findOne({
      user: req.user.id,
      month: month,
    });

    if (budget) {
      budget.spentSoFar += Number(amount);
      await budget.save();
    }
  }

  res
    .status(201)
    .json(new ApiResponse(201, transaction, "Transaction added successfully"));
});

// @desc    Get all transactions with Filters & Pagination
// @route   GET /api/transactions
// @access  Private
const getTransactions = asyncHandler(async (req, res) => {
  // 1. Destructure Query Params
  const {
    page = 1,
    limit = 10,
    search, // searches in 'note' or 'category'
    type, // 'income' or 'expense'
    category,
    startDate,
    endDate,
  } = req.query;

  // 2. Build Query Object
  const query = { user: req.user.id };

  // Filter by Type
  if (type) {
    query.type = type;
  }

  // Filter by Category (exact match)
  if (category) {
    query.category = category;
  }

  // Filter by Date Range
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  // Search Filter (Regex on note or category)
  if (search) {
    query.$or = [
      { note: { $regex: search, $options: "i" } },
      { category: { $regex: search, $options: "i" } },
    ];
  }

  // 3. Pagination Logic
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  // 4. Exec Query
  const transactions = await Transaction.find(query)
    .sort({ date: -1 })
    .skip(skip)
    .limit(limitNum);

  // 5. Build Response Meta
  const total = await Transaction.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        transactions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalPages,
          totalTransactions: total,
        },
      },
      "Transactions fetched successfully"
    )
  );
});

// @desc    Get monthly transactions
// @route   GET /api/transactions/month/:year-:month
// @access  Private
const getMonthlyTransactions = asyncHandler(async (req, res) => {
  const { year, month } = req.params;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const transactions = await Transaction.find({
    user: req.user.id,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: -1 });

  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryBreakdown = {};

  transactions.forEach((txn) => {
    if (txn.type === "income") {
      totalIncome += txn.amount;
    } else {
      totalExpenses += txn.amount;
      if (!categoryBreakdown[txn.category]) {
        categoryBreakdown[txn.category] = 0;
      }
      categoryBreakdown[txn.category] += txn.amount;
    }
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        transactions,
        totalIncome,
        totalExpenses,
        categoryBreakdown,
      },
      "Monthly transactions fetched successfully"
    )
  );
});

// @desc    Delete transaction
// @route   DELETE /api/transactions/:id
// @access  Private
const deleteTransaction = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id);

  if (!transaction) {
    throw new ApiError(404, "Transaction not found");
  }

  // Ensure user owns transaction
  if (transaction.user.toString() !== req.user.id) {
    throw new ApiError(401, "Not authorized to delete this transaction");
  }

  // Rule 1: Update Budget Module Automatically (Revert)
  if (transaction.type === "expense") {
    const transactionDate = new Date(transaction.date);
    const month = `${transactionDate.getFullYear()}-${String(
      transactionDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const budget = await Budget.findOne({
      user: req.user.id,
      month: month,
    });

    if (budget) {
      budget.spentSoFar -= Number(transaction.amount);
      // Prevent negative spentSoFar if logic drifts
      if (budget.spentSoFar < 0) budget.spentSoFar = 0;
      await budget.save();
    }
  }

  await transaction.deleteOne();

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Transaction deleted successfully"));
});

// @desc    Update transaction
// @route   PUT /api/transactions/:id
// @access  Private
const updateTransaction = asyncHandler(async (req, res) => {
  let transaction = await Transaction.findById(req.params.id);

  if (!transaction) {
    throw new ApiError(404, "Transaction not found");
  }

  // Ensure user owns transaction
  if (transaction.user.toString() !== req.user.id) {
    throw new ApiError(401, "Not authorized to update this transaction");
  }

  // 1. Revert Old Budget Impact (if it was an expense)
  if (transaction.type === "expense") {
    const oldDate = new Date(transaction.date);
    const oldMonth = `${oldDate.getFullYear()}-${String(
      oldDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const oldBudget = await Budget.findOne({
      user: req.user.id,
      month: oldMonth,
    });

    if (oldBudget) {
      oldBudget.spentSoFar -= Number(transaction.amount);
      if (oldBudget.spentSoFar < 0) oldBudget.spentSoFar = 0;
      await oldBudget.save();
    }
  }

  // 2. Update Transaction Fields
  // Only update fields that are provided in the body
  const { amount, type, category, date, note, mood } = req.body;

  transaction.amount = amount || transaction.amount;
  transaction.type = type || transaction.type;
  transaction.category = category || transaction.category;
  transaction.date = date || transaction.date;
  transaction.note = note !== undefined ? note : transaction.note;
  transaction.mood = mood !== undefined ? mood : transaction.mood;

  await transaction.save();

  // 3. Apply New Budget Impact (if it is now an expense)
  if (transaction.type === "expense") {
    const newDate = new Date(transaction.date);
    const newMonth = `${newDate.getFullYear()}-${String(
      newDate.getMonth() + 1
    ).padStart(2, "0")}`;

    const newBudget = await Budget.findOne({
      user: req.user.id,
      month: newMonth,
    });

    if (newBudget) {
      newBudget.spentSoFar += Number(transaction.amount);
      await newBudget.save();
    }
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, transaction, "Transaction updated successfully")
    );
});

module.exports = {
  addTransaction,
  getTransactions,
  getMonthlyTransactions,
  deleteTransaction,
  updateTransaction,
};
