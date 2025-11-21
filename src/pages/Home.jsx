import React from 'react'
import { useNavigate } from "react-router-dom";
import "../styles/home.css";


const Home = () => {
    const navigate=useNavigate();

  return (
    <div className="home-main">
  <div className="auth-buttons">
    <button onClick={() => navigate("/login")} className='login'>Login</button>
        <button onClick={() => navigate("/signup")} className='register'>Register</button>
     
  </div>
  
  {/* Other content stays unaffected */}
  <div className="content">
    <h1>Welcome to my Real-time chat-application</h1>
    <button onClick={() => navigate("/signup")} className="cta-btn">Get Started</button>
    
  </div>
</div>

  );
}

export default Home;