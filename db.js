const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to SQLite database (ensure it matches your created database file name)
const dbPath = path.resolve(__dirname, 'expense_tracker.db');

// Initialize the SQLite database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Export the db instance for use in other parts of the app
module.exports = db; 
