import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import Login from './Login';
import { useAuth } from './AuthContext';

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-black text-white">
    <div className="text-center">
      <div className="w-12 h-12 border-t-2 border-blue-500 border-solid rounded-full animate-spin mx-auto mb-4"></div>
      <p>Checking authentication status...</p>
    </div>
  </div>
);

const ErrorScreen = ({ message }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-800 to-purple-900 text-white">
    <div className="text-center p-8 max-w-md bg-gray-800 rounded-3xl border-4 border-pink-400 shadow-lg">
      <p className="text-yellow-300 text-xl font-bold mb-4">Oops! Authentication Hiccup 🙃</p>
      <p className="mb-6 bg-gray-700 p-4 rounded-2xl">{message}</p>
      <button 
        onClick={() => window.location.reload()}
        className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full hover:from-pink-600 hover:to-purple-700 transform hover:-translate-y-1 transition-all shadow-md font-bold"
      >
        Let's Try Again! 🚀
      </button>
    </div>
  </div>
);

const AppRouter = () => {
  const { isAuthenticated, loading, authError } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (authError) {
    return <ErrorScreen message={authError} />;
  }

  return (
    <Routes>
      <Route path="/auth-success" element={<Navigate to="/" />} />
      <Route path="/auth-error" element={<Navigate to="/" />} />
      <Route path="/logout" element={<Navigate to="/" />} />
      <Route path="/" element={isAuthenticated ? <App /> : <Login />} />
    </Routes>
  );
};

export default AppRouter;