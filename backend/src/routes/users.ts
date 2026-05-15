import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+~`|}{[\]:;?><,./\-=]).{8,}$/;
const PASSWORD_POLICY_MSG =
  'Password must be at least 8 characters and contain 1 uppercase letter, 1 number, and 1 special character.';

// ── Middleware ────────────────────────────────────────────────────────────────

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Requires admin privileges' });
    // @ts-ignore
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/users — list all users (admin only)
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json(users);
  } catch {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// POST /api/users — create a new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ message: PASSWORD_POLICY_MSG });
    }

    if (await User.findOne({ username })) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, isAdmin: !!isAdmin });
    await newUser.save();

    res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      isAdmin: newUser.isAdmin,
      createdAt: newUser.createdAt,
    });
  } catch {
    res.status(500).json({ message: 'Error creating user' });
  }
});

// DELETE /api/users/:id — delete a user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  // @ts-ignore
  if (req.user.userId === req.params.id) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }

  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

export default router;
