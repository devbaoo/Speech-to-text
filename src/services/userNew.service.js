const Person = require("../models/person");
const RecordingNew = require("../models/recordingNew");
const SentenceNew = require("../models/sentenceNew");
const { toPublicUser } = require("../utils/person.mapper");

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

    const personFindQuery = Object.keys(emailQuery).length ? { email: emailQuery } : {};
    const allRows = await Person.find(personFindQuery)
        .select("email gender role createdAt")
        .lean();

    const totalCount = allRows.length;
    const totalMale = await Person.countDocuments({ gender: "Male" });
    const totalFemale = await Person.countDocuments({ gender: "Female" });

    // Global stats: tong so cau da lam (recording_new isApproved = 1)
    const totalCompletedSentencesAgg = await RecordingNew.aggregate([
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

    // Get recordings stats for ALL users (recording_new: isApproved = 0, 1)
    const recordingMatch = { personId: { $in: allUserIds }, isApproved: { $in: [0, 1] } };
    if (Object.keys(dateQuery).length) recordingMatch.recordedAt = dateQuery;

    const recordingStats = await RecordingNew.aggregate([
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

    // Get sentence contributions for ALL users (sentence_new: status 0 hoac 1, createdBy != null)
    const contributionStats = await SentenceNew.aggregate([
        {
            $match: {
                createdBy: { $in: allRows.map(r => r.email) },
                status: { $in: [0, 1] }
            }
        },
        { $group: { _id: "$createdBy", count: { $sum: 1 } } }
    ]);

    const contributionMap = {};
    contributionStats.forEach(stat => {
        contributionMap[stat._id] = stat.count;
    });

    // Build users array and sort by TotalRecordings descending
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

    // Get detailed recordings for paginated users
    const userRecordingsMap = {};
    for (const userId of paginatedUserIds) {
        const recQuery = {
            personId: userId,
            isApproved: { $in: [0, 1] }
        };
        if (Object.keys(dateQuery).length) recQuery.recordedAt = dateQuery;

        const userRecordings = await RecordingNew.find(recQuery)
            .populate("sentenceId", "content")
            .select("sentenceId duration recordedAt audioUrl isApproved")
            .sort({ recordedAt: -1 })
            .lean();

        userRecordingsMap[userId.toString()] = userRecordings.map(r => ({
            SentenceID: r.sentenceId?._id || r.sentenceId,
            Content: r.sentenceId?.content || null,
            Duration: r.duration || null,
            RecordedAt: r.recordedAt,
            AudioUrl: r.audioUrl || null,
            IsApproved: r.isApproved
        }));
    }

    // Get detailed sentence contributions for paginated users
    const userContributionsMap = {};
    for (const email of paginatedUserEmails) {
        const userSentences = await SentenceNew.find({
            createdBy: email,
            status: { $in: [0, 1] }
        })
            .select("content createdAt status")
            .lean();

        userContributionsMap[email] = userSentences.map(s => ({
            SentenceID: s._id,
            Content: s.content,
            Status: s.status,
            CreatedAt: s.createdAt
        }));
    }

    const users = paginatedUsers.map(u => ({
        ...toPublicUser(u),
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
