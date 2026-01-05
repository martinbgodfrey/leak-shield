const express = require('express');
const { scanKeywords } = require('./scraper');
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
        console.log(`🔎 Scan: ${keywords.join(', ')} | Extra Subs: ${extraSubs?.length || 0}`);
        const results = await scanKeywords(keywords, extraSubs || []);
        
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
// CAPTURE ENDPOINT (FIXED REDDIT LOGIC)
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
            await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
        } catch (e) { 
            console.log("  ⚠️  Page load timeout, continuing...");
        }
        
        // ============================================
        // REDDIT SPECIFIC HANDLING (FIXED)
        // ============================================
        // ============================================
// REDDIT SPECIFIC HANDLING (FIXED)
// ============================================
if (hostname.includes('reddit')) {
    try {
        console.log("  🔧 Reddit detected - applying fixes...");
        
        // Wait for content to load
        await page.waitForTimeout(2500);
        
        // FIRST: Handle "Mature Content" warning (MUST BE FIRST!)
        const matureContentSelectors = [
            'button:has-text("Yes, I\'m Over 18")',
            'button:has-text("Yes, I'm Over 18")',
            'button[data-testid="over-18-button"]',
            'button:has-text("Continue")',
            'button:has-text("Log In")'  // Sometimes this appears
        ];
        
        for (const sel of matureContentSelectors) {
            try {
                const btn = await page.$(sel);
                if (btn) {
                    await btn.click({ timeout: 1000 });
                    await page.waitForTimeout(2000);
                    console.log(`  ✓ Clicked mature content: ${sel}`);
                    break;
                }
            } catch (e) {}
        }
        
        // SECOND: Close other overlays/popups
        const overlaySelectors = [
            'button[aria-label="Close"]',
            '.XPromoPopup__close',
            '[data-testid="xpromo-banner"] button',
            'button:has-text("Not now")',
            'button:has-text("Maybe Later")',
            '[aria-label="Close"]',
            '.styled-outbound-link button'
        ];
        
        for (const sel of overlaySelectors) {
            try {
                const btn = await page.$(sel);
                if (btn) {
                    await btn.click();
                    await page.waitForTimeout(500);
                    console.log(`  ✓ Closed overlay: ${sel}`);
                }
            } catch (e) {}
        }
        
        // THIRD: Expand image if present
        const imageSelectors = [
            'div[data-test-id="post-content"] img',
            'img[alt*="Post image"]',
            'a.thumbnail img',
            '.media-element img',
            'a[data-click-id="image"] img'
        ];
        
        for (const sel of imageSelectors) {
            try {
                const img = await page.$(sel);
                if (img) {
                    await img.click({ timeout: 1000 });
                    await page.waitForTimeout(1500);
                    console.log(`  ✓ Expanded image: ${sel}`);
                    break;
                }
            } catch (e) {}
        }
        
        // FOURTH: Scroll to content
        await page.evaluate(() => {
            const content = document.querySelector('[data-test-id="post-content"]') || 
                           document.querySelector('.Post') ||
                           document.querySelector('main');
            if (content) content.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        
        await page.waitForTimeout(1500);
        
    } catch (e) { 
        console.log("  ⚠️  Reddit interaction error:", e.message);
    }
}
        
        // ============================================
        // TUBE SITES HANDLING
        // ============================================
        if (hostname.includes('xnxx') || hostname.includes('xvideos') || hostname.includes('pornhub')) {
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
                            console.log(`  ✓ Clicked disclaimer: ${sel}`);
                            break;
                        }
                    } catch (e) {}
                }
            } catch (e) { 
                console.log("  ⚠️  Tube site interaction error:", e.message);
            }
        }

        // Zoom out for better view
        await page.evaluate(() => { document.body.style.zoom = "0.75"; });
        await page.waitForTimeout(1000);

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

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n✅ Digital Factory | Leak Monitor`);
    console.log(`🌐 Server running on port ${PORT}\n`);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    const { cleanup } = require('./scraper');
    await cleanup();
    process.exit(0);
});