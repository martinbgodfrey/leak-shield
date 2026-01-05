const express = require('express');
const { scanKeywords } = require('./scraper');
const { chromium } = require('playwright');
const { uploadScreenshot } = require('./drive');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// ============================================
// SCAN ENDPOINT (With Progress Streaming)
// ============================================
app.post('/scan', async (req, res) => {
    const { keywords, extraSubs } = req.body;
    
    // Validate input
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid keywords' });
    }
    
    try {
        console.log(`🔎 Scan: ${keywords.join(', ')} | Extra Subs: ${extraSubs?.length || 0}`);
        
        // Progress callback (optional - for future SSE implementation)
        const progressCallback = (update) => {
            console.log(`  ✓ ${update.source}: +${update.count} results`);
        };
        
        const results = await scanKeywords(keywords, extraSubs || [], progressCallback);
        
        res.json({ 
            success: true, 
            count: results.length, 
            data: results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("❌ Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CAPTURE ENDPOINT (Optimized)
// ============================================
app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    
    if (!url) {
        return res.status(400).json({ success: false, error: 'No URL provided' });
    }
    
    console.log(`📸 Capture: ${url}`);
    
    let browser = null;
    let startTime = Date.now();
    
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ] 
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 1
        });

        // Site-specific cookies
        const cookies = [];
        const hostname = new URL(url).hostname;

        if (hostname.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        } else if (hostname.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
            );
        } else if (hostname.includes('xnxx') || hostname.includes('xvideos')) {
            const domain = hostname.replace('www.', '');
            cookies.push({ name: 'adult_concept', value: '1', domain: `.${domain}`, path: '/' });
        }

        if (cookies.length > 0) {
            await context.addCookies(cookies);
        }
        
        const page = await context.newPage();

        // Load page with timeout
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch (e) { 
            console.log("  ⚠️  Page load timeout, continuing...");
        }
        
        // Handle age gates / disclaimers
        try {
            const disclaimerSelectors = [
                '#disclaimer_btn_enter',
                '.disclaimer-btn',
                'button:has-text("Enter")',
                'a:has-text("Enter")'
            ];
            
            for (const sel of disclaimerSelectors) {
                try {
                    if (await page.$(sel)) {
                        await page.click(sel, { timeout: 1000 });
                        await page.waitForTimeout(1500);
                        break;
                    }
                } catch (e) {}
            }
            
            // Expand Reddit images
            if (hostname.includes('reddit')) {
                try {
                    await page.click('div[data-test-id="post-content"] img', { timeout: 1000 });
                    await page.waitForTimeout(1000);
                } catch (e) {}
            }
            
        } catch (e) { 
            console.log("  ⚠️  Interaction error:", e.message);
        }

        // Zoom out for better view
        await page.evaluate(() => { document.body.style.zoom = "0.75"; });
        await page.waitForTimeout(1500);

        // Capture screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;

        // Upload to Drive (async, don't wait)
        if (process.env.DRIVE_FOLDER_ID) {
            uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
                .then(() => console.log(`  ✓ Uploaded to Drive: ${filename}`))
                .catch(e => console.log(`  ⚠️  Drive upload failed: ${e.message}`));
        }

        await browser.close();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ✓ Captured in ${duration}s`);
        
        res.json({ 
            success: true, 
            image: `data:image/png;base64,${base64Image}`, 
            filename 
        });

    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        console.error(`  ❌ Capture failed:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n✅ Digital Factory | Leak Monitor`);
    console.log(`🌐 Server running on port ${PORT}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    const { cleanup } = require('./scraper');
    await cleanup();
    process.exit(0);
});