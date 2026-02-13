const userService = require("../services/person.service");
const jwt = require("jsonwebtoken");

exports.createGuestUser = async (req, res) => {
  try {
    const result = await userService.createGuest(req.body);
    const user = result.user || result;

    return res.status(201).json({
      message: "Add user successful",
      userId: user._id
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// User login by email (returns JWT)
exports.loginUser = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await userService.loginUser(email);

    const token = jwt.sign(
      {
        role: "User",
        userId: user._id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    res.json({
      message: "Login user success",
      token
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


exports.getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    // Filter by time (fromDate, toDate) - hỗ trợ datetime (ngày + giờ)
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;

    const result = await userService.getUsers(page, limit, { fromDate, toDate });
    const totalContributions = await userService.getTotalUserContributions({
      includeSentences: false,
      limit,
      page
    });
    res.json({
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      filter: {
        fromDate: req.query.fromDate || null,
        toDate: req.query.toDate || null
      },
      totalContributedSentences: totalContributions.totalContributed,
      totalMale: result.totalMale,
      totalFemale: result.totalFemale,
      totalCompletedSentences: result.totalCompletedSentences,
      data: result.users
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedUser = await userService.updateUserName(id, name);

    res.json({
      message: "User updated successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        gender: updatedUser.gender
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedUser = await userService.deleteUser(id);

    res.json({
      message: "User deleted successfully",
      deletedUser: {
        id: deletedUser._id,
        name: deletedUser.name
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getTopRecorders = async (req, res) => {
  try {
    const { status, limit } = req.query;

    const users = await userService.getUsersByRecordingCount(status, limit);

    res.json({
      filter: {
        status: status ? Number(status) : null,
        limit
      },
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get top users by sentence contributions (only sentences with status 1,2,3)
exports.getTopSentenceContributors = async (req, res) => {
  try {
    const { limit } = req.query;
    const lim = limit ? Number(limit) : null;
    const users = await userService.getUsersBySentenceCount(lim);

    res.json({
      filter: {
        limit: lim
      },
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Top contributors (descending by TotalContributedSentences)
exports.getTopContributors = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 10);

    const result = await userService.getTopContributors(page, limit);

    res.json({
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      data: result.users
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get top users by number of distinct sentences they recorded
exports.getTopSentenceRecorders = async (req, res) => {
  try {
    const { status, limit } = req.query;

    const users = await userService.getUsersByUniqueSentenceCount(limit,status);

    res.json({
      filter: {
        status: status !== undefined ? Number(status) : null,
        limit
      },
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Total number of sentences contributed by users
exports.getTotalUserContributions = async (req, res) => {
  try {
    const include = req.query.include === undefined ? true : req.query.include === "true";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const result = await userService.getTotalUserContributions({
      includeSentences: include,
      limit,
      page
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id);
    res.json({ count: 1, data: [user] });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Approve all recordings by email (with optional date filter)
exports.approveRecordingsByEmail = async (req, res) => {
  try {
    const { email, fromDate, toDate } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const result = await userService.approveRecordingsByEmail(email, { fromDate, toDate });

    res.json({
      message: `Approved ${result.modifiedCount} recordings successfully`,
      email,
      filter: {
        fromDate: fromDate || null,
        toDate: toDate || null
      },
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Search users by email
exports.searchUserByEmail = async (req, res) => {
  try {
    const { email } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const result = await userService.searchUserByEmail(email, page, limit);

    res.json({
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      searchEmail: result.searchEmail,
      data: result.users
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
