const userNewService = require("../services/userNew.service");
const jwt = require("jsonwebtoken");

// ========================
// GET ALL USERS
// ========================
exports.getAll = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const fromDate = req.query.fromDate || null;
        const toDate = req.query.toDate || null;
        const email = req.query.email || null;

        const result = await userNewService.getUsers(page, limit, { fromDate, toDate, email });

        res.json({
            count: result.count,
            totalCount: result.totalCount,
            totalPages: result.totalPages,
            currentPage: result.currentPage,
            filter: {
                fromDate: req.query.fromDate || null,
                toDate: req.query.toDate || null,
                email: req.query.email || null
            },
            totalContributedSentences: result.totalCompletedSentences,
            totalMale: result.totalMale,
            totalFemale: result.totalFemale,
            totalCompletedSentences: result.totalCompletedSentences,
            data: result.users
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// ========================
// GET USER BY ID
// ========================
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await userNewService.getUserById(id);
        res.json({ count: 1, data: [user] });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// ========================
// CREATE GUEST USER
// ========================
exports.createGuestUser = async (req, res) => {
    try {
        const result = await userNewService.createGuest(req.body);
        const user = result.user || result;

        return res.status(201).json({
            message: "Add user successful",
            userId: user._id
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// ========================
// LOGIN USER
// ========================
exports.loginUser = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await userNewService.loginUser(email);

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

// ========================
// UPDATE USER
// ========================
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const updatedUser = await userNewService.updateUserName(id, name);

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

// ========================
// DELETE USER
// ========================
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedUser = await userNewService.deleteUser(id);

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

// ========================
// SEARCH USER BY EMAIL
// ========================
exports.searchUserByEmail = async (req, res) => {
    try {
        const { email } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const result = await userNewService.searchUserByEmail(email, page, limit);

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

// ========================
// TOP RECORDERS
// ========================
exports.getTopRecorders = async (req, res) => {
    try {
        const { status, limit } = req.query;

        const users = await userNewService.getUsersByRecordingCount(status, limit);

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

// ========================
// TOP SENTENCE CONTRIBUTORS
// ========================
exports.getTopSentenceContributors = async (req, res) => {
    try {
        const { limit } = req.query;
        const lim = limit ? Number(limit) : null;
        const users = await userNewService.getUsersBySentenceCount(lim);

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

// ========================
// TOP CONTRIBUTORS
// ========================
exports.getTopContributors = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);

        const result = await userNewService.getTopContributors(page, limit);

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

// ========================
// TOP SENTENCE RECORDERS
// ========================
exports.getTopSentenceRecorders = async (req, res) => {
    try {
        const { status, limit } = req.query;

        const users = await userNewService.getUsersByUniqueSentenceCount(limit, status);

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

// ========================
// TOTAL USER CONTRIBUTIONS
// ========================
exports.getTotalUserContributions = async (req, res) => {
    try {
        const include = req.query.include === undefined ? true : req.query.include === "true";
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);

        const result = await userNewService.getTotalUserContributions({
            includeSentences: include,
            limit,
            page
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// ========================
// APPROVE RECORDINGS BY EMAIL
// ========================
exports.approveRecordingsByEmail = async (req, res) => {
    try {
        const { email, fromDate, toDate } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const result = await userNewService.approveRecordingsByEmail(email, { fromDate, toDate });

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
