import { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

// Create a context to hold authentication state
const AuthContext = createContext(null);

// Set axios defaults
axios.defaults.withCredentials = true;

// Auth token storage key
const AUTH_TOKEN_KEY = 'twinAI_auth_token';

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authServices, setAuthServices] = useState({});
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we're on auth-success or auth-error paths
    if (location.pathname === '/auth-success') {
      // Store auth token in localStorage
      localStorage.setItem(AUTH_TOKEN_KEY, 'authenticated');
      navigate('/');
      checkAuthStatus();
    } else if (location.pathname === '/auth-error') {
      setAuthError('Authentication failed. Please try again.');
      localStorage.removeItem(AUTH_TOKEN_KEY);
      navigate('/');
      setLoading(false);
    } else if (location.pathname === '/logout') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setIsAuthenticated(false);
      navigate('/');
      setLoading(false);
    } else {
      // Regular auth check
      checkAuthStatus();
    }
  }, [location.pathname, navigate]);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      
      // First check if we have the token in localStorage
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      
      if (!token) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      
      // Add auth token to request header
      const response = await axios.get('http://localhost:3000/auth/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.data.authenticated) {
        setIsAuthenticated(true);
        setAuthServices(response.data.services || {});
      } else {
        // If server says not authenticated, remove token
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setIsAuthenticated(false);
        console.log('Not authenticated:', response.data.reason);
      }
      
      setAuthError(null);
    } catch (error) {
      console.error('Error checking authentication status:', error);
      setAuthError('Failed to connect to authentication service');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    // Redirect to the server's auth endpoint
    window.location.href = 'http://localhost:3000/auth/google';
  };

  const logout = async () => {
    try {
      // Remove token from localStorage first
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setIsAuthenticated(false);
      
      // Then call the server to delete the token file
      window.location.href = 'http://localhost:3000/auth/logout';
    } catch (error) {
      console.error('Logout error:', error);
      // Even if there's an error, clear the local state
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        isAuthenticated, 
        loading, 
        authError, 
        authServices,
        login, 
        logout, 
        checkAuthStatus 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};