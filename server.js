const express = require('express');
const { scanKeywords } = require('./scraper');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// FIX: Use built-in middleware to parse JSON
app.use(express.json());
app.use(express.static('public')); 

app.post('/scan', async (req, res) => {
    // Debug Log: Check if the message arrived
    console.log("📨 Incoming Request Body:", req.body);

    if (!req.body || !req.body.keywords) {
        return res.status(400).json({ error: "No keywords provided in request body" });
    }

    const { keywords } = req.body;
    
    try {
        const results = await scanKeywords(keywords);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error("❌ Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
