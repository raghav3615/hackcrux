// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const chatService = require('./services/chat');
const connectDB = require('./db/connection');
const User = require('./models/User');

// Connect to MongoDB
connectDB();

const app = express();

// Use Helmet for better security
app.use(helmet());

// Use environment variables for production support
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key-here';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Authentication middleware
const authenticateJWT = async (req, res, next) => {
  try {
    const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Optional auth middleware (doesn't require auth but attaches user if available)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
    
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Just continue if token invalid
    next();
  }
};

// Serve static files
app.use(express.static('public'));

// Chat endpoint with authentication
app.post('/chat', optionalAuth, async (req, res, next) => {
    try {
        const userInput = req.body.message;
        const sessionId = req.body.sessionId || 'default';
        const userId = req.user?._id;
        
        const response = await chatService.processInput(userInput, sessionId, userId);
        res.json({ response });
    } catch (error) {
        next(error);
    }
});

// Add endpoint to retrieve conversation history (requires auth)
app.get('/history/:sessionId', authenticateJWT, async (req, res, next) => {
    try {
        const sessionId = req.params.sessionId;
        const limit = parseInt(req.query.limit) || 10;
        const userId = req.user._id;
        
        const history = await chatService.getConversationHistory(sessionId, limit, userId);
        res.json({ history });
    } catch (error) {
        next(error);
    }
});

// Get all user's chat sessions
app.get('/chats', authenticateJWT, async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const skip = parseInt(req.query.skip) || 0;
        const userId = req.user._id;
        
        const chats = await chatService.getUserChats(userId, limit, skip);
        res.json({ chats });
    } catch (error) {
        next(error);
    }
});

// Google Auth Callback with JWT token creation
app.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('No authorization code provided');
        }
        
        const { exchangeCodeForTokens } = require('./services/auth/googleAuth');
        const { userInfo } = await exchangeCodeForTokens(code);
        
        // Find user in database
        const user = await User.findOne({ googleId: userInfo.googleId });
        if (!user) {
            return res.status(404).redirect(`${FRONTEND_URL}/auth-error?error=user_not_found`);
        }
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );
        
        // Set cookie with JWT token
        res.cookie('jwt', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 604800000 // 7 days
        });
        
        res.redirect(`${FRONTEND_URL}/auth-success`);
    } catch (error) {
        console.error('Error in auth callback:', error);
        res.redirect(`${FRONTEND_URL}/auth-error?error=server_error`);
    }
});

// Get current user info
app.get('/user/me', authenticateJWT, async (req, res) => {
    try {
        // Return user info without sensitive data
        const userData = {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            profilePhoto: req.user.profilePhoto
        };
        
        res.json(userData);
    } catch (error) {
        console.error('Error getting user info:', error);
        res.status(500).json({ error: "Error retrieving user data" });
    }
});

app.get('/auth/status', async (req, res) => {
    try {
        const token = req.cookies.jwt || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.json({ authenticated: false, reason: "no_token" });
        }
        
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.userId);
            
            if (!user) {
                return res.json({ authenticated: false, reason: "user_not_found" });
            }
            
            const { getAuthClient, tokenExists } = require('./services/auth/googleAuth');
            const hasToken = await tokenExists();
            
            if (!hasToken) {
                return res.json({ authenticated: false, reason: "no_token_file" });
            }
            
            try {
                const authClient = await getAuthClient(true);
                if (authClient) {
                    const { getCalendarClient } = require('./services/auth/googleAuth');
                    const calendar = await getCalendarClient(true);
                    await calendar.calendarList.list({ maxResults: 1 });
                    
                    res.json({ 
                        authenticated: true,
                        user: {
                            id: user._id,
                            name: user.name,
                            email: user.email,
                            profilePhoto: user.profilePhoto
                        },
                        services: {
                            gmail: true,
                            calendar: true
                        }
                    });
                } else {
                    res.json({ authenticated: false, reason: "invalid_token" });
                }
            } catch (error) {
                res.json({ 
                    authenticated: false,
                    reason: "token_error",
                    error: "Invalid or expired token"
                });
            }
            
        } catch (error) {
            return res.json({ authenticated: false, reason: "invalid_jwt" });
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        res.status(500).json({ authenticated: false, error: "Server error checking authentication" });
    }
});

app.get('/auth/google', async (req, res) => {
    try {
        const { getAuthUrl } = require('./services/auth/googleAuth');
        const authUrl = await getAuthUrl();
        res.redirect(authUrl);
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send('Authentication failed');
    }
});

app.get('/auth/logout', async (req, res) => {
    try {
        // Clear JWT cookie
        res.clearCookie('jwt');
        
        const fs = require('fs').promises;
        const path = require('path');
        const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(process.cwd(), 'google_token.json');
        
        try {
            await fs.unlink(TOKEN_PATH);
            console.log('Token file deleted successfully');
        } catch (error) {
            console.log('No token file found to delete');
        }
        
        res.redirect(`${FRONTEND_URL}/logout`);
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).send('Error during logout');
    }
});

// Global error handler (for scalability)
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server vibin' on port ${PORT}`));