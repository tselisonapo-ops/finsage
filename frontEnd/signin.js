// signin.js
const API_BASE = "http://127.0.0.1:5000";

async function handleSignin(event) {
  event.preventDefault();

  const email = document.getElementById("signinEmail").value.trim().toLowerCase();
  const password = document.getElementById("signinPassword").value;

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

  const data = await res.json();
  console.log("Signin response:", data);

  if (!res.ok) {
    alert(data.error || "Login failed");
    return;
  }

  // pick up user from either `user` or `me`
  const user = data.user || data.me || {};

  // Save AUTH token
  localStorage.setItem("authToken", data.token);
  sessionStorage.setItem("authToken", data.token);
  // (optional – match dashboard.js expectations)
  localStorage.setItem("fs_user_token", data.token);

  // Save user data
  if (user.id)    localStorage.setItem("userId", user.id);
  if (user.email) localStorage.setItem("userEmail", user.email);
  if (user.user_role || user.role) {
    localStorage.setItem("userRole", user.user_role || user.role);
  }
  if (user.user_type) {
    localStorage.setItem("userType", user.user_type);
  }
  if (user.company_id) {
    localStorage.setItem("company_id", user.company_id);
  }
  if (user.industry) {
    localStorage.setItem("fs_industry", user.industry);
  }
  if (user.sub_industry) {
    localStorage.setItem("fs_subindustry", user.sub_industry);
  }

  window.location.href = "dashboard.html";

  } catch (err) {
    console.error("Signin error:", err);
    alert("Network or server error.");
  }
}

document.getElementById("signinForm").addEventListener("submit", handleSignin);
