require("dotenv").config();        
require("./configs/cloudinary.config"); 

const app = require("./app");
const connectDB = require("./configs/db.config");

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Cannot connect to database:", error);
    process.exit(1);
  }
})();
