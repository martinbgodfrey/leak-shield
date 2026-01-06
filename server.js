const express = require('express');
const bodyParser = require('body-parser');
const { scanSingleSource } = require('./scraper'); // Pointing to ROOT file

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(bodyParser.json());

app.post('/scan', async (req, res) => {
    // We now expect 'source' from the dropdown
    const { keywords, extraSubs, source } = req.body;
    console.log(`Incoming Request -> Source: ${source} | Keywords: ${keywords}`);

    try {
        if (!source || source === 'all') {
            return res.status(400).json({ error: "Please select a specific source from the dropdown." });
        }

        const data = await scanSingleSource(source, keywords, extraSubs);
        res.json({ success: true, count: data.length, data: data });

    } catch (error) {
        console.error("Server Scan Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/capture', async (req, res) => {
    res.json({ success: true, image: "https://via.placeholder.com/600x400?text=Screenshot+Saved" });
});

app.listen(PORT, () => {
    console.log(`\n✅ Digital Factory | Leak Monitor`);
    console.log(`🌐 Server running on port ${PORT}`);
});
