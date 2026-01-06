const express = require('express');
const { scanKeywords, scanSingleSource } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

app.post('/scan', async (req, res) => {
    const { keywords, extraSubs } = req.body;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid keywords' });
    }
    try {
        console.log(`🔎 Scan: ${keywords.join(', ')}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error("❌ Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/scan-source', async (req, res) => {
    const { keywords, source, extraSubs } = req.body;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid keywords' });
    }
    if (!source) {
        return res.status(400).json({ success: false, error: 'No source specified' });
    }
    try {
        console.log(`🔎 Single Source: ${source} | ${keywords.join(', ')}`);
        const results = await scanSingleSource(source, keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results, source: source, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error("❌ Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'No URL provided' });
    
    console.log(`📸 Capture: ${url}`);
    let browser = null;
    
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });

        const cookies = [];
        const hostname = new URL(url).hostname;

        if (hostname.includes('reddit')) cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        else if (hostname.includes('pornhub')) cookies.push({ name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' }, { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' });
        else if (hostname.includes('xnxx') || hostname.includes('xvideos')) cookies.push({ name: 'adult_concept', value: '1', domain: `.${hostname.replace('www.', '')}`, path: '/' });

        if (cookies.length > 0) await context.addCookies(cookies);
        
        const page = await context.newPage();
        try { await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }); } catch (e) {}
        
        if (hostname.includes('reddit')) {
            try {
                await page.waitForTimeout(2500);
                const btns = [`button:has-text("Yes, I'm Over 18")`, 'button:has-text("Continue")'];
                for (const sel of btns) {
                    try { const b = await page.$(sel); if (b) { await b.click({ timeout: 1000 }); await page.waitForTimeout(2000); break; } } catch (e) {}
                }
            } catch (e) {}
        }

        await page.evaluate(() => { document.body.style.zoom = "0.75"; });
        await page.waitForTimeout(1000);

        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

        if (process.env.DRIVE_FOLDER_ID) {
            uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID).catch(e => {});
        }

        await browser.close();
        res.json({ success: true, image: `data:image/png;base64,${base64Image}`, filename });

    } catch (error) {
        if (browser) try { await browser.close(); } catch (e) {}
        console.error(`❌ Capture failed:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n✅ Digital Factory | Leak Monitor`);
    console.log(`🌐 Server running on port ${PORT}\n`);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});
