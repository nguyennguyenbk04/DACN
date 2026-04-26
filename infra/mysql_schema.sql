-- MySQL schema for DACN project (users, videos, transcripts metadata, quizzes, jobs)
-- Run: docker exec -i mysql mysql -uroot -proot123 appdb < /home/bnguyen/Desktop/DACN/infra/mysql_schema.sql
CREATE DATABASE IF NOT EXISTS appdb CHARACTER SET = 'utf8mb4' COLLATE = 'utf8mb4_unicode_ci';
USE appdb;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  name VARCHAR(255),
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Videos metadata (stored in MinIO, referenced by key/url)
CREATE TABLE IF NOT EXISTS videos (
  id CHAR(36) NOT NULL PRIMARY KEY,          -- UUID
  owner_id BIGINT UNSIGNED NOT NULL,
  filename VARCHAR(512),
  storage_key VARCHAR(1024),                 -- MinIO object key
  storage_url TEXT,
  size_bytes BIGINT UNSIGNED DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  status ENUM('uploaded','processing','ready','failed') NOT NULL DEFAULT 'uploaded',
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_videos_owner ON videos(owner_id);

-- Quizzes (one per generation run; questions stored in questions table)
CREATE TABLE IF NOT EXISTS quizzes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  video_id CHAR(36) NOT NULL,
  created_by BIGINT UNSIGNED,
  type VARCHAR(64) DEFAULT 'mcq',
  title VARCHAR(255),
  model VARCHAR(128),
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_quizzes_video ON quizzes(video_id);

-- Questions (options/answer as JSON for flexibility)
CREATE TABLE IF NOT EXISTS questions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quiz_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  options JSON,       -- for MCQ: array of choices
  answer JSON,        -- canonical answer(s)
  source_segments JSON, -- optional: [{start,end,segmentId}]
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_questions_quiz ON questions(quiz_id);

-- Quiz attempts (user practice results)
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quiz_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED,
  score DECIMAL(5,2) DEFAULT 0,
  details JSON,       -- per-question responses, timings
  started_at DATETIME,
  finished_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_attempts_quiz ON quiz_attempts(quiz_id);

-- Jobs table for orchestration status and payload/result references
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(64) NOT NULL PRIMARY KEY,      -- BullMQ job id
  video_id VARCHAR(64),
  type VARCHAR(64),
  status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  payload JSON,
  result JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_jobs_status ON jobs(status);

-- Seed: example user (ignore if exists)
-- INSERT INTO users (email, name) 
-- SELECT 'test@example.com', 'Test User' 
-- FROM DUAL
-- WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='test@example.com');
