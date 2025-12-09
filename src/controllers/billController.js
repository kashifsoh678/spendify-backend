const Bill = require("../models/Bill");
const { asyncHandler } = require("../utils/asyncHandler");
const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

// Helper function to calculate bill fields
const calculateBillFields = (bill) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(bill.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate - today;
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isOverdue = daysLeft < 0;

  let alertLevel = "none";
  if (isOverdue) {
    alertLevel = "overdue";
  } else if (daysLeft <= 2) {
    alertLevel = "danger";
  } else if (daysLeft <= 5) {
    alertLevel = "warning";
  }

  return {
    _id: bill._id,
    billName: bill.billName,
    amount: bill.amount,
    dueDate: bill.dueDate,
    status: bill.status,
    daysLeft,
    isOverdue,
    alertLevel,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
};

// @desc    Create Bill
// @route   POST /api/bills
// @access  Private
const createBill = asyncHandler(async (req, res) => {
  const { billName, amount, dueDate, status } = req.body;

  if (!billName || !amount || !dueDate) {
    throw new ApiError(400, "Bill name, amount, and due date are required");
  }

  if (amount <= 0) {
    throw new ApiError(400, "Amount must be greater than 0");
  }

  const bill = await Bill.create({
    user: req.user.id,
    billName,
    amount,
    dueDate,
    status: status || "pending",
  });

  const billData = calculateBillFields(bill);

  res
    .status(201)
    .json(new ApiResponse(201, { bill: billData }, "Bill added successfully"));
});

// @desc    Get All Bills with Filters & Pagination
// @route   GET /api/bills
// @access  Private
const getAllBills = asyncHandler(async (req, res) => {
  // 1. Destructure Query Params
  const {
    page = 1,
    limit = 10,
    search, // searches in 'billName'
    status, // 'pending' or 'paid'
    startDate,
    endDate,
  } = req.query;

  // 2. Build Query Object
  const query = { user: req.user.id };

  // Filter by Status
  if (status) {
    query.status = status;
  }

  // Filter by Date Range (dueDate)
  if (startDate || endDate) {
    query.dueDate = {};
    if (startDate) query.dueDate.$gte = new Date(startDate);
    if (endDate) query.dueDate.$lte = new Date(endDate);
  }

  // Search Filter (Regex on billName)
  if (search) {
    query.billName = { $regex: search, $options: "i" };
  }

  // 3. Pagination Logic
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  // 4. Exec Query
  const bills = await Bill.find(query).skip(skip).limit(limitNum);

  // 5. Calculate fields for all bills
  const billsWithFields = bills.map(calculateBillFields);

  // 6. Sort: overdue first, then by nearest due date
  billsWithFields.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.daysLeft - b.daysLeft;
  });

  // 7. Build Response Meta
  const total = await Bill.countDocuments(query);
  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        bills: billsWithFields,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalPages,
          totalBills: total,
        },
      },
      "Bills fetched successfully"
    )
  );
});

// @desc    Get Upcoming Bills (next 7 days + overdue)
// @route   GET /api/bills/upcoming
// @access  Private
const getUpcomingBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({
    user: req.user.id,
    status: "pending", // Only pending bills
  });

  // Calculate fields
  const billsWithFields = bills.map(calculateBillFields);

  // Filter: upcoming (≤7 days) or overdue
  const upcomingBills = billsWithFields.filter(
    (bill) => bill.daysLeft <= 7 || bill.isOverdue
  );

  // Sort: overdue first, then nearest
  upcomingBills.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.daysLeft - b.daysLeft;
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { upcoming: upcomingBills },
        "Upcoming bills fetched successfully"
      )
    );
});

// @desc    Mark Bill as Paid
// @route   PUT /api/bills/:id/paid
// @access  Private
const markBillAsPaid = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);

  if (!bill) {
    throw new ApiError(404, "Bill not found");
  }

  // Ensure user owns bill
  if (bill.user.toString() !== req.user.id) {
    throw new ApiError(401, "Not authorized to update this bill");
  }

  bill.status = "paid";
  await bill.save();

  const billData = calculateBillFields(bill);

  res
    .status(200)
    .json(new ApiResponse(200, { bill: billData }, "Bill marked as paid"));
});

// @desc    Delete Bill
// @route   DELETE /api/bills/:id
// @access  Private
const deleteBill = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id);

  if (!bill) {
    throw new ApiError(404, "Bill not found");
  }

  // Ensure user owns bill
  if (bill.user.toString() !== req.user.id) {
    throw new ApiError(401, "Not authorized to delete this bill");
  }

  await bill.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, "Bill deleted successfully"));
});

module.exports = {
  createBill,
  getAllBills,
  getUpcomingBills,
  markBillAsPaid,
  deleteBill,
};
