const Person = require("../models/person");
const RecordingNewMake = require("../models/recordingNewMake");
const SentenceNewMake = require("../models/sentenceNewMake");
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

    // Global stats: tổng số recording đã duyệt trong recording_new_make
    const totalCompletedSentencesAgg = await RecordingNewMake.aggregate([
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

    // Get recordings stats for ALL users from recording_new_make
    const recordingMatch = { personId: { $in: allUserIds }, isApproved: { $in: [0, 1] } };
    if (Object.keys(dateQuery).length) recordingMatch.recordedAt = dateQuery;

    const recordingStats = await RecordingNewMake.aggregate([
        { $match: recordingMatch },
        {
            $project: {
                personId: 1,
                isApproved: 1,
                totalDuration: {
                    $add: [
                        { $ifNull: ["$durationPlaintext", 0] },
                        { $ifNull: ["$durationContent", 0] }
                    ]
                }
            }
        },
        {
            $group: {
                _id: "$personId",
                recordingCount: { $sum: 1 },
                totalDuration: { $sum: "$totalDuration" },
                approvedCount: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] } },
                pendingCount: { $sum: { $cond: [{ $eq: ["$isApproved", 0] }, 1, 0] } },
                approvedDuration: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, "$totalDuration", 0] } }
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

    // Get sentence contributions for ALL users from sentence_new_make
    const contributionStats = await SentenceNewMake.aggregate([
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

        const userRecordings = await RecordingNewMake.find(recQuery)
            .populate("sentenceId", "viEquivalent csTranscript")
            .select("sentenceId durationPlaintext durationContent recordedAt audioPlaintext audioContent isApproved")
            .sort({ recordedAt: -1 })
            .lean();

        userRecordingsMap[userId.toString()] = userRecordings.map(r => ({
            SentenceID: r.sentenceId?._id || r.sentenceId,
            Content: r.sentenceId?.viEquivalent || r.sentenceId?.csTranscript || null,
            Duration: (r.durationPlaintext || 0) + (r.durationContent || 0) || null,
            RecordedAt: r.recordedAt,
            AudioUrl: r.audioContent || r.audioPlaintext || null,
            IsApproved: r.isApproved
        }));
    }

    const userContributionsMap = {};
    for (const userEmail of paginatedUserEmails) {
        const userSentences = await SentenceNewMake.find({
            createdBy: userEmail,
            status: { $in: [0, 1] }
        })
            .select("viEquivalent csTranscript createdAt status")
            .lean();

        userContributionsMap[userEmail] = userSentences.map(s => ({
            SentenceID: s._id,
            Content: s.viEquivalent || s.csTranscript,
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
