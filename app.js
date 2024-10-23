const express = require('express');
const db = require('./db'); // Import the database connection

const app = express();
const PORT = process.env.PORT || 3000;

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'your_secret_key'; // Change this to a secure key

app.use(express.json()); // Middleware to parse JSON

// User registration
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `INSERT INTO users (username, password) VALUES (?, ?)`;
    db.run(query, [username, hashedPassword], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'User registered successfully' });
    });
});

// User login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const query = `SELECT * FROM users WHERE username = ?`;
    db.get(query, [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    });
});

// Middleware to verify token
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Protecting all routes except registration and login
app.use(authenticateToken);

// Root route to respond with a simple message
app.get('/', (req, res) => {
    res.send('Welcome to the Personal Expense Tracker API');
});

// Endpoint to add a new transaction
app.post('/transactions', (req, res) => {
    const { type, category, amount, date, description } = req.body;

    // Validate required fields
    if (!type || !category || !amount || !date) {
        return res.status(400).json({ error: 'All fields (type, category, amount, date) are required' });
    }

    // Validate amount
    if (typeof amount !== 'number') {
        return res.status(400).json({ error: 'Amount must be a number' });
    }

    const query = `INSERT INTO transactions (type, category, amount, date, description) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [type, category, amount, date, description], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Transaction added successfully' });
    });
});

// Remaining endpoints (GET, PUT, DELETE, GET summary, GET reports)...
app.get('/transactions', (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const query = `SELECT * FROM transactions LIMIT ? OFFSET ?`;
    db.all(query, [limit, offset], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint to retrieve a transaction by ID
app.get('/transactions/:id', (req, res) => {
    const query = `SELECT * FROM transactions WHERE id = ?`;
    db.get(query, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        res.json(row);
    });
});

// Endpoint to update a transaction by ID
app.put('/transactions/:id', (req, res) => {
    const { type, category, amount, date, description } = req.body;

    // Validate required fields
    if (!type || !category || !amount || !date) {
        return res.status(400).json({ error: 'All fields (type, category, amount, date) are required' });
    }

    // Validate amount
    if (typeof amount !== 'number') {
        return res.status(400).json({ error: 'Amount must be a number' });
    }

    const query = `UPDATE transactions SET type = ?, category = ?, amount = ?, date = ?, description = ? WHERE id = ?`;
    db.run(query, [type, category, amount, date, description, req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        res.json({ message: 'Transaction updated successfully' });
    });
});

// Endpoint to delete a transaction by ID
app.delete('/transactions/:id', (req, res) => {
    const query = `DELETE FROM transactions WHERE id = ?`;
    db.run(query, [req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        res.json({ message: 'Transaction deleted successfully' });
    });
});

// Endpoint to get a summary of transactions with optional filters
app.get('/summary', (req, res) => {
    const { startDate, endDate, category } = req.query;

    let summaryQuery = `
        SELECT 
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense,
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS balance
        FROM transactions
    `;

    const params = [];
    if (startDate || endDate || category) {
        summaryQuery += ' WHERE';
        if (startDate) {
            summaryQuery += ' date >= ?';
            params.push(startDate);
        }
        if (endDate) {
            if (params.length > 0) summaryQuery += ' AND';
            summaryQuery += ' date <= ?';
            params.push(endDate);
        }
        if (category) {
            if (params.length > 0) summaryQuery += ' AND';
            summaryQuery += ' category = ?';
            params.push(category);
        }
    }

    db.get(summaryQuery, params, (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
});

// Monthly reports endpoint
app.get('/reports/monthly', (req, res) => {
    const query = `
        SELECT strftime('%Y-%m', date) AS month, category,
            SUM(amount) AS total_spending
        FROM transactions
        WHERE type = 'expense'
        GROUP BY month, category
    `;

    db.all(query, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Connected to the SQLite database.');
});