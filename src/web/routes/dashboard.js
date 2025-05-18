const express = require('express');
const router = express.Router();

// Dashboard home
router.get('/', (req, res) => {
  res.render('dashboard/index', {
    title: 'Staff Dashboard - NYRP',
    user: req.user
  });
});

// Staff activity
router.get('/activity', (req, res) => {
  // Mock activity data
  const activityData = {
    weekly: [
      { day: 'Monday', hours: 4.5 },
      { day: 'Tuesday', hours: 3.2 },
      { day: 'Wednesday', hours: 5.0 },
      { day: 'Thursday', hours: 2.5 },
      { day: 'Friday', hours: 6.1 },
      { day: 'Saturday', hours: 8.3 },
      { day: 'Sunday', hours: 4.7 }
    ],
    monthly: 120,
    totalHours: 450
  };
  
  res.render('dashboard/activity', {
    title: 'My Activity - NYRP Staff',
    user: req.user,
    activityData: activityData
  });
});

// Staff management (admin only)
router.get('/staff', (req, res) => {
  // Mock staff data
  const staffMembers = [
    {
      id: '123456789',
      username: 'JohnDoe',
      discriminator: '1234',
      avatar: 'https://cdn.discordapp.com/avatars/123456789/abcdef1234567890.png',
      role: 'Senior Admin',
      joinDate: '2023-01-10',
      lastActive: '2023-05-16',
      activityScore: 95,
      status: 'active'
    },
    {
      id: '987654321',
      username: 'JaneSmith',
      discriminator: '4321',
      avatar: 'https://cdn.discordapp.com/avatars/987654321/fedcba0987654321.png',
      role: 'Moderator',
      joinDate: '2023-02-15',
      lastActive: '2023-05-15',
      activityScore: 85,
      status: 'active'
    },
    {
      id: '456789123',
      username: 'BobJohnson',
      discriminator: '6789',
      avatar: 'https://cdn.discordapp.com/avatars/456789123/123456789abcdef.png',
      role: 'Junior Staff',
      joinDate: '2023-03-20',
      lastActive: '2023-04-28',
      activityScore: 60,
      status: 'inactive'
    }
  ];
  
  res.render('dashboard/staff', {
    title: 'Staff Management - NYRP',
    user: req.user,
    staffMembers: staffMembers
  });
});

// Staff profile
router.get('/profile/:userId', (req, res) => {
  const { userId } = req.params;
  
  // Mock staff profile data
  const staffProfile = {
    id: userId,
    username: userId === req.user.id ? req.user.username : 'OtherStaff',
    discriminator: userId === req.user.id ? req.user.discriminator : '5678',
    avatar: userId === req.user.id ? 
      `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 
      'https://cdn.discordapp.com/avatars/456789123/123456789abcdef.png',
    role: userId === req.user.id ? 'Senior Staff' : 'Junior Staff',
    joinDate: '2023-01-15',
    activityScore: 85,
    lastActive: '2023-05-16',
    totalHours: 120,
    warningCount: 0,
    notes: 'Excellent staff member. Always helpful and responsive.',
    activityHistory: [
      { week: 'May 1-7', hours: 25 },
      { week: 'May 8-14', hours: 22 },
      { week: 'May 15-21', hours: 18 },
      { week: 'May 22-28', hours: 20 }
    ]
  };
  
  res.render('dashboard/profile', {
    title: `${staffProfile.username}'s Profile - NYRP Staff`,
    user: req.user,
    profile: staffProfile,
    isOwnProfile: userId === req.user.id
  });
});

// Reports
router.get('/reports', (req, res) => {
  // Mock report data
  const reports = [
    {
      id: 'rep-001',
      title: 'Weekly Activity Summary',
      date: '2023-05-14',
      type: 'activity',
      url: '/dashboard/reports/rep-001'
    },
    {
      id: 'rep-002',
      title: 'Staff Performance Review',
      date: '2023-05-01',
      type: 'performance',
      url: '/dashboard/reports/rep-002'
    },
    {
      id: 'rep-003',
      title: 'New Staff Onboarding',
      date: '2023-04-15',
      type: 'onboarding',
      url: '/dashboard/reports/rep-003'
    }
  ];
  
  res.render('dashboard/reports', {
    title: 'Reports - NYRP Staff',
    user: req.user,
    reports: reports
  });
});

// Settings
router.get('/settings', (req, res) => {
  res.render('dashboard/settings', {
    title: 'Settings - NYRP Staff',
    user: req.user
  });
});

module.exports = router; 