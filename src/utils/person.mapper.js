const User = require("../models/person");

exports.toPublicUser = (row) => ({
  PersonID: row._id,
  Email: row.email,
  Gender: row.gender,
  Role: row.role,
  CreatedAt: row.createdAt
});

exports.toAdminUser = (row) => {
    return {
        id: row._id,
        email: row.email,
        password: row.password,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
};


exports.toGuestUser = (row) => {
    return {
        email: row.email,
        gender: row.gender,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
};
