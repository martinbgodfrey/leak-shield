const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive');

async function scanKeywords(keywords) {
    console.log("🚀 Starting Scan for:", keywords);
    
    const browser = await chromium.launch();
    // 1. Create a context with the "Age Verification" Cookie pre-loaded
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });
    
    // Inject the cookie that bypasses the "I am 18" screen
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allVideos = [];

    // 2. Search Pornhub
    for (const term of keywords) {
        const url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr`;
        try {
            console.log(`Searching: ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // --- DEBUG CAM: See what the bot sees ---
            // If this is the first keyword, snap a pic so we can verify the Age Gate is gone.
            if (term === keywords[0] && process.env.DRIVE_FOLDER_ID) {
                console.log("📸 Taking DEBUG snapshot of search page...");
                const debugShot = await page.screenshot();
                await uploadScreenshot(debugShot, 'DEBUG_VIEW_SEARCH_PAGE.png', process.env.DRIVE_FOLDER_ID);
            }

            // Attempt to clear any remaining popups manually
            try {
                const closeButton = await page.; // Common PH age button ID
                if (closeButton) await closeButton.click();
            } catch (err) { /* Ignore if button not found */ }

            // Scrape Results
            const videos = await page.$$eval('#videoSearchResult .pcVideoListItem', (els) => {
                return els.map(el => ({
                    title: el.querySelector('.title a')?.innerText?.trim() || "Unknown",
                    url: "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href'),
                    timeText: el.querySelector('.added')?.innerText?.trim() || "Old",
                    source: "Pornhub"
                }));
            });
            console.log(`Found ${videos.length} videos for "${term}"`);
            allVideos = [...allVideos, ...videos];
        } catch (e) { console.error(`Error scanning ${term}:`, e.message); }
    }

    // 3. Filter & Screenshot Leaks
    const recentTerms = ["minute", "hour", "day", "new", "moments ago", "now"];
    const leaks = [];
    const fuse = new Fuse(allVideos, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        for (const res of results) {
            const v = res.item;
            const t = v.timeText.toLowerCase();
            
            if (recentTerms.some(x => t.includes(x)) || t.includes('new')) {
                console.log(`📸 New Leak Found: ${v.title}`);
                try {
                    await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                    const screenshot = await page.screenshot({ fullPage: false });
                    
                    if (process.env.DRIVE_FOLDER_ID) {
                        const filename = `LEAK_${term}_${Date.now()}.png`;
                        await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                        v.evidence = "Saved to Drive ✅";
                    }
                } catch (e) {
                    console.error("Screenshot failed:", e.message);
                    v.evidence = "Screenshot Failed ❌";
                }
                leaks.push(v);
            }
        }
    }

    await browser.close();
    return leaks;
}

module.exports = { scanKeywords };
