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

exports.getUsers = async (page = 1, limit = 20, filter = {}) => {
    const skip = (page - 1) * limit;
    const { fromDate, toDate } = filter;

    // Build date query for recordings filter (hỗ trợ datetime đầy đủ)
    const dateQuery = {};
    if (fromDate) {
      dateQuery.$gte = new Date(fromDate);
    }
    if (toDate) {
      dateQuery.$lte = new Date(toDate);
    }

    // Get all users first (we need to calculate TotalRecordings for all to sort)
    const allRows = await Person.find()
      .select("email gender role createdAt")
      .lean();

    const totalCount = allRows.length;
    
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

    // Get recordings stats for ALL users (tổng recordings với isApproved = 0 và 1)
    // Áp dụng filter theo recordedAt nếu có fromDate/toDate
    const recordingMatch = { personId: { $in: allUserIds }, isApproved: { $in: [0, 1] } };
    if (Object.keys(dateQuery).length) {
      recordingMatch.recordedAt = dateQuery;
    }

    const recordingStats = await recording.aggregate([
      { $match: recordingMatch },
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

    const recordingMap = {};
    recordingStats.forEach(stat => {
      recordingMap[stat._id.toString()] = {
        count: stat.recordingCount,
        duration: stat.totalDuration,
        approvedCount: stat.approvedCount,
        pendingCount: stat.pendingCount
      };
    });

    // Get sentence contributions for ALL users (chỉ tính câu có status = 1)
    const contributionStats = await sentence.aggregate([
      { $match: { createdBy: { $in: allRows.map(r => r.email) }, status: 1 } },
      { $group: { _id: "$createdBy", count: { $sum: 1 } } }
    ]);

    const contributionMap = {};
    contributionStats.forEach(stat => {
      contributionMap[stat._id] = stat.count;
    });

    // Build users array with TotalRecordings for sorting
    const allUsersWithStats = allRows.map(u => ({
      ...u,
      TotalRecordings: recordingMap[u._id.toString()]?.count || 0,
      TotalRecordingDuration: recordingMap[u._id.toString()]?.duration || 0,
      ApprovedRecordings: recordingMap[u._id.toString()]?.approvedCount || 0,
      PendingRecordings: recordingMap[u._id.toString()]?.pendingCount || 0,
      TotalSentenceContributions: contributionMap[u.email] || 0
    }));

    // Sort by TotalRecordings descending
    allUsersWithStats.sort((a, b) => b.TotalRecordings - a.TotalRecordings);

    // Now paginate after sorting
    const paginatedUsers = allUsersWithStats.slice(skip, skip + limit);
    const paginatedUserIds = paginatedUsers.map(u => u._id);
    const paginatedUserEmails = paginatedUsers.map(u => u.email);

    // Get detailed recordings for paginated users only (câu đã làm, cả isApproved 0 và 1)
    // Áp dụng filter theo recordedAt nếu có fromDate/toDate
    const userRecordingsMap = {};
    for (const userId of paginatedUserIds) {
      const recordingQuery = {
        personId: userId,
        isApproved: { $in: [0, 1] }
      };
      if (Object.keys(dateQuery).length) {
        recordingQuery.recordedAt = dateQuery;
      }
      const userRecordings = await recording.find(recordingQuery)
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

    // Get detailed sentence contributions for paginated users only (câu đóng góp)
    const userContributionsMap = {};
    for (const email of paginatedUserEmails) {
      const userSentences = await sentence.find({ 
        createdBy: email, 
        status: 1 
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

    // Map to final format
    const users = paginatedUsers.map(u => ({
      ...toPublicUser(u),
      TotalRecordings: u.TotalRecordings,
      TotalRecordingDuration: u.TotalRecordingDuration,
      ApprovedRecordings: u.ApprovedRecordings,
      PendingRecordings: u.PendingRecordings,
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

// Top contributors by number of sentences created (createdBy != null), sorted descending by TotalRecordings
exports.getTopContributors = async (page = 1, limit = 10) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (safePage - 1) * safeLimit;

  const baseMatch = {
    createdBy: { $ne: null }
  };

  // Get ALL contributors first (no pagination yet)
  const allStats = await sentence.aggregate([
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
  const allPersons = allEmails.length
    ? await Person.find({ email: { $in: allEmails } }).select("email gender role createdAt").lean()
    : [];

  const personByEmail = {};
  allPersons.forEach(p => {
    personByEmail[p.email] = p;
  });

  // Get recording stats for ALL contributors
  const allPersonIds = allPersons.map(p => p._id);
  const allRecordingStats = allPersonIds.length
    ? await recording.aggregate([
        { $match: { personId: { $in: allPersonIds } } },
        {
          $group: {
            _id: "$personId",
            TotalRecordings: { $sum: 1 },
            ApprovedRecordings: {
              $sum: { $cond: [{ $eq: ["$isApproved", 1] }, 1, 0] }
            }
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

  // Build users array with all stats
  const allUsers = allStats.map(s => {
    const email = s._id;
    const p = personByEmail[email] || null;
    const recordingInfo = p?._id ? recordingMap[p._id.toString()] : null;
    return {
      userId: p?._id || null,
      email,
      gender: p?.gender || null,
      role: p?.role || null,
      createdAt: p?.createdAt || null,
      TotalContributedSentences: s.TotalContributedSentences || 0,
      TotalRecordings: recordingInfo?.TotalRecordings || 0,
      ApprovedRecordings: recordingInfo?.ApprovedRecordings || 0
    };
  });

  // Sort by TotalRecordings descending
  allUsers.sort((a, b) => b.TotalRecordings - a.TotalRecordings);

  // Now paginate after sorting
  const paginatedUsers = allUsers.slice(skip, skip + safeLimit);

  return {
    users: paginatedUsers,
    count: paginatedUsers.length,
    totalCount,
    totalPages: Math.ceil(totalCount / safeLimit),
    currentPage: safePage
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

// Approve all recordings by email (with optional date filter)
exports.approveRecordingsByEmail = async (email, filter = {}) => {
  if (!email) throw new Error("Email is required");

  // Find user by email to get personId
  const user = await Person.findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("User not found");

  const { fromDate, toDate } = filter;

  // Build query to find recordings
  const query = {
    personId: user._id,
    isApproved: 0 // Chỉ duyệt recordings đang chờ duyệt
  };

  // Add date filter if provided
  if (fromDate || toDate) {
    query.recordedAt = {};
    if (fromDate) {
      query.recordedAt.$gte = new Date(fromDate);
    }
    if (toDate) {
      query.recordedAt.$lte = new Date(toDate);
    }
  }

  // Update all matching recordings to isApproved = 1
  const result = await recording.updateMany(query, {
    $set: { isApproved: 1 }
  });

  return result;
};

// Search users by email (case-insensitive, partial match)
exports.searchUserByEmail = async (email, page = 1, limit = 20) => {
  if (!email || email.trim() === "") {
    throw new Error("Email is required");
  }

  const skip = (page - 1) * limit;
  
  // Case-insensitive partial match
  const query = {
    email: { $regex: email.trim(), $options: "i" }
  };

  const users = await Person.find(query)
    .select("email gender role createdAt")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const totalCount = await Person.countDocuments(query);

  // Get recording stats for matched users
  const userIds = users.map(u => u._id);
  
  const recordingStats = await recording.aggregate([
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

  // Map result
  const result = users.map(user => {
    const stats = statsMap[user._id.toString()] || {};
    return {
      id: user._id,
      email: user.email,
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