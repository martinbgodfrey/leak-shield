const express = require('express');
const { scanKeywords } = require('./scraper');
const { generateDorks } = require('./dorks');
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
        console.log(`🔎 Standard Scan: ${keywords}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        res.json({ success: true, count: results.length, data: results });
    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- RESEARCH ENDPOINT ---
app.post('/research', async (req, res) => {
    const { target } = req.body;
    try {
        console.log(`🕵️‍♂️ Deep Research: ${target}`);
        const dorkQueries = generateDorks(target);
        let allResults = [];
        for (const query of dorkQueries) {
            try {
                const results = await scanKeywords([query], []);
                allResults = allResults.concat(results.map(r => ({ ...r, source_dork: query })));
            } catch (e) {}
        }
        // Deduplicate
        const uniqueResults = Array.from(new Set(allResults.map(a => a.link)))
            .map(link => allResults.find(a => a.link === link));
        
        res.json({ success: true, count: uniqueResults.length, data: uniqueResults });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- CAPTURE ENDPOINT (Reddit Timing Fix) ---
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    console.log(`📸 Capture Requested: ${url}`);
    
    let browser = null;
    try {
        browser = await chromium.launch({ 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] 
        });
        
        const context = await browser.newContext({
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
             viewport: { width: 1920, height: 1080 },
             deviceScaleFactor: 1
        });

        // COOKIES
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

        // LOAD PAGE
        try {
            // Reddit needs 'networkidle' to ensure images are actually loaded
            const waitMode = url.includes('reddit') ? 'networkidle' : 'domcontentloaded';
            await page.goto(url, { waitUntil: waitMode, timeout: 25000 });
        } catch(e) { console.log("   Page load timeout (continuing)..."); }
        
        // INTERACTION
        try {
            // --- REDDIT FIX: Wait for Animation ---
            if (url.includes('reddit')) {
                // Remove any "Open in App" popups that block the view
                await page.evaluate(() => {
                    const popups = document.querySelectorAll('shreddit-async-loader, #bottom-sheet-container');
                    popups.forEach(p => p.remove());
                });

                // Click to expand
                try { 
                    await page.click('div[data-test-id="post-content"] img', { timeout: 1000 });
                    console.log("   Clicked Reddit Image. Waiting for expansion...");
                    await page.waitForTimeout(2000); // CRITICAL: Wait for animation
                } catch(e) {
                    console.log("   Could not expand image (taking standard shot).");
                }
            }

            // TUBE SITES
            if (url.includes('xnxx') || url.includes('xvideos') || url.includes('pornhub')) {
                const selectors = ['#disclaimer_btn_enter', '#disclaimer-block a', '.disclaimer-btn', 'button:has-text("Enter")'];
                for (const sel of selectors) {
                    try { await page.click(sel, { timeout: 500 }); } catch(e) {}
                }
                await page.waitForTimeout(1000);
            }
            
            // ZOOM (80%)
            await page.evaluate(() => { document.body.style.zoom = "0.8"; });

        } catch(e) { console.log("Interaction Error:", e.message); }

        // CAPTURE
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
