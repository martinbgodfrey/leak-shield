const express = require('express');
const { scanKeywords } = require('./scraper');
const { generateDorks } = require('./dorks'); // New Dorking Module
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// --- 1. STANDARD SCAN (Existing) ---
app.post('/scan', async (req, res) => {
    const { keywords, extraSubs } = req.body;
    try {
        console.log(`🔎 Standard Scan: ${keywords}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 2. DEEP RESEARCH SCAN (New Feature) ---
app.post('/research', async (req, res) => {
    const { target } = req.body; // Expects a single target username/name
    try {
        console.log(`🕵️‍♂️ Deep Research Initiated for: ${target}`);
        
        // Generate Dorks
        const dorkQueries = generateDorks(target);
        console.log(`   Generated ${dorkQueries.length} Deep Search Vectors.`);

        let allResults = [];

        // Run scans sequentially to avoid rate limits
        for (const query of dorkQueries) {
            console.log(`   Dorking: ${query}`);
            try {
                // Reuse the existing scraper but with advanced queries
                const results = await scanKeywords([query], []); 
                // Tag results with the dork type
                const taggedResults = results.map(r => ({ ...r, source_dork: query }));
                allResults = allResults.concat(taggedResults);
            } catch (e) {
                console.log(`   Skipping dork "${query}" due to error.`);
            }
        }

        // Deduplicate results by URL
        const uniqueResults = Array.from(new Set(allResults.map(a => a.link)))
            .map(link => allResults.find(a => a.link === link));

        console.log(`✅ Research Complete. Found ${uniqueResults.length} distinct leads.`);
        res.json({ success: true, count: uniqueResults.length, data: uniqueResults });

    } catch (error) {
        console.error("Research Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 3. CAPTURE ENDPOINT (Solid Configuration) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
        });
        
        // Clean Headers (Fixes Pornhub Redirect)
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1920, height: 1080 },
             deviceScaleFactor: 1
        });

        // Cookies (The Working List)
        const cookies = [];
        const domain = new URL(url).hostname.replace('www.', '');

        if (url.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        }
        
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

        // Load Page
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); }
        
        // Smart Interaction
        try {
            // Reddit Expand (Safe Mode)
            if (url.includes('reddit')) {
                try { await page.click('div[data-test-id="post-content"] img', { timeout: 500 }); } catch(e) {}
            }

            // Tube Clicker
            if (url.includes('xnxx') || url.includes('xvideos') || url.includes('pornhub')) {
                const selectors = ['#disclaimer_btn_enter', '#disclaimer-block a', '.disclaimer-btn', 'button:has-text("Enter")'];
                for (const sel of selectors) {
                    try { await page.click(sel, { timeout: 500 }); } catch(e) {}
                }
            }
            
            await page.waitForTimeout(1500);
            await page.evaluate(() => { document.body.style.zoom = "0.8"; });

        } catch(e) { console.log("Interaction Error:", e.message); }

        // Screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

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
