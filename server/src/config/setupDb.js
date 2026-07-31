const pool = require('./db');

const createTables = async () => {
  const queryText = `
    -- טבלת משתמשים
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- טבלת טוקנים מוצפנים לספקי אימייל
    CREATE TABLE IF NOT EXISTS oauth_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL, -- 'google' / 'microsoft'
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- טבלת מסמכים פיננסיים
    CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        company_name VARCHAR(255),
        amount DECIMAL(10, 2),
        currency VARCHAR(10) DEFAULT 'ILS',
        due_date DATE,
        invoice_date DATE,
        invoice_number VARCHAR(100),
        vat_number VARCHAR(50),
        category VARCHAR(50),
        doc_type VARCHAR(50), 
        status VARCHAR(50),   
        confidence_score DECIMAL(3, 2),
        file_path TEXT,       
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log('Database tables created successfully.');
  } catch (error) {
    console.error('Error creating database tables:', error);
  }
};

module.exports = createTables;