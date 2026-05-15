import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

// Middleware to protect admin routes
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: 'Requires admin privileges' });
    }
    // @ts-ignore
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude passwords
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPassword,
      isAdmin: !!isAdmin,
    });

    await newUser.save();
    
    res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      isAdmin: newUser.isAdmin,
      createdAt: newUser.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Prevent an admin from deleting themselves
    // @ts-ignore
    if (req.user.userId === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

export default router;
