const axios = require("axios");

async function testPasswordChange() {
  try {
    // 1. Register User
    const random = Math.floor(Math.random() * 10000);
    const email = `testpwd${random}@example.com`;
    const password = "password123";

    console.log(`Creating user ${email}...`);
    const regRes = await axios.post("http://localhost:5001/api/auth/register", {
      name: "Pwd Tester",
      email,
      password,
    });

    const token = regRes.data.data.token;
    console.log("User registered. Token:", token.substring(0, 10) + "...");

    // 2. Change Password
    console.log("Changing password...");
    const changeRes = await axios.put(
      "http://localhost:5001/api/users/change-password",
      {
        currentPassword: password,
        newPassword: "newpassword456",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("Change Password Response:", changeRes.data);

    // 3. Login with New Password
    console.log("Logging in with new password...");
    const loginRes = await axios.post("http://localhost:5001/api/auth/login", {
      email,
      password: "newpassword456",
    });
    console.log("Login Success:", loginRes.data.success);
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
  }
}

testPasswordChange();
