import React from 'react';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from './AuthContext';

const Login = () => {
    const { login } = useAuth();

    return (
        <div className="min-h-screen flex items-center justify-center bg-black p-4">
            <div className="bg-gray-900 rounded-2xl shadow-lg p-8 w-full max-w-md relative overflow-hidden">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-blue-900 opacity-30"></div>
                    <div className="absolute top-20 -right-10 w-32 h-32 rounded-full bg-purple-900 opacity-30"></div>
                    <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-pink-900 opacity-30"></div>
                    <div className="absolute -bottom-10 right-10 w-28 h-28 rounded-full bg-yellow-900 opacity-30"></div>
                </div>
                
                <div className="relative z-10">
                    <h1 className="text-4xl font-bold text-center mb-2 text-gray-100">twinAI</h1>
                    <p className="text-center text-gray-400 mb-8">Your digital companion, just a login away</p>
                    
                    <button 
                        onClick={login}
                        className="w-full flex items-center justify-center gap-2 bg-gray-800 border border-gray-700 rounded-xl py-3 px-4 text-gray-200 hover:bg-gray-700 transition shadow-sm"
                    >
                        <FcGoogle className="text-xl" />
                        <span>Sign in with Google</span>
                    </button>

                    
                    <div className="mt-8 text-center text-gray-400 text-sm">
                        <p>Join the fun and connect today!</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;