require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const helmet = require('helmet');
const path = require('path');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// Import routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

// Initialize Express app
const app = express();
const PORT = process.env.WEB_PORT || 3000;

// Set up view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'https://cdn.discordapp.com', 'data:'],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'nyrp-bot-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 60000 * 60 * 24 // 1 day
  },
  // Comment out MongoDB store for testing
  /*
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  })
  */
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// NYRP Server ID - replace with actual server ID
const NYRP_SERVER_ID = '111111111';

// For testing purposes, create a mock user
const mockUser = {
  id: '123456789',
  username: 'TestUser',
  discriminator: '1234',
  avatar: '1234567890abcdef',
  guilds: [
    {
      id: NYRP_SERVER_ID,
      name: 'New York Roleplay',
      icon: 'abcdef1234567890',
      permissions: 0x8, // Admin permission
      roles: ['Admin', 'Staff Manager', 'Moderator']
    }
  ],
  // Add staff-specific properties
  staffInfo: {
    joinDate: '2023-01-15',
    position: 'Senior Staff',
    activityScore: 85,
    lastActive: '2023-05-16T14:30:00Z',
    totalHours: 120,
    warningCount: 0
  }
};

// Use a mock strategy for testing
passport.use(new Strategy({
  clientID: process.env.DISCORD_CLIENT_ID || 'mock_client_id',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || 'mock_client_secret',
  callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
  scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
  // For testing, return the mock user
  return done(null, mockUser);
}));

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
}

// Staff authentication middleware - checks if user is in NYRP server
function isNYRPStaff(req, res, next) {
  if (req.isAuthenticated()) {
    // Check if user is in the NYRP server
    const inServer = req.user.guilds && req.user.guilds.some(guild => guild.id === NYRP_SERVER_ID);
    
    if (inServer) {
      return next();
    }
  }
  
  res.status(403).render('error', {
    title: 'Access Denied',
    user: req.user,
    message: 'You must be a member of the NYRP server to access this page.'
  });
}

// Mock authentication for testing
app.use((req, res, next) => {
  // Uncomment this line to simulate being logged in for testing
  req.user = mockUser;
  next();
});

// Routes
app.use('/auth', authRoutes);
app.use('/dashboard', isAuthenticated, isNYRPStaff, dashboardRoutes);

// Home route
app.get('/', (req, res) => {
  res.render('index', { 
    user: req.user,
    title: 'NYRP Staff Dashboard'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`NYRP Staff Dashboard running on http://localhost:${PORT}`);
});

module.exports = app; 