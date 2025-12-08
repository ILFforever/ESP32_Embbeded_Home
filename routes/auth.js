const express = require('express');
const {
  register,
  login,
  getCurrentUser,
  logout,
  getAdmins,
  deleteAdmin,
  getUsers,
  deleteUser,
  assignNfcCard
} = require('../controllers/auth');

const router = express.Router();

const {protect, authorize} = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/curuser', protect, getCurrentUser);
router.get('/logout', protect, logout);
router.get('/admins', protect, authorize('admin'), getAdmins);
router.get('/users',protect, authorize('admin'), getUsers);
router.post('/assign-nfc', protect, authorize('admin'), assignNfcCard);

router.delete('/admins/:id', protect, authorize('admin'), deleteAdmin);
router.delete('/users/:id', protect, authorize('admin'), deleteUser);

module.exports = router;