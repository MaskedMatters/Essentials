import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_dev';

router.get('/setup-status', async (req, res) => {
  try {
    const adminCount = await User.countDocuments({ isAdmin: true });
    res.json({ isSetupComplete: adminCount > 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error checking setup status' });
  }
});

router.post('/setup', async (req, res) => {
  try {
    const adminCount = await User.countDocuments({ isAdmin: true });
    if (adminCount > 0) {
      return res.status(400).json({ message: 'Setup has already been completed.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const adminUser = new User({
      username,
      password: hashedPassword,
      isAdmin: true,
    });

    await adminUser.save();
    
    // Automatically log them in after setup
    const token = jwt.sign({ userId: adminUser._id, username: adminUser.username, isAdmin: adminUser.isAdmin }, JWT_SECRET);
    res.status(201).json({ message: 'Admin user created successfully.', token, user: { username: adminUser.username, isAdmin: true } });
  } catch (error) {
    res.status(500).json({ message: 'Error creating admin user' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password as string);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id, username: user.username, isAdmin: user.isAdmin }, JWT_SECRET);
    res.json({ token, user: { username: user.username, isAdmin: user.isAdmin } });
  } catch (error) {
    res.status(500).json({ message: 'Error during login' });
  }
});

export default router;
