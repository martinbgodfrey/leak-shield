const express = require('express');
const bodyParser = require('body-parser');
const { scanKeywords } = require('./scraper');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());
app.use(express.static('public')); // Serve the HTML file

// API Endpoint to run the scan
app.post('/scan', async (req, res) => {
    const { keywords } = req.body;
    if (!keywords || keywords.length === 0) {
        return res.status(400).json({ error: "No keywords provided" });
    }

    console.log("Received scan request for:", keywords);
    
    try {
        const results = await scanKeywords(keywords);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
