const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { authenticate } = require('@google-cloud/local-auth');
const User = require('../../models/User');
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// Use environment variable for token storage when available.  
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || path.join(process.cwd(), 'google_token.json');
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || path.join(process.cwd(), 'credentials.json');
const REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3000/auth/google/callback';

let authClient = null;
let gmailClient = null;
let calendarClient = null;
let lastClientRefresh = 0;
const CLIENT_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Encrypt tokens before storing in DB
function encryptData(data, key = process.env.ENCRYPTION_KEY) {
  if (!key) {
    console.warn('No encryption key found. Using less secure storage.');
    return JSON.stringify(data);
  }
  
  try {
    // Fix: Create a proper 32-byte key by hashing the provided key
    const hash = crypto.createHash('sha256');
    hash.update(key);
    const keyBuffer = hash.digest();
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: authTag.toString('hex')
    });
  } catch (error) {
    console.error('Encryption error:', error);
    return JSON.stringify(data);
  }
}

// Decrypt tokens when retrieving from DB
function decryptData(encryptedJson, key = process.env.ENCRYPTION_KEY) {
  if (!key) {
    console.warn('No encryption key found. Using less secure storage.');
    return JSON.parse(encryptedJson);
  }
  
  try {
    // Fix: Create a proper 32-byte key by hashing the provided key (same as in encryptData)
    const hash = crypto.createHash('sha256');
    hash.update(key);
    const keyBuffer = hash.digest();
    
    const { iv, encryptedData, authTag } = JSON.parse(encryptedJson);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', 
      keyBuffer, 
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return JSON.parse(encryptedJson);
  }
}

async function tokenExists() {
  try {
    await fs.access(TOKEN_PATH);
    return true;
  } catch (error) {
    return false;
  }
}

async function getAuthUrl() {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    
    const oAuth2Client = new google.auth.OAuth2(
      key.client_id,
      key.client_secret,
      REDIRECT_URL
    );
    
    return oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    throw error;
  }
}

async function getAuthClient(skipBrowserAuth = false) {
  try {
    const now = Date.now();
    if (authClient && (now - lastClientRefresh) < CLIENT_REFRESH_INTERVAL) {
      return authClient;
    }
    
    console.log('Initializing Google auth client...');
    let client = null;
    try {
      const content = await fs.readFile(TOKEN_PATH);
      const credentials = JSON.parse(content);
      client = google.auth.fromJSON(credentials);
      console.log('Loaded existing token from', TOKEN_PATH);
    } catch (err) {
      console.log('No saved token found.');
      if (skipBrowserAuth) {
        console.log('Skipping browser auth as requested.');
        return null;
      }
    }
    
    if (!client && !skipBrowserAuth) {
      client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
        redirectUri: REDIRECT_URL
      });
      
      if (client.credentials) {
        const keys = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
          type: 'authorized_user',
          client_id: key.client_id,
          client_secret: key.client_secret,
          refresh_token: client.credentials.refresh_token,
        });
        await fs.writeFile(TOKEN_PATH, payload);
        console.log('Token saved to', TOKEN_PATH);
      }
    }
    
    if (client) {
      authClient = client;
      lastClientRefresh = now;
      gmailClient = null;
      calendarClient = null;
    }
    
    return authClient;
  } catch (error) {
    console.error('Error in Google authentication:', error);
    throw error;
  }
}

async function getGmailClient(skipBrowserAuth = false) {
  if (gmailClient) return gmailClient;
  
  const authClient = await getAuthClient(skipBrowserAuth);
  if (!authClient) return null;
  
  gmailClient = google.gmail({ version: 'v1', auth: authClient });
  return gmailClient;
}

async function getCalendarClient(skipBrowserAuth = false) {
  if (calendarClient) return calendarClient;
  
  const authClient = await getAuthClient(skipBrowserAuth);
  if (!authClient) return null;
  
  calendarClient = google.calendar({ version: 'v3', auth: authClient });
  return calendarClient;
}

async function getUserInfo(auth) {
  const people = google.people({ version: 'v1', auth });
  const { data } = await people.people.get({
    resourceName: 'people/me',
    personFields: 'names,emailAddresses,photos'
  });
  
  const name = data.names && data.names.length > 0 ? data.names[0].displayName : '';
  const firstName = data.names && data.names.length > 0 ? data.names[0].givenName : '';
  const lastName = data.names && data.names.length > 0 ? data.names[0].familyName : '';
  const email = data.emailAddresses && data.emailAddresses.length > 0 ? data.emailAddresses[0].value : '';
  const photoUrl = data.photos && data.photos.length > 0 ? data.photos[0].url : '';
  
  return {
    name,
    firstName,
    lastName,
    email,
    profilePhoto: photoUrl
  };
}

async function exchangeCodeForTokens(code) {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    
    const oAuth2Client = new google.auth.OAuth2(
      key.client_id,
      key.client_secret,
      REDIRECT_URL
    );
    
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    
    // Get user info
    const userInfo = await getUserInfo(oAuth2Client);
    
    // Add Google ID to userInfo
    const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
    const { data } = await oauth2.userinfo.get();
    userInfo.googleId = data.id;
    
    // Save token to file
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: tokens.refresh_token || '',
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
    });
    
    await fs.writeFile(TOKEN_PATH, payload);
    console.log('Token saved to', TOKEN_PATH);
    
    // Save user data to MongoDB
    await saveUserData(userInfo, tokens);
    
    authClient = oAuth2Client;
    gmailClient = null;
    calendarClient = null;
    lastClientRefresh = Date.now();
    
    return {
      oAuth2Client,
      userInfo
    };
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

async function saveUserData(userInfo, tokens) {
  try {
    // Encrypt sensitive token data
    const encryptedTokens = encryptData(tokens);
    
    // Find or create user
    await User.findOneAndUpdate(
      { googleId: userInfo.googleId },
      { 
        ...userInfo,
        tokenData: encryptedTokens,
        lastLogin: new Date()
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    console.log(`User data saved/updated for: ${userInfo.email}`);
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

async function getUserFromToken(tokenData) {
  try {
    // Find user by token
    const user = await User.findOne({ 'tokenData.access_token': tokenData.access_token });
    if (!user) {
      throw new Error('User not found for this token');
    }
    return user;
  } catch (error) {
    console.error('Error getting user from token:', error);
    throw error;
  }
}

module.exports = {
  getAuthClient,
  getGmailClient,
  getCalendarClient,
  getAuthUrl,
  tokenExists,
  exchangeCodeForTokens,
  getUserInfo,
  getUserFromToken
};