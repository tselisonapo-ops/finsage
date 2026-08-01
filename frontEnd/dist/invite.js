// accept-invite.js — invite token → set password
(function () {
  "use strict";

  const API_BASE          = "http://127.0.0.1:5000";
  const INVITE_INFO_URL   = API_BASE + "/api/auth/invite-info";
  const ACCEPT_INVITE_URL = API_BASE + "/api/auth/accept-invite";

  const $  = (s) => document.querySelector(s);

  function setAlert(message, type) {
    const alertBox = $("#alert");
    if (!alertBox) return;
    alertBox.className = "mb-4 text-sm font-medium p-3 rounded-lg";

    if (type === "error") {
      alertBox.classList.add("bg-red-100", "text-red-700");
    } else if (type === "success") {
      alertBox.classList.add("bg-green-100", "text-green-700");
    } else {
      alertBox.classList.add("bg-yellow-100", "text-gray-800");
    }

    alertBox.innerHTML = message;
    alertBox.classList.remove("hidden");
  }

  function clearAlert() {
    const alertBox = $("#alert");
    if (alertBox) {
      alertBox.classList.add("hidden");
      alertBox.innerHTML = "";
    }
  }

  function getTokenFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  }

  function disableForm(disabled) {
    const form = $("#acceptInviteForm");
    if (!form) return;
    form.querySelectorAll("input, button").forEach((el) => {
      el.disabled = disabled;
    });
  }

  async function loadInviteMeta(token) {
    const intro = $("#invite-intro");
    const emailDisplay = $("#inviteEmailDisplay");
    const expiry = $("#invite-expiry");

    try {
      const url = new URL(INVITE_INFO_URL);
      url.searchParams.set("token", token);

      const res = await fetch(url.toString());
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAlert(data.error || "Invalid or expired invitation link.", "error");
        if (intro) {
          intro.textContent = "We could not load your invitation. Please request a new link from your workspace owner.";
        }
        disableForm(true);
        return;
      }

      if (emailDisplay) {
        emailDisplay.value = data.email || "";
      }

      if (intro) {
        const companyName = data.companyName || "your FinSage workspace";
        const roleLabel   = data.roleLabel || data.role || "team member";
        intro.innerHTML =
          `You have been invited to <strong>${companyName}</strong> as a <strong>${roleLabel}</strong>.` +
          `<br>Confirm your details below and create a secure password to activate your account.`;
      }

      if (expiry && data.expiresAt) {
        expiry.textContent = "Expires: " + new Date(data.expiresAt).toLocaleString();
      }

    } catch (err) {
      console.error("Error loading invite info:", err);
      setAlert("Network error while loading your invitation. Please try again in a moment.", "error");
      disableForm(true);
    }
  }

  async function handleSubmit(evt) {
    evt.preventDefault();
    clearAlert();

    const token = $("#inviteToken").value.trim();
    const firstName = $("#firstName").value.trim();
    const lastName  = $("#lastName").value.trim();
    const password  = $("#password").value;
    const confirm   = $("#confirmPassword").value;

    if (!firstName || !lastName) {
      setAlert("Please enter your first and last name.", "error");
      return;
    }

    // Same strength rules as registration
    const strengthRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strengthRegex.test(password)) {
      setAlert("Password must be at least 8 characters long and contain at least one uppercase letter and one number.", "error");
      return;
    }

    if (password !== confirm) {
      setAlert("Passwords do not match. Please re-enter them.", "error");
      return;
    }

    disableForm(true);
    setAlert("Creating your account and applying your role…", "info");

    try {
      const res = await fetch(ACCEPT_INVITE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          firstName: firstName,
          lastName: lastName,
          password: password,
          confirmPassword: confirm
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        disableForm(false);
        setAlert(data.error || data.message || "Could not complete invitation. The link may be invalid or expired.", "error");
        return;
      }

      // Optionally store auth token if backend returns one
      if (data.token) {
        localStorage.setItem("fs_user_token", data.token);
      }

      const form = $("#acceptInviteForm");
      const successBlock = $("#successBlock");
      if (form) form.classList.add("hidden");
      if (successBlock) successBlock.classList.remove("hidden");

      setAlert("Your account has been created successfully.", "success");

    } catch (err) {
      console.error("Accept invite error:", err);
      disableForm(false);
      setAlert("Network error. Could not reach the FinSage server.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const token = getTokenFromQuery();
    const tokenInput = $("#inviteToken");

    if (!token) {
      setAlert("This invitation link is missing a token. Please request a new invite from your administrator.", "error");
      disableForm(true);
      return;
    }

    if (tokenInput) tokenInput.value = token;

    loadInviteMeta(token);

    const form = $("#acceptInviteForm");
    if (form) form.addEventListener("submit", handleSubmit);
  });

})();
