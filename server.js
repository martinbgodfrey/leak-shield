const express = require('express');
const { scanKeywords } = require('./scraper');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/scan', async (req, res) => {
    const { keywords, saveScreenshots } = req.body;

    if (!keywords) {
        return res.status(400).json({ error: "No keywords provided" });
    }
    
    console.log(`📨 Scan Request: "${keywords}" | Screenshots: ${saveScreenshots}`);

    try {
        const results = await scanKeywords(keywords, { saveScreenshots });
        res.json({ success: true, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
