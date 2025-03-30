// AuthPage.js
import { useState, useEffect } from "react";
import axios from "axios";
import { Calendar, Mail, RefreshCw, Globe } from "lucide-react";

export default function login({ onAuthComplete }) {
  const [authStatus, setAuthStatus] = useState({
    checking: true,
    authenticated: false,
    error: null,
    services: {}
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setAuthStatus(prev => ({ ...prev, checking: true }));
      const response = await axios.get('http://localhost:3000/auth/status');
      setAuthStatus({
        checking: false,
        authenticated: response.data.authenticated,
        error: response.data.error || null,
        services: response.data.services || {}
      });
    } catch (error) {
      setAuthStatus({
        checking: false,
        authenticated: false,
        error: 'Error checking authentication status',
        services: {}
      });
    }
  };

  const startAuth = () => {
    window.location.href = 'http://localhost:3000/auth/google';
  };

  const handleBackToChat = () => {
    if (onAuthComplete) {
      onAuthComplete(authStatus.authenticated);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full p-6 bg-[#1a1a1a] rounded-xl border border-gray-800">
        <h2 className="text-xl font-semibold mb-4">Connect Google Services</h2>
        
        {authStatus.checking ? (
          <p className="text-gray-400">Checking authentication status...</p>
        ) : authStatus.authenticated ? (
          <div>
            <div className="flex items-center mb-4">
              <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
              <p className="text-green-500 font-medium">Connected to Google</p>
            </div>
            
            <div className="space-y-2">
              {authStatus.services.calendar && (
                <div className="flex items-center text-sm text-gray-300">
                  <Calendar size={16} className="mr-2" />
                  <span>Google Calendar access enabled</span>
                </div>
              )}
              
              {authStatus.services.gmail && (
                <div className="flex items-center text-sm text-gray-300">
                  <Mail size={16} className="mr-2" />
                  <span>Gmail access enabled</span>
                </div>
              )}
              
              <button 
                onClick={checkAuthStatus}
                className="mt-2 text-sm text-gray-400 hover:text-white flex items-center"
              >
                <RefreshCw size={14} className="mr-1" />
                Refresh status
              </button>
            </div>
            
            <button
              onClick={handleBackToChat}
              className="mt-6 w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Back to Chat
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center mb-4">
              <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
              <p className="text-red-400 font-medium">
                {authStatus.error || 'Not connected to Google'}
              </p>
            </div>
            
            <p className="text-sm text-gray-400 mb-4">
              Connect your Google account to enable calendar scheduling and email functions.
            </p>
            
            <button 
              onClick={startAuth}
              className="w-full bg-[#4285F4] hover:bg-[#3367D6] text-white px-4 py-2 rounded-lg flex items-center justify-center"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032 s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2 C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
              </svg>
              Connect Google Account
            </button>

            <button
              onClick={handleBackToChat}
              className="mt-4 w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Back to Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}