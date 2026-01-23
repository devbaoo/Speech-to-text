const Person = require("../models/person");
const recording = require("../models/recording");
const sentence = require("../models/sentence");
const { toPublicUser } = require("../utils/person.mapper");
const bcrypt = require("bcrypt");

exports.createGuest = async (data) => {
  const email = data.email.trim().toLowerCase();
  const allUsers = await Person.find({}, "email");
  const existingUser = allUsers.find((user) => user.email === email);

  if (existingUser) {
    return { user: await Person.findOne({ _id: existingUser._id }), existed: true };
  }

  const created = await Person.create({
    email,
    gender: data.gender,
    role: "User",
  });
  return { user: created, existed: false };
};

// Login user by email (returns user)
exports.loginUser = async (email) => {
  if (!email) throw new Error("Email is required");
  const normalized = email.trim().toLowerCase();
  const user = await Person.findOne({ email: normalized });
  if (!user) throw new Error("User not found");
  return user;
};

exports.getUsers = async (page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    
    // Get paginated users
    const rows = await Person.find()
      .select("email gender role createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await Person.countDocuments();
    
    // Global stats: Tổng Nam, Tổng Nữ
    const totalMale = await Person.countDocuments({ gender: "Male" });
    const totalFemale = await Person.countDocuments({ gender: "Female" });
    
    // Global stats: Tổng số câu đã làm (tổng recording đã được duyệt của tất cả user)
    const totalCompletedSentencesAgg = await recording.aggregate([
      { $match: { isApproved: 1 } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 }
        }
      }
    ]);
    const totalCompletedSentences = totalCompletedSentencesAgg[0]?.totalCount || 0;
    
    // Only get stats for current page users
    const userIds = rows.map(r => r._id);
    if (!userIds.length) {
      return {
        users: rows.map(toPublicUser),
        count: 0,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        totalMale,
        totalFemale,
        totalCompletedSentences
      };
    }

    // Get recordings stats for paginated users
    const recordingStats = await recording.aggregate([
      { $match: { personId: { $in: userIds }, isApproved: 1 } },
      {
        $group: {
          _id: "$personId",
          recordingCount: { $sum: 1 },
          totalDuration: { $sum: { $ifNull: ["$duration", 0] } }
        }
      }
    ]);

    const recordingMap = {};
    recordingStats.forEach(stat => {
      recordingMap[stat._id.toString()] = {
        count: stat.recordingCount,
        duration: stat.totalDuration
      };
    });

    // Get sentence contributions for paginated users (chỉ tính câu có status = 1)
    const contributionStats = await sentence.aggregate([
      { $match: { createdBy: { $in: rows.map(r => r.email) }, status: 1 } },
      { $group: { _id: "$createdBy", count: { $sum: 1 } } }
    ]);

    const contributionMap = {};
    contributionStats.forEach(stat => {
      contributionMap[stat._id] = stat.count;
    });

    // Get detailed recordings for each user (câu đã làm)
    const userRecordingsMap = {};
    for (const userId of userIds) {
      const userRecordings = await recording.find({ 
        personId: userId, 
        isApproved: 1 
      })
        .populate("sentenceId", "content")
        .select("sentenceId duration recordedAt audioUrl")
        .lean();
      
      userRecordingsMap[userId.toString()] = userRecordings.map(r => ({
        SentenceID: r.sentenceId?._id || r.sentenceId,
        Content: r.sentenceId?.content || null,
        Duration: r.duration || null,
        RecordedAt: r.recordedAt,
        AudioUrl: r.audioUrl || null
      }));
    }

    // Get detailed sentence contributions for each user (câu đóng góp)
    const userContributionsMap = {};
    for (const row of rows) {
      const userSentences = await sentence.find({ 
        createdBy: row.email, 
        status: 1 
      })
        .select("content createdAt status")
        .lean();
      
      userContributionsMap[row.email] = userSentences.map(s => ({
        SentenceID: s._id,
        Content: s.content,
        Status: s.status,
        CreatedAt: s.createdAt
      }));
    }

    const users = rows.map(u => ({
      ...toPublicUser(u),
      TotalRecordings: recordingMap[u._id.toString()]?.count || 0,
      TotalRecordingDuration: recordingMap[u._id.toString()]?.duration || 0,
      TotalSentenceContributions: contributionMap[u.email] || 0,
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

// Total number of sentences contributed by users (createdBy not null)
exports.getTotalUserContributions = async (options = {}) => {
  const { includeSentences = true, limit = null, page = 1 } = options;
  const pageLimit = limit || 20;
  const skip = (page - 1) * pageLimit;

  const total = await sentence.countDocuments({ createdBy: { $ne: null } });

  if (!includeSentences) {
    return { 
      totalContributed: total,
      currentPage: page,
      pageLimit
    };
  }

  let query = sentence.find({ createdBy: { $ne: null } })
    .select("content status createdBy createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageLimit);

  const sentences = await query.lean();

  return { 
    totalContributed: total,
    sentences,
    count: sentences.length,
    currentPage: page,
    totalPages: Math.ceil(total / pageLimit),
    pageLimit
  };
};

exports.loginAdmin = async (username, password) => {
  if (username !== process.env.ADMIN_USERNAME) {
    throw new Error("Invalid credentials");
  }

  const isMatch = await bcrypt.compare(
    password,
    process.env.ADMIN_PASSWORD_HASH
  );

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  return {
    role: "Admin"
  };
};

exports.updateUserName = async (id, newName) => {
  if (!newName || newName.trim() === "") {
    throw new Error("Tên không được rỗng");
  }

  const trimmedName = newName.trim();
  const allUsers = await Person.find({ _id: { $ne: id } }, 'name');
  const existingUser = allUsers.find(user =>
    user.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (existingUser) {
    throw new Error("Tên người dùng đã tồn tại");
  }

  const updatedUser = await Person.findByIdAndUpdate(
    id,
    { name: trimmedName },
    { new: true }
  );

  if (!updatedUser) {
    throw new Error("User không tồn tại");
  }

  return updatedUser;
};

exports.deleteUser = async (id) => {
  const deletedUser = await Person.findByIdAndDelete(id);

  if (!deletedUser) {
    throw new Error("User không tồn tại");
  }

  return deletedUser;
};

// Get users sorted by recording count 
exports.getUsersByRecordingCount = async (statusFilter = null, limit = 10) => {
  const matchCondition = {};
  if (statusFilter !== null) {
    matchCondition.isApproved = Number(statusFilter);
  }
  const recordingStats = await recording.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: "$personId",
        recordingCount: { $sum: 1 },
        approvedCount: {
          $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ["$isApproved", 0] }, 1, 0] }
        },
        rejectedCount: {
          $sum: { $cond: [{ $eq: ["$isApproved", 2] }, 1, 0] }
        }
      }
    },
    { $sort: { recordingCount: -1 } },
    { $limit: Number(limit) }
  ]);
  const userIds = recordingStats.map(stat => stat._id);
  const users = await Person.find({ _id: { $in: userIds } });
  const result = recordingStats.map(stat => {
    const user = users.find(u => u._id.toString() === stat._id.toString());
    return {
      userId: user?._id,
      email: user?.email,
      gender: user?.gender,
      totalRecordings: stat.recordingCount,
      approvedRecordings: stat.approvedCount,
      pendingRecordings: stat.pendingCount,
      rejectedRecordings: stat.rejectedCount,
      createdAt: user?.createdAt
    };
  });

  return result;
};


// Get users sorted by sentence contributions (only sentences with status 1,2,3)
exports.getUsersBySentenceCount = async (limit = null) => {
  const pipeline = [
    { $match: { status: { $in: [1, 2, 3] }, createdBy: { $ne: null } } },
    {
      $group: {
        _id: "$createdBy",
        sentenceCount: { $sum: 1 },
        status1Count: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } },
        status2Count: { $sum: { $cond: [{ $eq: ["$status", 2] }, 1, 0] } },
        status3Count: { $sum: { $cond: [{ $eq: ["$status", 3] }, 1, 0] } }
      }
    },
    { $sort: { sentenceCount: -1 } }
  ];
  if (limit && Number(limit) > 0) {
    pipeline.push({ $limit: Number(limit) });
  }

  const stats = await sentence.aggregate(pipeline);

  // map stats by email for quick lookup
  const statsMap = {};
  stats.forEach(s => {
    statsMap[s._id] = {
      totalSentences: s.sentenceCount,
      status1Count: s.status1Count,
      status2Count: s.status2Count,
      status3Count: s.status3Count
    };
  });

  // fetch all persons and attach stats (0 if none)
  const persons = await Person.find().select("email gender role createdAt");

  const results = [];
  for (const user of persons) {
    const email = user.email;
    const stat = statsMap[email] || { totalSentences: 0, status1Count: 0, status2Count: 0, status3Count: 0 };
    const personId = user._id;

    // only compute recordings for users with any approved recordings
    let recordedSentences = [];
    let recordingTotalCount = 0;
    if (stat.totalSentences > 0) {
      const recAgg = await recording.aggregate([
        { $match: { personId: personId, isApproved: 1 } },
        {
          $group: {
            _id: "$sentenceId",
            recordingCount: { $sum: 1 },
            approvedCount: { $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] } }
          }
        }
      ]);
      recordingTotalCount = recAgg.reduce((acc, r) => acc + (r.recordingCount || 0), 0);
      const sentenceIds = recAgg.map(r => r._id);
      const sentenceDocs = sentenceIds.length ? await sentence.find({ _id: { $in: sentenceIds } }).select("content") : [];
      const sentenceById = {};
      sentenceDocs.forEach(sd => { sentenceById[sd._id.toString()] = sd.content; });
      recordedSentences = recAgg.map(r => ({
        SentenceID: r._id,
        Content: sentenceById[r._id.toString()] || null,
        RecordingCount: r.recordingCount,
        ApprovedCount: r.approvedCount
      }));
    }

    results.push({
      userEmail: email,
      userId: personId,
      totalSentences: stat.totalSentences,
      status1Count: stat.status1Count,
      status2Count: stat.status2Count,
      status3Count: stat.status3Count,
      createdAt: user.createdAt || null,
      RecordedSentences: recordedSentences,
      RecordingTotalCount: recordingTotalCount
    });
  }

  return results;
};

// Get users sorted by number of distinct sentences they recorded
exports.getUsersByUniqueSentenceCount = async (limit = 10, statusFilter = null) => {

  const match = {};
  if (statusFilter !== null) {
    match.isApproved = Number(statusFilter);
  }

  const agg = [
    { $match: match },
    {
      $group: {
        _id: { personId: "$personId", sentenceId: "$sentenceId" }
      }
    },
    {
      $group: {
        _id: "$_id.personId",
        uniqueSentenceCount: { $sum: 1 }
      }
    },
    { $sort: { uniqueSentenceCount: -1 } },
    { $limit: Number(limit) }
  ];

  const stats = await recording.aggregate(agg);
  const userIds = stats.map(s => s._id);
  const users = await Person.find({ _id: { $in: userIds } });

  return stats.map(s => {
    const user = users.find(u => u._id.toString() === s._id.toString());
    return {
      userId: user?._id || s._id,
      email: user?.email || null,
      uniqueSentences: s.uniqueSentenceCount,
      createdAt: user?.createdAt || null
    };
  });
};

// Get user by id with recordings done (approved), total duration, and created sentences
exports.getUserById = async (userId) => {
  if (!userId) throw new Error("userId is required");
  const user = await Person.findById(userId).lean();
  if (!user) throw new Error("User not found");

  // approved recordings by this user
  const recAgg = await recording.aggregate([
    { $match: { personId: user._id, isApproved: 1 } },
    { $group: { _id: "$sentenceId", count: { $sum: 1 } } }
  ]);
  const sentenceIds = recAgg.map(r => r._id);
  const sentenceDocs = sentenceIds.length ? await sentence.find({ _id: { $in: sentenceIds } }).select("content") : [];
  const sentenceById = {};
  sentenceDocs.forEach(s => { sentenceById[s._id.toString()] = s.content; });
  const sentencesDone = recAgg.map(r => ({
    SentenceID: r._id,
    Content: sentenceById[r._id.toString()] || null
  }));

  const uniqueCount = sentenceIds.length;

  const durationAgg = await recording.aggregate([
    { $match: { personId: user._id, isApproved: 1 } },
    { $group: { _id: null, totalDuration: { $sum: { $ifNull: ["$duration", 0] } } } }
  ]);
  const totalDuration = (durationAgg[0] && durationAgg[0].totalDuration) || 0;

  // created sentences by this user (use createdById if present, else email)
  const createdQuery = {
    $or: [
      { createdById: user._id },
      { createdBy: user.email }
    ]
  };
  const createdDocs = await sentence.find(createdQuery).select("content status createdAt").sort({ createdAt: -1 }).lean();
  const createdCount = createdDocs.length;
  const createdList = createdDocs.map(s => ({
    SentenceID: s._id,
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