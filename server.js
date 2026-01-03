// server.js
const express = require('express');
const { scanKeywords } = require('./scraper');
const app = express();
const port = process.env.PORT || 3000;

// Setup
app.set('view engine', 'ejs'); // We will use EJS for simple HTML pages
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 1. The Dashboard (Home Page)
app.get('/', (req, res) => {
    res.render('index', { results: null, loading: false });
});

// 2. The Trigger (When user clicks "Scan")
app.post('/scan', async (req, res) => {
    const keywords = req.body.keywords.split(',').map(k => k.trim());
    
    // Run the Scraper
    try {
        const findings = await scanKeywords(keywords);
        res.render('index', { results: findings, searched: keywords });
    } catch (error) {
        res.render('index', { results: [], error: "Scan Failed: " + error.message });
    }
});

app.listen(port, () => {
    console.log(`🛡️ Dashboard running on port ${port}`);
});