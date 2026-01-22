const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    let role, passwordHash, message;

    // Kiểm tra xem username có phải admin hay manager
    if (username === process.env.ADMIN_USERNAME) {
      role = "Admin";
      passwordHash = process.env.ADMIN_PASSWORD_HASH;
      message = "Login admin success";
    } else if (username === process.env.MANAGER_USERNAME) {
      role = "Manager";
      passwordHash = process.env.MANAGER_PASSWORD_HASH;
      message = "Login manager success";
    } else {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Xác thực mật khẩu
    const isMatch = await bcrypt.compare(password, passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Tạo JWT token
    const token = jwt.sign(
      {
        role,
        username
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      message,
      token,
      role
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};
