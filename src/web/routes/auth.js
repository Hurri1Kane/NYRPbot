const express = require('express');
const passport = require('passport');
const router = express.Router();

// Login route
router.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { 
    title: 'Login - NYRP Bot Dashboard',
    user: req.user
  });
});

// Discord OAuth login
router.get('/discord', passport.authenticate('discord'));

// Discord OAuth callback
router.get('/discord/callback', 
  passport.authenticate('discord', { 
    failureRedirect: '/auth/login'
  }), 
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      console.error('Error during logout:', err);
    }
    res.redirect('/');
  });
});

module.exports = router; 