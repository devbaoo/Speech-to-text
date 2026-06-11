const UserNew = require("../models/userNew");
const NewRecording = require("../models/newRecording");
const NewSentence = require("../models/newSentence");

// ========================
// GET ALL USERS
// ========================
exports.getUsers = async (page = 1, limit = 20, filter = {}) => {
    const skip = (page - 1) * limit;
    const { fromDate, toDate, email } = filter;

    const dateQuery = {};
    if (fromDate) dateQuery.$gte = new Date(fromDate);
    if (toDate) dateQuery.$lte = new Date(toDate);

    const emailQuery = {};
    if (email) {
        emailQuery.$regex = email;
        emailQuery.$options = "i";
    }

    const userFindQuery = Object.keys(emailQuery).length ? { email: emailQuery } : {};
    const allRows = await UserNew.find(userFindQuery)
        .select("email name gender role createdAt")
        .lean();

    const totalCount = allRows.length;
    const totalMale = await UserNew.countDocuments({ gender: "Male" });
    const totalFemale = await UserNew.countDocuments({ gender: "Female" });

    // Global stats: tổng số recording đã duyệt trong new_recording
    const totalCompletedSentencesAgg = await NewRecording.aggregate([
        { $match: { isApproved: 1 } },
        { $group: { _id: null, totalCount: { $sum: 1 } } }
    ]);
    const totalCompletedSentences = totalCompletedSentencesAgg[0]?.totalCount || 0;

    if (!allRows.length) {
        return {
            users: [],
            count: 0,
            totalCount: 0,
            totalPages: 0,
            currentPage: page,
            totalMale,
            totalFemale,
            totalCompletedSentences
        };
    }

    const allUserIds = allRows.map(r => r._id);

    // Get recordings stats for ALL users from new_recording
    const recordingMatch = { personId: { $in: allUserIds }, isApproved: { $in: [0, 1] } };
    if (Object.keys(dateQuery).length) recordingMatch.recordedAt = dateQuery;

    const recordingStats = await NewRecording.aggregate([
        { $match: recordingMatch },
        {
            $group: {
                _id: "$personId",
                recordingCount: { $sum: 1 },
                totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
                approvedCount: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] } },
                pendingCount: { $sum: { $cond: [{ $eq: ["$isApproved", 0] }, 1, 0] } },
                approvedDuration: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, { $ifNull: ["$duration", 0] }, 0] } }
            }
        }
    ]);

    const recordingMap = {};
    recordingStats.forEach(stat => {
        recordingMap[stat._id.toString()] = {
            count: stat.recordingCount,
            duration: stat.totalDuration,
            approvedCount: stat.approvedCount,
            pendingCount: stat.pendingCount,
            approvedDuration: stat.approvedDuration
        };
    });

    // Get sentence contributions for ALL users from new_sentence
    const contributionStats = await NewSentence.aggregate([
        {
            $match: {
                createdBy: { $in: allRows.map(r => r.email) }
            }
        },
        { $group: { _id: "$createdBy", count: { $sum: 1 } } }
    ]);

    const contributionMap = {};
    contributionStats.forEach(stat => {
        contributionMap[stat._id] = stat.count;
    });

    const allUsersWithStats = allRows.map(u => ({
        ...u,
        TotalRecordings: recordingMap[u._id.toString()]?.count || 0,
        TotalRecordingDuration: recordingMap[u._id.toString()]?.duration || 0,
        ApprovedRecordings: recordingMap[u._id.toString()]?.approvedCount || 0,
        PendingRecordings: recordingMap[u._id.toString()]?.pendingCount || 0,
        TotalApprovedRecordingDuration: recordingMap[u._id.toString()]?.approvedDuration || 0,
        TotalSentenceContributions: contributionMap[u.email] || 0
    }));

    allUsersWithStats.sort((a, b) => b.TotalRecordings - a.TotalRecordings);

    const paginatedUsers = allUsersWithStats.slice(skip, skip + limit);
    const paginatedUserIds = paginatedUsers.map(u => u._id);
    const paginatedUserEmails = paginatedUsers.map(u => u.email);

    const userRecordingsMap = {};
    for (const userId of paginatedUserIds) {
        const recQuery = {
            personId: userId,
            isApproved: { $in: [0, 1] }
        };
        if (Object.keys(dateQuery).length) recQuery.recordedAt = dateQuery;

        const userRecordings = await NewRecording.find(recQuery)
            .populate("sentenceId", "domainCode topic sentenceOrder content")
            .select("sentenceId duration recordedAt audioUrl isApproved type")
            .sort({ recordedAt: -1 })
            .lean();

        userRecordingsMap[userId.toString()] = userRecordings.map(r => ({
            SentenceID: r.sentenceId?._id || r.sentenceId,
            Content: r.sentenceId?.content || null,
            Duration: r.duration || null,
            RecordedAt: r.recordedAt,
            AudioUrl: r.audioUrl || null,
            IsApproved: r.isApproved,
            Type: r.type || null
        }));
    }

    const userContributionsMap = {};
    for (const userEmail of paginatedUserEmails) {
        const userSentences = await NewSentence.find({
            createdBy: userEmail
        })
            .select("domainCode topic sentenceOrder content status createdAt")
            .lean();

        userContributionsMap[userEmail] = userSentences.map(s => ({
            SentenceID: s._id,
            DomainCode: s.domainCode,
            Topic: s.topic,
            SentenceOrder: s.sentenceOrder,
            Content: s.content,
            Status: s.status,
            CreatedAt: s.createdAt
        }));
    }

    const users = paginatedUsers.map(u => ({
        _id: u._id,
        email: u.email,
        name: u.name || '',
        gender: u.gender,
        role: u.role,
        createdAt: u.createdAt,
        TotalRecordings: u.TotalRecordings,
        TotalRecordingDuration: u.TotalRecordingDuration,
        ApprovedRecordings: u.ApprovedRecordings,
        PendingRecordings: u.PendingRecordings,
        TotalApprovedRecordingDuration: u.TotalApprovedRecordingDuration,
        TotalSentenceContributions: u.TotalSentenceContributions,
        Recordings: userRecordingsMap[u._id.toString()] || [],
        SentenceContributions: userContributionsMap[u.email] || []
    }));

    return {
        users,
        count: users.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        totalMale,
        totalFemale,
        totalCompletedSentences
    };
};

// ========================
// GET USER BY ID
// ========================
exports.getUserById = async (userId) => {
    if (!userId) throw new Error("userId is required");
    const user = await UserNew.findById(userId).lean();
    if (!user) throw new Error("User not found");

    // approved recordings by this user
    const recAgg = await NewRecording.aggregate([
        { $match: { personId: user._id, isApproved: 1 } },
        { $group: { _id: "$sentenceId", count: { $sum: 1 } } }
    ]);
    const sentenceIds = recAgg.map(r => r._id);
    const sentenceDocs = sentenceIds.length ? await NewSentence.find({ _id: { $in: sentenceIds } }).select("domainCode topic sentenceOrder content") : [];
    const sentenceById = {};
    sentenceDocs.forEach(s => { sentenceById[s._id.toString()] = s; });
    const sentencesDone = recAgg.map(r => ({
        SentenceID: r._id,
        DomainCode: sentenceById[r._id.toString()]?.domainCode || null,
        Topic: sentenceById[r._id.toString()]?.topic || null,
        Content: sentenceById[r._id.toString()]?.content || null
    }));

    const uniqueCount = sentenceIds.length;

    const durationAgg = await NewRecording.aggregate([
        { $match: { personId: user._id, isApproved: 1 } },
        { $group: { _id: null, totalDuration: { $sum: { $ifNull: ["$duration", 0] } } } }
    ]);
    const totalDuration = (durationAgg[0] && durationAgg[0].totalDuration) || 0;

    // created sentences by this user
    const createdDocs = await NewSentence.find({ createdBy: user.email })
        .select("domainCode topic sentenceOrder content status createdAt")
        .sort({ createdAt: -1 })
        .lean();
    const createdCount = createdDocs.length;
    const createdList = createdDocs.map(s => ({
        SentenceID: s._id,
        DomainCode: s.domainCode,
        Topic: s.topic,
        SentenceOrder: s.sentenceOrder,
        Content: s.content,
        Status: s.status,
        CreatedAt: s.createdAt
    }));

    return {
        PersonID: user._id,
        Email: user.email,
        Gender: user.gender,
        Role: user.role,
        CreatedAt: user.createdAt,
        SentencesDone: sentencesDone,
        TotalRecordingDuration: totalDuration,
        TotalSentencesDone: uniqueCount,
        TotalContributedByUser: createdCount,
        CreatedSentences: createdList
    };
};

// ========================
// CREATE USER
// ========================
exports.createGuest = async (data) => {
    const email = data.email.trim().toLowerCase();
    const allUsers = await UserNew.find({}, "email");
    const existingUser = allUsers.find((user) => user.email === email);

    if (existingUser) {
        return { user: await UserNew.findOne({ _id: existingUser._id }), existed: true };
    }

    const created = await UserNew.create({
        email,
        name: data.name || '',
        gender: data.gender,
        role: "User",
    });
    return { user: created, existed: false };
};

// ========================
// LOGIN USER
// ========================
exports.loginUser = async (email) => {
    if (!email) throw new Error("Email is required");
    const normalized = email.trim().toLowerCase();
    const user = await UserNew.findOne({ email: normalized });
    if (!user) throw new Error("User not found");
    return user;
};

// ========================
// UPDATE USER
// ========================
exports.updateUserName = async (id, newName) => {
    if (!newName || newName.trim() === "") {
        throw new Error("Tên không được rỗng");
    }

    const trimmedName = newName.trim();
    const allUsers = await UserNew.find({ _id: { $ne: id } }, 'name');
    const existingUser = allUsers.find(user =>
        user.name && user.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingUser) {
        throw new Error("Tên người dùng đã tồn tại");
    }

    const updatedUser = await UserNew.findByIdAndUpdate(
        id,
        { name: trimmedName },
        { new: true }
    );

    if (!updatedUser) {
        throw new Error("User không tồn tại");
    }

    return updatedUser;
};

// ========================
// DELETE USER
// ========================
exports.deleteUser = async (id) => {
    const deletedUser = await UserNew.findByIdAndDelete(id);

    if (!deletedUser) {
        throw new Error("User không tồn tại");
    }

    return deletedUser;
};

// ========================
// SEARCH USER BY EMAIL
// ========================
exports.searchUserByEmail = async (email, page = 1, limit = 20) => {
    if (!email || email.trim() === "") {
        throw new Error("Email is required");
    }

    const skip = (page - 1) * limit;

    const query = {
        email: { $regex: email.trim(), $options: "i" }
    };

    const users = await UserNew.find(query)
        .select("email name gender role createdAt")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

    const totalCount = await UserNew.countDocuments(query);

    const userIds = users.map(u => u._id);

    const recordingStats = await NewRecording.aggregate([
        { $match: { personId: { $in: userIds }, isApproved: { $in: [0, 1] } } },
        {
            $group: {
                _id: "$personId",
                recordingCount: { $sum: 1 },
                totalDuration: { $sum: { $ifNull: ["$duration", 0] } },
                approvedCount: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] } },
                pendingCount: { $sum: { $cond: [{ $eq: ["$isApproved", 0] }, 1, 0] } }
            }
        }
    ]);

    const statsMap = {};
    recordingStats.forEach(stat => {
        statsMap[stat._id.toString()] = stat;
    });

    const result = users.map(user => {
        const stats = statsMap[user._id.toString()] || {};
        return {
            _id: user._id,
            email: user.email,
            name: user.name || '',
            gender: user.gender,
            role: user.role,
            createdAt: user.createdAt,
            recordingCount: stats.recordingCount || 0,
            approvedCount: stats.approvedCount || 0,
            pendingCount: stats.pendingCount || 0,
            totalDuration: stats.totalDuration || 0
        };
    });

    return {
        users: result,
        count: result.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        searchEmail: email.trim()
    };
};

// ========================
// TOP RECORDERS
// ========================
exports.getUsersByRecordingCount = async (statusFilter = null, limit = 10) => {
    const matchCondition = {};
    if (statusFilter !== null) {
        matchCondition.isApproved = Number(statusFilter);
    }

    const recordingStats = await NewRecording.aggregate([
        { $match: matchCondition },
        {
            $group: {
                _id: "$personId",
                recordingCount: { $sum: 1 },
                approvedCount: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] } },
                pendingCount: { $sum: { $cond: [{ $eq: ["$isApproved", 0] }, 1, 0] } },
                rejectedCount: { $sum: { $cond: [{ $eq: ["$isApproved", 2] }, 1, 0] } }
            }
        },
        { $sort: { recordingCount: -1 } },
        { $limit: Number(limit) || 10 }
    ]);

    const userIds = recordingStats.map(stat => stat._id);
    const users = await UserNew.find({ _id: { $in: userIds } });

    return recordingStats.map(stat => {
        const user = users.find(u => u._id.toString() === stat._id.toString());
        return {
            _id: user?._id,
            email: user?.email,
            name: user?.name || '',
            gender: user?.gender,
            totalRecordings: stat.recordingCount,
            approvedRecordings: stat.approvedCount,
            pendingRecordings: stat.pendingCount,
            rejectedRecordings: stat.rejectedCount,
            createdAt: user?.createdAt
        };
    });
};

// ========================
// TOP SENTENCE CONTRIBUTORS
// ========================
exports.getUsersBySentenceCount = async (limit = null) => {
    const pipeline = [
        { $match: { createdBy: { $ne: null } } },
        {
            $group: {
                _id: "$createdBy",
                sentenceCount: { $sum: 1 },
                status0Count: { $sum: { $cond: [{ $eq: ["$status", 0] }, 1, 0] } },
                status1Count: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } }
            }
        },
        { $sort: { sentenceCount: -1 } }
    ];
    if (limit && Number(limit) > 0) {
        pipeline.push({ $limit: Number(limit) });
    }

    const stats = await NewSentence.aggregate(pipeline);

    const statsMap = {};
    stats.forEach(s => {
        statsMap[s._id] = {
            totalSentences: s.sentenceCount,
            status0Count: s.status0Count,
            status1Count: s.status1Count
        };
    });

    const users = await UserNew.find().select("email name gender role createdAt");

    const results = [];
    for (const user of users) {
        const email = user.email;
        const stat = statsMap[email] || { totalSentences: 0, status0Count: 0, status1Count: 0 };
        const userId = user._id;

        results.push({
            _id: userId,
            email: email,
            name: user.name || '',
            gender: user.gender,
            totalSentences: stat.totalSentences,
            status0Count: stat.status0Count,
            status1Count: stat.status1Count,
            createdAt: user.createdAt || null
        });
    }

    return results;
};

// ========================
// TOP CONTRIBUTORS (by TotalRecordings)
// ========================
exports.getTopContributors = async (page = 1, limit = 10) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
    const skip = (safePage - 1) * safeLimit;

    const baseMatch = {
        createdBy: { $ne: null }
    };

    const allStats = await NewSentence.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: "$createdBy",
                TotalContributedSentences: { $sum: 1 }
            }
        }
    ]);

    const totalCount = allStats.length;

    if (totalCount === 0) {
        return {
            users: [],
            count: 0,
            totalCount: 0,
            totalPages: 0,
            currentPage: safePage
        };
    }

    const allEmails = allStats.map(s => s._id).filter(Boolean);
    const allUsers = allEmails.length
        ? await UserNew.find({ email: { $in: allEmails } }).select("email name gender role createdAt").lean()
        : [];

    const userByEmail = {};
    allUsers.forEach(u => {
        userByEmail[u.email] = u;
    });

    const allUserIds = allUsers.map(u => u._id);
    const allRecordingStats = allUserIds.length
        ? await NewRecording.aggregate([
            { $match: { personId: { $in: allUserIds } } },
            {
                $group: {
                    _id: "$personId",
                    TotalRecordings: { $sum: 1 },
                    ApprovedRecordings: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] } }
                }
            }
        ])
        : [];

    const recordingMap = {};
    allRecordingStats.forEach(stat => {
        recordingMap[stat._id.toString()] = {
            TotalRecordings: stat.TotalRecordings || 0,
            ApprovedRecordings: stat.ApprovedRecordings || 0
        };
    });

    const allUserData = allStats.map(s => {
        const email = s._id;
        const u = userByEmail[email] || null;
        const recordingInfo = u?._id ? recordingMap[u._id.toString()] : null;
        return {
            _id: u?._id || null,
            email,
            name: u?.name || '',
            gender: u?.gender || null,
            role: u?.role || null,
            createdAt: u?.createdAt || null,
            TotalContributedSentences: s.TotalContributedSentences || 0,
            TotalRecordings: recordingInfo?.TotalRecordings || 0,
            ApprovedRecordings: recordingInfo?.ApprovedRecordings || 0
        };
    });

    allUserData.sort((a, b) => b.TotalRecordings - a.TotalRecordings);

    const paginatedUsers = allUserData.slice(skip, skip + safeLimit);

    return {
        users: paginatedUsers,
        count: paginatedUsers.length,
        totalCount,
        totalPages: Math.ceil(totalCount / safeLimit),
        currentPage: safePage
    };
};

// ========================
// TOP SENTENCE RECORDERS (distinct sentences)
// ========================
exports.getUsersByUniqueSentenceCount = async (limit = 10, statusFilter = null) => {
    const match = {};
    if (statusFilter !== null) {
        match.isApproved = Number(statusFilter);
    }

    const agg = [
        { $match: match },
        { $group: { _id: { personId: "$personId", sentenceId: "$sentenceId" } } },
        { $group: { _id: "$_id.personId", uniqueSentenceCount: { $sum: 1 } } },
        { $sort: { uniqueSentenceCount: -1 } },
        { $limit: Number(limit) || 10 }
    ];

    const stats = await NewRecording.aggregate(agg);
    const userIds = stats.map(s => s._id);
    const users = await UserNew.find({ _id: { $in: userIds } });

    return stats.map(s => {
        const user = users.find(u => u._id.toString() === s._id.toString());
        return {
            _id: user?._id || s._id,
            email: user?.email || null,
            name: user?.name || '',
            uniqueSentences: s.uniqueSentenceCount,
            createdAt: user?.createdAt || null
        };
    });
};

// ========================
// TOTAL USER CONTRIBUTIONS
// ========================
exports.getTotalUserContributions = async (options = {}) => {
    const { includeSentences = true, limit = null, page = 1 } = options;
    const pageLimit = limit || 20;
    const skip = (page - 1) * pageLimit;

    const total = await NewSentence.countDocuments({ createdBy: { $ne: null } });

    if (!includeSentences) {
        return {
            totalContributed: total,
            currentPage: page,
            pageLimit
        };
    }

    const sentences = await NewSentence.find({ createdBy: { $ne: null } })
        .select("domainCode topic sentenceOrder content status createdBy createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean();

    return {
        totalContributed: total,
        sentences,
        count: sentences.length,
        currentPage: page,
        totalPages: Math.ceil(total / pageLimit),
        pageLimit
    };
};

// ========================
// APPROVE RECORDINGS BY EMAIL
// ========================
exports.approveRecordingsByEmail = async (email, filter = {}) => {
    if (!email) throw new Error("Email is required");

    const user = await UserNew.findOne({ email: email.toLowerCase() });
    if (!user) throw new Error("User not found");

    const { fromDate, toDate } = filter;

    const query = {
        personId: user._id,
        isApproved: 0
    };

    if (fromDate || toDate) {
        query.recordedAt = {};
        if (fromDate) {
            query.recordedAt.$gte = new Date(fromDate);
        }
        if (toDate) {
            query.recordedAt.$lte = new Date(toDate);
        }
    }

    const result = await NewRecording.updateMany(query, {
        $set: { isApproved: 1 }
    });

    return result;
};
