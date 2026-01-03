const express = require('express');
const { scanKeywords } = require('./scraper');
const app = express();

// Use the PORT Railway gives us, or default to 3000
const port = process.env.PORT || 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up the view engine
app.set('view engine', 'ejs');

// 1. Health Check (for Railway to know we are alive)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 2. The Dashboard (Home Page)
app.get('/', (req, res) => {
    try {
        res.render('index', { results: null, loading: false, error: null });
    } catch (e) {
        console.error("Render Error:", e);
        res.status(500).send("Error loading dashboard: " + e.message);
    }
});

// 3. The Trigger (When user clicks "Scan")
app.post('/scan', async (req, res) => {
    console.log("Received scan request...");
    const keywordsRaw = req.body.keywords;
    
    if (!keywordsRaw) {
        return res.render('index', { results: null, error: "Please enter keywords." });
    }

    const keywords = keywordsRaw.split(',').map(k => k.trim());
    console.log(`Scanning for: ${keywords.join(', ')}`);

    try {
        const findings = await scanKeywords(keywords);
        console.log(`Scan complete. Found ${findings.length} results.`);
        res.render('index', { results: findings, searched: keywords, error: null });
    } catch (error) {
        console.error("Scraper Failed:", error);
        res.render('index', { results: [], error: "Scan Failed: " + error.message });
    }
});

// 4. Start the Server
// We bind to '0.0.0.0' to ensure Docker maps the port correctly
app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server started successfully on port ${port}`);
});