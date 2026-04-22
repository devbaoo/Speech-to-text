/**
 * Storage Configuration
 * Initialize storage services based on environment variables
 * Usage:
 *   const storage = require('./storage.config');
 *   storage.upload(...) // uses default provider
 *   storage.get('wasabi').upload(...)
 */

const path = require("path");
const storageFactory = require("./storage.factory");

/** Tránh lỗi copy/paste trong .env (khoảng trắng, xuống dòng) */
function envTrim(key) {
  const v = process.env[key];
  return typeof v === "string" ? v.trim() : v;
}

// Detect which storage providers are configured and register them
const hasWasabi =
  envTrim("WASABI_ACCESS_KEY") &&
  envTrim("WASABI_SECRET_KEY") &&
  envTrim("WASABI_BUCKET") &&
  envTrim("WASABI_ENDPOINT") &&
  envTrim("WASABI_REGION");

const hasCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

// Register Wasabi as primary storage (for audio/recordings)
if (hasWasabi) {
  storageFactory.register("wasabi", "wasabi", {
    WASABI_BUCKET: envTrim("WASABI_BUCKET"),
    WASABI_ENDPOINT: envTrim("WASABI_ENDPOINT"),
    WASABI_REGION: envTrim("WASABI_REGION"),
    WASABI_ACCESS_KEY: envTrim("WASABI_ACCESS_KEY"),
    WASABI_SECRET_KEY: envTrim("WASABI_SECRET_KEY"),
    WASABI_FOLDER: envTrim("WASABI_FOLDER") || "recordings",
  });

  // Set Wasabi as default
  storageFactory.setDefault("wasabi");
}
// Fallback to Cloudinary if Wasabi not configured
else if (hasCloudinary) {
  storageFactory.register("cloudinary", "cloudinary", {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER || "recordings",
  });
  storageFactory.setDefault("cloudinary");
}
// Fallback to local storage for development
else {
  storageFactory.register("local", "local", {
    LOCAL_PATH: path.join(__dirname, "..", "..", "..", "uploads"),
    LOCAL_URL: process.env.LOCAL_URL || "/uploads",
    LOCAL_FOLDER: "files",
  });
  storageFactory.setDefault("local");
  console.warn("[Storage] No cloud storage configured, using local filesystem");
}

// Log registered services
console.log(`[Storage] Initialized with providers: ${storageFactory.list().join(", ")}`);
console.log(`[Storage] Default provider: ${storageFactory.defaultProvider}`);

module.exports = storageFactory;
