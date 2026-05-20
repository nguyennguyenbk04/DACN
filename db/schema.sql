-- Quizum MySQL schema
-- Run: docker exec -i mysql_dacn mysql -uroot -p${MYSQL_ROOT_PASSWORD} appdb < infra/mysql_schema.sql

CREATE DATABASE IF NOT EXISTS appdb CHARACTER SET = 'utf8mb4' COLLATE = 'utf8mb4_unicode_ci';
USE appdb;

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255),
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Jobs (BullMQ orchestration — one row per uploaded file) ───────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,  -- BullMQ job id
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(64),
  status     ENUM('ready','queued','running','completed','failed') NOT NULL DEFAULT 'ready',
  payload    JSON,
  result     JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_jobs_user   ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- ── Summaries (one per generation run, keyed to job) ─────────────────────────
CREATE TABLE IF NOT EXISTS summaries (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     VARCHAR(64) NOT NULL,
  user_id    BIGINT UNSIGNED,
  length     ENUM('short','medium','long') NOT NULL DEFAULT 'medium',
  summary    TEXT NOT NULL,
  model      VARCHAR(128) DEFAULT 'pegasus-trained',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id)  REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_summaries_job ON summaries(job_id);

-- ── Quizzes (one per generation run) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id     VARCHAR(64) NOT NULL,
  user_id    BIGINT UNSIGNED,
  model      VARCHAR(128),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id)  REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_quizzes_job ON quizzes(job_id);

-- ── Questions (MCQ options + correct answer stored as JSON) ──────────────────
CREATE TABLE IF NOT EXISTS questions (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quiz_id    BIGINT UNSIGNED NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  question   TEXT NOT NULL,
  options    JSON NOT NULL,   -- ["opt1","opt2","opt3","opt4"]
  correct_index INT NOT NULL,
  correct_answer TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_questions_quiz ON questions(quiz_id);

-- ── Quiz attempts (user practice scores) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quiz_id     BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED,
  score       DECIMAL(5,2) DEFAULT 0,
  total       INT DEFAULT 0,
  details     JSON,
  finished_at DATETIME,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quiz_id)  REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_attempts_quiz ON quiz_attempts(quiz_id);
