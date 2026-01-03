const express = require('express');
const { scanKeywords } = require('./scraper');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. Enable JSON parsing (Fixes the "undefined" error)
app.use(express.json());

// 2. Serve the "public" folder as static files
app.use(express.static(path.join(__dirname, 'public')));

// 3. EXPLICITLY handle the Home Page (The "Foolproof" Fix)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(500).send("❌ Error: Dashboard file not found. Please redeploy.");
        }
    });
});

// 4. The Scan Endpoint (Only runs when you click the button)
app.post('/scan', async (req, res) => {
    console.log("📨 Scan Request Received:", req.body);

    if (!req.body || !req.body.keywords) {
        return res.status(400).json({ error: "No keywords provided in request body" });
    }

    try {
        const results = await scanKeywords(req.body.keywords);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error("❌ Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
