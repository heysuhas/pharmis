import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Configure dotenv
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Database connection pool
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'pharmis_password',
  database: process.env.DB_NAME || 'pharmis_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1); // Exit if database connection fails
  });

// Add error handler for pool
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection was closed. Reconnecting...');
  } else if (err.code === 'ER_CON_COUNT_ERROR') {
    console.error('Database has too many connections');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('Database connection was refused');
  } else {
    console.error('Database error:', err);
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.warn(`[AUTH] No token provided for ${req.method} ${req.originalUrl}`);
    console.warn(`[AUTH] Headers:`, req.headers);
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'pharmis_secret_key');
    req.user = verified;
    next();
  } catch (err) {
    console.warn(`[AUTH] Invalid token for ${req.method} ${req.originalUrl}`);
    console.warn(`[AUTH] Headers:`, req.headers);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Log activity
const logActivity = async (userId, activityType, description) => {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id, activity_type, description) VALUES (?, ?, ?)',
      [userId, activityType, description]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// =========== AUTH ROUTES ===========

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    // Check if user already exists
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (existingUsers.length > 0) {
      // Log registration attempt with existing email
      await logActivity(existingUsers[0].id, 'REGISTER_FAILED', `Registration attempted with existing email: ${email}`);
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Start a transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Insert user
      const [result] = await connection.query(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword]
      );
      const userId = result.insertId;
      // Create initial profile
      await connection.query('INSERT INTO profiles (user_id) VALUES (?)', [userId]);
      // test
      // Create initial emergency contact
      await connection.query(
        'INSERT INTO emergency_contacts (user_id, name, relationship, phone) VALUES (?, ?, ?, ?)',
        [userId, '', '', '']
      );
      
      // Generate token
      const token = jwt.sign(
        { id: userId, name, email },
        process.env.JWT_SECRET || 'pharmis_secret_key',
        { expiresIn: '30d' }
      );
      
      // Commit transaction
      await connection.commit();
      
      // Log successful registration
      await logActivity(userId, 'REGISTER_SUCCESS', 'User successfully created an account');
      
      res.status(201).json({
        token,
        user: { id: userId, name, email }
      });
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    // Log registration error
    await logActivity(null, 'REGISTER_ERROR', `Registration failed with error: ${error.message}`);
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message || 'Server error during registration' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      // Log failed login attempt with non-existent account
      await logActivity(null, 'LOGIN_FAILED', `Failed login attempt with non-existent email: ${email}`);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    const user = users[0];
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      // Log failed login attempt with wrong password
      await logActivity(user.id, 'LOGIN_FAILED', 'Failed login attempt with incorrect password');
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, name: user.username, email: user.email },
      process.env.JWT_SECRET || 'pharmis_secret_key',
      { expiresIn: '30d' }
    );
    
    // Log successful login
    await logActivity(user.id, 'LOGIN_SUCCESS', 'User logged in successfully');
    
    res.json({
      token,
      user: { id: user.id, name: user.username, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [users] = await pool.query('SELECT id, username, email, created_at FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // For frontend compatibility, return 'name' as username
    const user = users[0];
    res.json({
      id: user.id,
      name: user.username,
      email: user.email,
      created_at: user.created_at
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========== PROFILE ROUTES ===========

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  console.log(`[ROUTE] GET /api/profile hit. Headers:`, req.headers);
  try {
    const userId = req.user.id;
    // Get user info (name/email)
    const [users] = await pool.query(
      'SELECT username AS name, email FROM users WHERE id = ?',
      [userId]
    );
    const userInfo = users[0] || {};
    // Get profile data
    const [profiles] = await pool.query(
      'SELECT * FROM profiles WHERE user_id = ?',
      [userId]
    );
    if (profiles.length === 0) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const profile = profiles[0];
    // Get emergency contact
    const [contacts] = await pool.query(
      'SELECT * FROM emergency_contacts WHERE user_id = ?',
      [userId]
    );
    const emergencyContact = contacts.length > 0 ? contacts[0] : null;
    // Get allergies
    const [allergies] = await pool.query(
      'SELECT name FROM allergies WHERE user_id = ?',
      [userId]
    );
    // Get conditions
    const [conditions] = await pool.query(
      'SELECT name FROM medical_conditions WHERE user_id = ?',
      [userId]
    );
    // Get medications
    const [medications] = await pool.query(
      'SELECT name, dosage FROM medications WHERE user_id = ?',
      [userId]
    );
    res.json({
      ...userInfo,
      ...profile,
      emergencyContact,
      allergies: allergies.map(a => a.name),
      conditions: conditions.map(c => c.name),
      medications: medications.map(m => ({ name: m.name, dosage: m.dosage }))
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
});

// Update user profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  console.log(`[ROUTE] PUT /api/profile hit. Headers:`, req.headers);
  try {
    const userId = req.user.id;
    const {
      name,
      email,
      phone,
      dateOfBirth,
      gender,
      height,
      weight,
      bloodType,
      emergencyContact,
      allergies,
      conditions,
      medications
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }

    // Log received payload for debugging
    console.log('Profile update payload:', req.body);

    // Start a transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      // Update user info
      await connection.query(
        'UPDATE users SET username = ?, email = ? WHERE id = ?',
        [name, email, userId]
      );
      // Update profile
      await connection.query(
        `UPDATE profiles SET 
          phone = ?,
          date_of_birth = ?,
          gender = ?,
          height = ?,
          weight = ?,
          blood_type = ?
        WHERE user_id = ?`,
        [
          phone || null,
          dateOfBirth || null,
          gender || null,
          height || null,
          weight || null,
          bloodType || null,
          userId
        ]
      );
      // Update emergency contact
      if (emergencyContact) {
        const { name: ecName, relationship, phone: ecPhone } = emergencyContact;
        const [existingContacts] = await connection.query(
          'SELECT id FROM emergency_contacts WHERE user_id = ?',
          [userId]
        );
        if (existingContacts.length > 0) {
          await connection.query(
            'UPDATE emergency_contacts SET name = ?, relationship = ?, phone = ? WHERE user_id = ?',
            [ecName || '', relationship || '', ecPhone || '', userId]
          );
        } else {
          await connection.query(
            'INSERT INTO emergency_contacts (user_id, name, relationship, phone) VALUES (?, ?, ?, ?)',
            [userId, ecName || '', relationship || '', ecPhone || '']
          );
        }
      }
      // Update allergies
      await connection.query('DELETE FROM allergies WHERE user_id = ?', [userId]);
      if (Array.isArray(allergies) && allergies.length > 0) {
        const allergyValues = allergies.map(allergy => [userId, allergy]);
        await connection.query(
          'INSERT INTO allergies (user_id, name) VALUES ?',
          [allergyValues]
        );
      }
      // Update conditions
      await connection.query('DELETE FROM medical_conditions WHERE user_id = ?', [userId]);
      if (Array.isArray(conditions) && conditions.length > 0) {
        const conditionValues = conditions.map(condition => [userId, condition]);
        await connection.query(
          'INSERT INTO medical_conditions (user_id, name) VALUES ?',
          [conditionValues]
        );
      }
      // Update medications
      await connection.query('DELETE FROM medications WHERE user_id = ?', [userId]);
      if (Array.isArray(medications) && medications.length > 0) {
        const medicationValues = medications.map(med => [
          userId, 
          typeof med === 'string' ? med : med.name, 
          typeof med === 'string' ? null : med.dosage
        ]);
        await connection.query(
          'INSERT INTO medications (user_id, name, dosage) VALUES ?',
          [medicationValues]
        );
      }
      await connection.commit();
      await logActivity(userId, 'PROFILE_UPDATE', 'User updated their profile information');
      // Return updated profile
      const [profiles] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [userId]);
      const [contacts] = await pool.query('SELECT * FROM emergency_contacts WHERE user_id = ?', [userId]);
      const [allergiesList] = await pool.query('SELECT name FROM allergies WHERE user_id = ?', [userId]);
      const [conditionsList] = await pool.query('SELECT name FROM medical_conditions WHERE user_id = ?', [userId]);
      const [medicationsList] = await pool.query('SELECT name, dosage FROM medications WHERE user_id = ?', [userId]);
      res.json({
        ...profiles[0],
        emergencyContact: contacts.length > 0 ? contacts[0] : null,
        allergies: allergiesList.map(a => a.name),
        conditions: conditionsList.map(c => c.name),
        medications: medicationsList.map(m => ({ name: m.name, dosage: m.dosage }))
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// Add allergy
app.post('/api/profile/allergies', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { allergy } = req.body;
    if (!allergy) {
      return res.status(400).json({ message: 'Allergy name is required.' });
    }
    await pool.query(
      'INSERT INTO allergies (user_id, name) VALUES (?, ?)',
      [userId, allergy]
    );
    // Return updated list
    const [allergiesList] = await pool.query('SELECT name FROM allergies WHERE user_id = ?', [userId]);
    res.status(201).json({ message: 'Allergy added successfully', allergies: allergiesList.map(a => a.name) });
  } catch (error) {
    console.error('Error adding allergy:', error);
    res.status(500).json({ message: 'Server error while adding allergy' });
  }
});

app.delete('/api/profile/allergies/:allergy', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const allergy = decodeURIComponent(req.params.allergy).trim();
    await pool.query(
      'DELETE FROM allergies WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(?)',
      [userId, allergy]
    );
    const [allergiesList] = await pool.query('SELECT name FROM allergies WHERE user_id = ?', [userId]);
    res.json({ message: 'Allergy removed successfully', allergies: allergiesList.map(a => a.name) });
  } catch (error) {
    console.error('Error removing allergy:', error);
    res.status(500).json({ message: 'Server error while removing allergy' });
  }
});

// Add condition
app.post('/api/profile/conditions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { condition } = req.body;
    if (!condition) {
      return res.status(400).json({ message: 'Condition name is required.' });
    }
    await pool.query(
      'INSERT INTO medical_conditions (user_id, name) VALUES (?, ?)',
      [userId, condition]
    );
    // Return updated list
    const [conditionsList] = await pool.query('SELECT name FROM medical_conditions WHERE user_id = ?', [userId]);
    res.status(201).json({ message: 'Condition added successfully', conditions: conditionsList.map(c => c.name) });
  } catch (error) {
    console.error('Error adding condition:', error);
    res.status(500).json({ message: 'Server error while adding condition' });
  }
});

app.delete('/api/profile/conditions/:condition', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const condition = decodeURIComponent(req.params.condition).trim();
    await pool.query(
      'DELETE FROM medical_conditions WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(?)',
      [userId, condition]
    );
    const [conditionsList] = await pool.query('SELECT name FROM medical_conditions WHERE user_id = ?', [userId]);
    res.json({ message: 'Condition removed successfully', conditions: conditionsList.map(c => c.name) });
  } catch (error) {
    console.error('Error removing condition:', error);
    res.status(500).json({ message: 'Server error while removing condition' });
  }
});

// Add medication
app.post('/api/profile/medications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { medication } = req.body;
    if (!medication || !medication.name) {
      return res.status(400).json({ message: 'Medication name is required.' });
    }
    await pool.query(
      'INSERT INTO medications (user_id, name, dosage) VALUES (?, ?, ?)',
      [userId, medication.name, medication.dosage || null]
    );
    // Return updated list
    const [medicationsList] = await pool.query('SELECT name, dosage FROM medications WHERE user_id = ?', [userId]);
    res.status(201).json({ message: 'Medication added successfully', medications: medicationsList.map(m => ({ name: m.name, dosage: m.dosage })) });
  } catch (error) {
    console.error('Error adding medication:', error);
    res.status(500).json({ message: 'Server error while adding medication' });
  }
});

app.delete('/api/profile/medications/:medication', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const medication = decodeURIComponent(req.params.medication).trim();
    await pool.query(
      'DELETE FROM medications WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(?)',
      [userId, medication]
    );
    const [medicationsList] = await pool.query('SELECT name, dosage FROM medications WHERE user_id = ?', [userId]);
    res.json({ message: 'Medication removed successfully', medications: medicationsList.map(m => ({ name: m.name, dosage: m.dosage })) });
  } catch (error) {
    console.error('Error removing medication:', error);
    res.status(500).json({ message: 'Server error while removing medication' });
  }
});

// =========== DAILY LOG ROUTES ===========

// Get daily logs
app.get('/api/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM daily_logs WHERE user_id = ?';
    let params = [userId];
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    } else if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY date DESC';
    
    const [logs] = await pool.query(query, params);
    
    // Get the details for each log
    const logsWithDetails = await Promise.all(logs.map(async log => {
      // Get symptoms
      const [symptoms] = await pool.query(
        'SELECT name, severity, notes FROM symptoms WHERE daily_log_id = ?',
        [log.id]
      );
      
      // Get medications
      const [medications] = await pool.query(
        'SELECT name, dosage, taken FROM medication_logs WHERE daily_log_id = ?',
        [log.id]
      );
      
      return {
        ...log,
        symptoms,
        medications
      };
    }));
    
    res.json(logsWithDetails);
  } catch (error) {
    console.error('Error fetching daily logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create daily log
app.post('/api/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date, mood, notes, symptoms, medications } = req.body;
    
    // Start a transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Check if a log already exists for this date
      const [existingLogs] = await connection.query(
        'SELECT id FROM daily_logs WHERE user_id = ? AND date = ?',
        [userId, date]
      );
      
      let logId;
      
      if (existingLogs.length > 0) {
        // Update existing log
        logId = existingLogs[0].id;
        await connection.query(
          'UPDATE daily_logs SET mood = ?, notes = ? WHERE id = ?',
          [mood, notes, logId]
        );
        
        // Delete existing symptoms and medications for this log
        await connection.query('DELETE FROM symptoms WHERE daily_log_id = ?', [logId]);
        await connection.query('DELETE FROM medication_logs WHERE daily_log_id = ?', [logId]);
      } else {
        // Create new log
        const [result] = await connection.query(
          'INSERT INTO daily_logs (user_id, date, mood, notes) VALUES (?, ?, ?, ?)',
          [userId, date, mood, notes]
        );
        
        logId = result.insertId;
      }
      
      // Add symptoms
      if (symptoms && symptoms.length > 0) {
        const symptomValues = symptoms.map(symptom => [
          logId,
          symptom.name,
          symptom.severity,
          symptom.notes || null
        ]);
        
        await connection.query(
          'INSERT INTO symptoms (daily_log_id, name, severity, notes) VALUES ?',
          [symptomValues]
        );
      }
      
      // Add medications
      if (medications && medications.length > 0) {
        const medicationValues = medications.map(med => [
          logId,
          med.name,
          med.dosage || null,
          med.taken || false
        ]);
        
        await connection.query(
          'INSERT INTO medication_logs (daily_log_id, name, dosage, taken) VALUES ?',
          [medicationValues]
        );
      }
      
      await connection.commit();
      
      // Log activity
      await logActivity(userId, 'DAILY_LOG', 'User added/updated a daily health log');
      
      res.status(201).json({ id: logId, message: 'Daily log created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error creating daily log:', error);
    res.status(500).json({ message: 'Server error during log creation' });
  }
});

// Get a specific daily log
app.get('/api/logs/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;
    
    // Get the log
    const [logs] = await pool.query(
      'SELECT * FROM daily_logs WHERE user_id = ? AND date = ?',
      [userId, date]
    );
    
    if (logs.length === 0) {
      return res.status(404).json({ message: 'Daily log not found' });
    }
    
    const log = logs[0];
    
    // Get symptoms
    const [symptoms] = await pool.query(
      'SELECT name, severity, notes FROM symptoms WHERE daily_log_id = ?',
      [log.id]
    );
    
    // Get medications
    const [medications] = await pool.query(
      'SELECT name, dosage, taken FROM medication_logs WHERE daily_log_id = ?',
      [log.id]
    );
    
    res.json({
      ...log,
      symptoms,
      medications
    });
  } catch (error) {
    console.error('Error fetching daily log:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =========== LIFESTYLE ROUTES ===========

// Get lifestyle logs
app.get('/api/lifestyle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, startDate, endDate } = req.query;
    
    let query = 'SELECT * FROM lifestyle_logs WHERE user_id = ?';
    let params = [userId];
    
    if (type) {
      query += ' AND activity_type = ?';
      params.push(type);
    }
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    } else if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY date DESC, created_at DESC';
    
    const [logs] = await pool.query(query, params);
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching lifestyle logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create lifestyle log
app.post('/api/lifestyle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      date, 
      activity_type, 
      activity_name, 
      duration, 
      intensity, 
      quantity, 
      notes 
    } = req.body;
    
    const [result] = await pool.query(
      `INSERT INTO lifestyle_logs 
       (user_id, date, activity_type, activity_name, duration, intensity, quantity, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, date, activity_type, activity_name, duration, intensity, quantity, notes]
    );
    
    // Log activity
    await logActivity(userId, 'LIFESTYLE_LOG', `User logged ${activity_type} activity`);
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Lifestyle activity logged successfully' 
    });
  } catch (error) {
    console.error('Error creating lifestyle log:', error);
    res.status(500).json({ message: 'Server error during lifestyle log creation' });
  }
});

// =========== MEDICAL FILES ROUTES ===========

// Get medical files
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category } = req.query;
    
    let query = 'SELECT * FROM medical_files WHERE user_id = ?';
    let params = [userId];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    query += ' ORDER BY upload_date DESC';
    
    const [files] = await pool.query(query, params);
    
    res.json(files);
  } catch (error) {
    console.error('Error fetching medical files:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload medical file
app.post('/api/files', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { category } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const { filename, originalname, mimetype, size, path: filePath } = req.file;
    
    // Insert file record
    const [result] = await pool.query(
      `INSERT INTO medical_files 
       (user_id, name, original_name, file_path, file_size, file_type, category) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, filename, originalname, filePath, size, mimetype, category]
    );
    
    // Log activity
    await logActivity(userId, 'FILE_UPLOAD', `User uploaded a medical file: ${originalname}`);
    
    res.status(201).json({ 
      id: result.insertId, 
      name: filename,
      original_name: originalname,
      category,
      message: 'File uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

// Download medical file
app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;
    
    // Get file info
    const [files] = await pool.query(
      'SELECT * FROM medical_files WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );
    
    if (files.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const file = files[0];
    
    // Log activity
    await logActivity(userId, 'FILE_DOWNLOAD', `User downloaded a medical file: ${file.original_name}`);
    
    // Send file
    res.download(file.file_path, file.original_name);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ message: 'Server error during file download' });
  }
});

// Delete medical file
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fileId = req.params.id;
    
    // Get file info
    const [files] = await pool.query(
      'SELECT * FROM medical_files WHERE id = ? AND user_id = ?',
      [fileId, userId]
    );
    
    if (files.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const file = files[0];
    
    // Delete file from disk
    fs.unlink(file.file_path, async (err) => {
      if (err) {
        console.error('Error deleting file from disk:', err);
      }
      
      // Delete from database regardless of disk operation
      await pool.query('DELETE FROM medical_files WHERE id = ?', [fileId]);
      
      // Log activity
      await logActivity(userId, 'FILE_DELETE', `User deleted a medical file: ${file.original_name}`);
      
      res.json({ message: 'File deleted successfully' });
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Server error during file deletion' });
  }
});

// =========== INSIGHTS ROUTES ===========

// Groq API configuration
const GROQ_API_URL = process.env.GROQ_API_URL;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Health insights route
app.get('/api/insights', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeRange = '30' } = req.query; // Default to 30 days

    // Get user's health data from the last specified days
    const [logs] = await pool.query(
      `SELECT dl.*, 
        GROUP_CONCAT(DISTINCT s.name, ':', s.severity) as symptoms,
        GROUP_CONCAT(DISTINCT ml.name) as medications
       FROM daily_logs dl
       LEFT JOIN symptoms s ON s.daily_log_id = dl.id
       LEFT JOIN medication_logs ml ON ml.daily_log_id = dl.id
       WHERE dl.user_id = ? AND dl.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY dl.id
       ORDER BY dl.date DESC`,
      [userId, timeRange]
    );

    // Format the data for analysis
    const healthData = logs.map(log => ({
      date: log.date,
      mood: log.mood,
      sleep_hours: log.sleep_hours,
      water_intake: log.water_intake,
      exercise_minutes: log.exercise_minutes,
      symptoms: log.symptoms ? log.symptoms.split(',').map(s => {
        const [name, severity] = s.split(':');
        return { name, severity: parseInt(severity) };
      }) : [],
      medications: log.medications ? log.medications.split(',') : []
    }));

    // Generate insights using Groq API
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{
          role: "system",
          content: "You are a health analysis AI that generates insights from health data. Focus on identifying patterns, correlations, and actionable recommendations."
        }, {
          role: "user",
          content: `Analyze this health data and provide 3-5 key insights about patterns, correlations, and recommendations. Data: ${JSON.stringify(healthData)}`
        }],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const groqResult = await response.json();
    if (!groqResult.choices || !Array.isArray(groqResult.choices) || !groqResult.choices[0]?.message?.content) {
      console.error('Groq API error or unexpected response:', groqResult);
      return res.status(500).json({ message: 'AI service error: Unable to generate insights at this time.' });
    }
    const aiAnalysis = groqResult.choices[0].message.content;

    // Parse AI response and store insights
    const insights = aiAnalysis.split('\n')
      .filter(line => line.trim().length > 0)
      .map((insight, index) => {
        const title = insight.split(':')[0].trim().slice(0, 255);
        const content = (insight.split(':')[1]?.trim() || insight).slice(0, 10000); // truncate if needed
        const category = determineCategory(insight);
        // Format date for MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
        const generated_date = new Date().toISOString().slice(0, 19).replace('T', ' ');
        return { id: Date.now() + index, title, content, category, generated_date };
      })
      .filter(insight => !insight.title.toLowerCase().includes('no health data provided'));

    // Store insights in database
    for (const insight of insights) {
      await pool.query(
        'INSERT INTO health_insights (user_id, title, content, category, generated_date) VALUES (?, ?, ?, ?, ?)',
        [userId, insight.title, insight.content, insight.category, insight.generated_date]
      );
    }

    res.json(insights);
  } catch (error) {
    console.error('Error generating health insights:', error);
    res.status(500).json({ message: 'Error generating health insights' });
  }
});

function determineCategory(insight) {
  const lowerInsight = insight.toLowerCase();
  if (lowerInsight.includes('sleep')) return 'Sleep';
  if (lowerInsight.includes('exercise') || lowerInsight.includes('activity')) return 'Exercise';
  if (lowerInsight.includes('water') || lowerInsight.includes('hydration')) return 'Hydration';
  if (lowerInsight.includes('mood') || lowerInsight.includes('emotional')) return 'Mood';
  if (lowerInsight.includes('symptom') || lowerInsight.includes('pain')) return 'Symptoms';
  if (lowerInsight.includes('medication') || lowerInsight.includes('medicine')) return 'Medication';
  return 'General';
}

// Update mood chart endpoint to use real-time data
app.get('/api/dashboard/mood-chart', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;
    
    const [results] = await pool.query(
      `SELECT date, mood FROM daily_logs 
       WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY date ASC`,
      [userId, days]
    );
    
    res.json(results);
  } catch (error) {
    console.error('Error fetching mood chart data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get top symptoms
app.get('/api/dashboard/top-symptoms', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [results] = await pool.query(
      `SELECT s.name, COUNT(*) as count 
       FROM symptoms s
       JOIN daily_logs d ON s.daily_log_id = d.id
       WHERE d.user_id = ? AND d.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY s.name
       ORDER BY count DESC
       LIMIT 4`,
      [userId]
    );
    
    res.json(results);
  } catch (error) {
    console.error('Error fetching top symptoms:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use((req, res, next) => {
  console.warn(`[404] ${req.method} ${req.originalUrl} - Route not found`);
  res.status(404).json({ message: 'Route not found', path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});