const express = require('express');
const router = express.Router();
const { getGoogleAuthURL, googleAuthCallback } = require('../controllers/googleAuthController');

router.get('/google/url', getGoogleAuthURL);
router.get('/google/callback', googleAuthCallback);

module.exports = router;