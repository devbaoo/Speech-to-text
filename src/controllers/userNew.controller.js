const userNewService = require("../services/userNew.service");

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
