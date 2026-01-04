const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// --- SEARCH ENDPOINT ---
app.post('/scan', async (req, res) => {
    const { keywords, extraSubs } = req.body;
    try {
        console.log(`🔎 Scan: ${keywords} | Extra Subs: ${extraSubs || 'None'}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CAPTURE ENDPOINT (Restored Stability) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        // 1. LAUNCH BROWSER (Standard Config)
        browser = await chromium.launch({ 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled' // Hides "Bot" status
            ] 
        });
        
        // 2. CONTEXT (Removed "Trick" Headers to fix Pornhub)
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1920, height: 1080 },
             deviceScaleFactor: 1
        });

        // 3. COOKIES (The "Working" List)
        const cookies = [];
        const domain = new URL(url).hostname.replace('www.', '');

        // Reddit
        if (url.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        }
        
        // Tube Sites (PH, XNXX, XVideos)
        if (url.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'il', value: '1', domain: '.pornhub.com', path: '/' }
            );
        } else if (url.includes('xnxx') || url.includes('xvideos')) {
             cookies.push(
                { name: 'adult_concept', value: '1', domain: `.${domain}`, path: '/' },
                { name: 'warning-agreed', value: '1', domain: `.${domain}`, path: '/' }
            );
        }

        await context.addCookies(cookies);
        const page = await context.newPage();

        // 4. LOAD PAGE
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); }
        
        // 5. INTERACTION LOGIC (Faster & Safer)
        try {
            // REDDIT: Try to expand, but don't wait long
            if (url.includes('reddit')) {
                try {
                    await page.click('div[data-test-id="post-content"] img', { timeout: 500 });
                } catch(e) {} // Ignore if not clickable
            }

            // TUBE SITES: Click "Enter" if visible
            if (url.includes('xnxx') || url.includes('xvideos') || url.includes('pornhub')) {
                const selectors = ['#disclaimer_btn_enter', '#disclaimer-block a', '.disclaimer-btn', 'button:has-text("Enter")'];
                for (const sel of selectors) {
                    try { await page.click(sel, { timeout: 500 }); } catch(e) {}
                }
            }
            
            // Wait briefly for settling
            await page.waitForTimeout(1500);

            // ZOOM (80%)
            await page.evaluate(() => { document.body.style.zoom = "0.8"; });

        } catch(e) { console.log("Interaction Error:", e.message); }

        // 6. CAPTURE
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

        // Upload
        uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID).catch(e => {});

        await browser.close();
        res.json({ success: true, image: `data:image/png;base64,${base64Image}`, filename });

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server started on port ${PORT}`);
});
