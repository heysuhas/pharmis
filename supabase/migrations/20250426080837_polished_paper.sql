-- PHARMIS Healthcare Self-Management Database Schema

-- -----------------------------------------------------
-- Database pharmis_db
-- -----------------------------------------------------
CREATE DATABASE IF NOT EXISTS pharmis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pharmis_db;

-- -----------------------------------------------------
-- Table users
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table profiles
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  height DECIMAL(5,2),
  weight DECIMAL(5,2),
  blood_type VARCHAR(5),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table emergency_contacts
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  relationship VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table allergies
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS allergies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table medical_conditions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_conditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table medications
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS medications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table daily_logs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  mood INT NOT NULL CHECK (mood BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, date)
);

-- -----------------------------------------------------
-- Table symptoms
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS symptoms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  daily_log_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 3),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table medication_logs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS medication_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  daily_log_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  taken BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table lifestyle_logs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS lifestyle_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  date DATE NOT NULL,
  activity_type ENUM('EXERCISE', 'SMOKING', 'DRINKING') NOT NULL,
  activity_name VARCHAR(100) NOT NULL,
  duration INT,
  intensity VARCHAR(50),
  quantity INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table medical_files
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_size INT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table health_insights
-- -----------------------------------------------------
CREATE TABLE health_insights (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  generated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX idx_health_insights_user_category ON health_insights(user_id, category);
CREATE INDEX idx_health_insights_date ON health_insights(generated_date);

-- -----------------------------------------------------
-- Table activity_logs
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  activity_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert some example data
INSERT INTO users (name, email, password) VALUES 
('John Doe', 'john@example.com', '$2b$10$GQT7q4vG7RzJVCYSzjdwO.QxnN8JSd1ovYOcqPe1dJCOUz2G8XSPi'); -- password: password123

-- User ID 1 profile data
INSERT INTO profiles (user_id, date_of_birth, gender, height, weight, blood_type, phone)
VALUES (1, '1985-07-15', 'male', 175.5, 70.2, 'O+', '555-123-4567');

-- Emergency contact for user 1
INSERT INTO emergency_contacts (user_id, name, relationship, phone)
VALUES (1, 'Jane Doe', 'Spouse', '555-987-6543');

-- Some allergies, conditions and medications for user 1
INSERT INTO allergies (user_id, name) VALUES 
(1, 'Peanuts'),
(1, 'Penicillin');

INSERT INTO medical_conditions (user_id, name) VALUES 
(1, 'Asthma'),
(1, 'Hypertension');

INSERT INTO medications (user_id, name, dosage) VALUES 
(1, 'Lisinopril', '10mg daily'),
(1, 'Ventolin HFA', 'As needed');

-- Sample daily logs for user 1
INSERT INTO daily_logs (user_id, date, mood, notes) VALUES
(1, DATE_SUB(CURDATE(), INTERVAL 6 DAY), 3, 'Feeling normal today.'),
(1, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 4, 'Good day, more energy than usual.'),
(1, DATE_SUB(CURDATE(), INTERVAL 4 DAY), 2, 'Low energy, slight headache.'),
(1, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 3, 'Back to normal.'),
(1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 5, 'Excellent day, very productive.'),
(1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 4, 'Good sleep, feeling well.'),
(1, CURDATE(), 3, 'Average day, nothing special to note.');

-- Add symptoms for some of the logs
INSERT INTO symptoms (daily_log_id, name, severity, notes) VALUES
(3, 'Headache', 2, 'Started in the morning, lasted all day.'),
(3, 'Fatigue', 2, 'Felt tired throughout the day.'),
(5, 'Sore throat', 1, 'Mild irritation in the morning.');

-- Add medication logs
INSERT INTO medication_logs (daily_log_id, name, dosage, taken) VALUES
(1, 'Lisinopril', '10mg', TRUE),
(2, 'Lisinopril', '10mg', TRUE),
(3, 'Lisinopril', '10mg', TRUE),
(3, 'Ventolin HFA', 'One puff', TRUE),
(4, 'Lisinopril', '10mg', TRUE),
(5, 'Lisinopril', '10mg', TRUE),
(6, 'Lisinopril', '10mg', TRUE),
(7, 'Lisinopril', '10mg', TRUE);

-- Add lifestyle logs
INSERT INTO lifestyle_logs (user_id, date, activity_type, activity_name, duration, intensity, quantity, notes) VALUES
(1, DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'EXERCISE', 'Walking', 30, 'Moderate', NULL, 'Morning walk in the park'),
(1, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'EXERCISE', 'Running', 45, 'High', NULL, 'Evening jog'),
(1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'EXERCISE', 'Yoga', 60, 'Low', NULL, 'Morning yoga session'),
(1, DATE_SUB(CURDATE(), INTERVAL 4 DAY), 'DRINKING', 'Wine', NULL, NULL, 2, 'Two glasses with dinner'),
(1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'SMOKING', 'Cigarettes', NULL, NULL, 5, 'Stressful day at work');

-- Add some health insights
INSERT INTO health_insights (user_id, title, content, category) VALUES
(1, 'Sleep Pattern Correlation', 'Your headaches appear to occur more frequently on days following less than 7 hours of sleep.', 'Sleep'),
(1, 'Hydration Impact', 'Increasing your water intake has correlated with a 30% reduction in reported fatigue levels.', 'Hydration'),
(1, 'Exercise Benefits', 'Days with 20+ minutes of exercise show improved mood scores by an average of 1.2 points.', 'Exercise');

-- Add some activity logs
INSERT INTO activity_logs (user_id, activity_type, description) VALUES
(1, 'LOGIN', 'User logged in successfully'),
(1, 'PROFILE_UPDATE', 'User updated their profile information'),
(1, 'DAILY_LOG', 'User added a new daily health log'),
(1, 'MEDICATION_ADDED', 'User added a new medication to their profile');