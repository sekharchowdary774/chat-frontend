import React, { useState } from "react";
import API from "../services/api";
import { useLocation, Link, useNavigate } from "react-router-dom";
import "../styles/Auth.css";

function ResetPassword() {
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const query = new URLSearchParams(useLocation().search);
  const email = query.get("email");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password) return alert("Enter new password");

    try {
      const res = await API.post("/reset-password", {
        email,
        password,
      });

      alert(res.data.message);
      navigate("/login");
    } catch (err) {
      alert("Something went wrong");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2 className="auth-title">Set New Password</h2>

        <p style={{ marginBottom: "10px", fontSize: "14px" }}>
          Email: <strong>{email}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="password"
            placeholder="Enter new password"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="auth-btn" type="submit">
            Update Password
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
