const mongoose = require('mongoose');

const personSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true
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
    collection: 'person',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

module.exports = mongoose.model('Person', personSchema);
