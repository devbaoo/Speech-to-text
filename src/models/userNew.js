const mongoose = require('mongoose');

const userNewSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
    },

    name: {
      type: String,
      trim: true,
      default: ''
    },

    gender: {
      type: String,
      required: true,
      enum: ['Male', 'Female', 'Other']
    },

    role: {
      type: String,
      enum: ['User'],
      default: 'User'
    }
  },
  {
    collection: 'new_user',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

module.exports = mongoose.model('UserNew', userNewSchema);
