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
        console.log(`🔎 Legacy Scan: ${keywords.join(', ')}`);
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
        console.log(`🔎 Source Scan: ${source.toUpperCase()} | Keywords: ${keywords.join(', ')}`);
        const results = await scanSingleSource(source, keywords, extraSubs || []);
        
        res.json({ 
            success: true, 
            count: results.length, 
            data: results,
            source: source,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("❌ Source Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/capture', async (req, res) => {
    const { url, source } = req.body;
    
    if (!url) {
        return res.status(400).json({ success: false, error: 'No URL provided' });
    }
    
    console.log(`\n📸 CAPTURE REQUEST`);
    console.log(`   URL: ${url}`);
    console.log(`   Source: ${source}`);
    
    let browser = null;
    
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
            deviceScaleFactor: 1,
            locale: 'en-US'
        });

        const hostname = new URL(url).hostname;
        console.log(`   Hostname: ${hostname}`);

        const cookies = [];
        
        if (hostname.includes('reddit')) {
            cookies.push({ name: 'over18', value: '1', domain: '.reddit.com', path: '/' });
        } else if (hostname.includes('pornhub')) {
            cookies.push(
                { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
                { name: 'platform', value: 'pc', domain: '.pornhub.com', path: '/' }
            );
        } else if (hostname.includes('xnxx')) {
            cookies.push(
                { name: 'adult_concept', value: '1', domain: '.xnxx.com', path: '/' },
                { name: 'wptt-adult', value: '1', domain: '.xnxx.com', path: '/' }
            );
        } else if (hostname.includes('xvideos')) {
            cookies.push({ name: 'adult_concept', value: '1', domain: '.xvideos.com', path: '/' });
        } else if (hostname.includes('spankbang')) {
            cookies.push(
                { name: 'kt_age_confirmed', value: 'true', domain: '.spankbang.com', path: '/' },
                { name: 'kt_tconsent', value: '1', domain: '.spankbang.com', path: '/' }
            );
        
        }

        if (cookies.length > 0) {
            await context.addCookies(cookies);
            console.log(`   ✓ Set ${cookies.length} cookie(s)`);
        }
        
        const page = await context.newPage();

        console.log(`   ⏳ Loading page...`);
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            console.log(`   ✓ Page loaded`);
        } catch (e) { 
            console.log(`   ⚠️  Timeout (continuing)`);
        }
        
        await page.waitForTimeout(3000);
        
        // REDDIT
        if (hostname.includes('reddit')) {
            console.log(`   🔧 Reddit: Handling popups...`);
            
            const ageButtons = [
                'button:has-text("Yes, I\'m Over 18")',
                'button:has-text("Continue")',
                '.XPromoContinueButton button'
            ];
            
            for (const sel of ageButtons) {
                try {
                    const btn = await page.$(sel);
                    if (btn) {
                        await btn.click({ timeout: 2000 });
                        await page.waitForTimeout(3000);
                        console.log(`   ✓ Clicked age verification`);
                        break;
                    }
                } catch (e) {}
            }
            
            const closeButtons = ['button[aria-label="Close"]', '.XPromoPopup__close'];
            for (const sel of closeButtons) {
                try {
                    const btn = await page.$(sel);
                    if (btn) {
                        await btn.click({ timeout: 1000 });
                        await page.waitForTimeout(500);
                    }
                } catch (e) {}
            }
        }
        
        // TUBE SITES
        if (hostname.includes('pornhub') || hostname.includes('xnxx') || hostname.includes('xvideos') || hostname.includes('spankbang')) {
            console.log(`   🔧 Tube site: Checking disclaimers...`);
            
            const enterSelectors = [
                '#disclaimer_btn_enter',
                'button:has-text("Enter")',
                'a:has-text("Enter")',
                '.disclaimer-btn',
                'button:has-text("I am 18 or older")'
            ];
            
            for (const sel of enterSelectors) {
                try {
                    const btn = await page.$(sel);
                    if (btn) {
                        await btn.click({ timeout: 1000 });
                        await page.waitForTimeout(3000);
                        console.log(`   ✓ Clicked disclaimer`);
                        break;
                    }
                } catch (e) {}
            }
        }

        // BETTER FRAMING - Scroll to top, then down slightly
        await page.evaluate(() => { 
            window.scrollTo(0, 0); // Go to top first
            document.body.style.zoom = "0.67"; // Zoom out more to see full content
        });
        await page.waitForTimeout(500);
        
        // Slight scroll to show main content (not header)
        await page.evaluate(() => { 
            window.scrollTo(0, 100); // Just 100px down to skip nav
        });
        await page.waitForTimeout(1000);

        console.log(`   📷 Taking screenshot...`);
        const screenshotBuffer = await page.screenshot({ fullPage: false });
        const base64Image = screenshotBuffer.toString('base64');
        const filename = `EVIDENCE_${source}_${Date.now()}.png`;
        
        console.log(`   ✓ Screenshot captured (${(screenshotBuffer.length / 1024).toFixed(1)} KB)`);

        if (process.env.DRIVE_FOLDER_ID) {
            uploadScreenshot(screenshotBuffer, filename, process.env.DRIVE_FOLDER_ID)
                .then(() => console.log(`   ✓ Uploaded to Drive`))
                .catch(e => console.log(`   ⚠️  Drive upload failed`));
        }

        await browser.close();
        
        res.json({ 
            success: true, 
            image: `data:image/png;base64,${base64Image}`, 
            filename 
        });

    } catch (error) {
        if (browser) {
            try { await browser.close(); } catch (e) {}
        }
        console.error(`   ❌ CAPTURE FAILED:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n✅ Digital Factory | Leak Monitor`);
    console.log(`🌐 Server: http://localhost:${PORT}\n`);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});