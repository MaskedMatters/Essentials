import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+~`|}{[\]:;?><,./\-=]).{8,}$/;
const PASSWORD_POLICY_MSG =
  'Password must be at least 8 characters and contain 1 uppercase letter, 1 number, and 1 special character.';

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/auth/setup-status — check whether initial setup has been completed
router.get('/setup-status', async (_req, res) => {
  try {
    const adminCount = await User.countDocuments({ isAdmin: true });
    res.json({ isSetupComplete: adminCount > 0 });
  } catch {
    res.status(500).json({ message: 'Error checking setup status' });
  }
});

// POST /api/auth/setup — create the first admin account
router.post('/setup', async (req, res) => {
  try {
    if (await User.countDocuments({ isAdmin: true }) > 0) {
      return res.status(400).json({ message: 'Setup has already been completed.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ message: PASSWORD_POLICY_MSG });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const adminUser = new User({ username, password: hashedPassword, isAdmin: true });
    await adminUser.save();

    const token = jwt.sign(
      { userId: adminUser._id, username: adminUser.username, isAdmin: adminUser.isAdmin },
      JWT_SECRET,
    );
    res.status(201).json({ token, user: { username: adminUser.username, isAdmin: true } });
  } catch {
    res.status(500).json({ message: 'Error creating admin user' });
  }
});

// POST /api/auth/login — authenticate a local user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password as string))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
    );
    res.json({ token, user: { username: user.username, isAdmin: user.isAdmin } });
  } catch {
    res.status(500).json({ message: 'Error during login' });
  }
});

export default router;
