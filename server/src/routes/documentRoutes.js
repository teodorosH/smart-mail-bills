const express = require('express');
const router = express.Router();

const {
  getDocuments,
  triggerEmailScan,
  downloadDocument
} = require('../controllers/documentController');

const verifyToken = require('../middleware/authMiddleware');

router.get('/', verifyToken, getDocuments);
router.get(
 '/download/:id',
 verifyToken,
 downloadDocument
);

router.post('/scan-emails', verifyToken, triggerEmailScan);

module.exports = router;