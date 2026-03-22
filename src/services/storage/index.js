/**
 * Storage Services Index
 * Export storage factory and related modules
 */
const storage = require("./storage.config");
const BaseStorageService = require("./baseStorage.service");
const StorageError = require("./storageError");
const WasabiStorageService = require("./wasabiStorage.service");
const CloudinaryStorageService = require("./cloudinaryStorage.service");
const LocalStorageService = require("./localStorage.service");

// Export storage factory directly (for convenience)
module.exports = storage;
