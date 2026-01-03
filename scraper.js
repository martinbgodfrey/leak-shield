const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive');

async function scanKeywords(keywords) {
    console.log("🚀 Starting Deep Scan (Pages 1-5)...");
    
    // Launch with Docker args
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });
    
    // Age Verification Cookie
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allVideos = [];

    // KEYWORD LOOP
    for (const term of keywords) {
        // PAGINATION LOOP (Check Page 1, 2, 3, 4, 5)
        for (let pageNum = 1; pageNum <= 5; pageNum++) {
            const url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr&page=${pageNum}`;
            try {
                console.log(`🔎 Checking "${term}" - Page ${pageNum}...`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
                // Clear popups (only needed on page 1 usually)
                if (pageNum === 1) {
                    try {
                        const closeButton = await page.$('#accessAgeDisclaimerPHBtn');
                        if (closeButton) await closeButton.click();
                    } catch (err) {}
                }

                // Scrape Results
                const videos = await page.$$eval('#videoSearchResult .pcVideoListItem', (els) => {
                    return els.map(el => ({
                        title: el.querySelector('.title a')?.innerText?.trim() || "Unknown",
                        url: "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href'),
                        timeText: el.querySelector('.added')?.innerText?.trim() || "Old",
                        source: "Pornhub"
                    }));
                });

                if (videos.length === 0) {
                    console.log(`   ⚠️ No videos on Page ${pageNum}. Stopping this keyword.`);
                    break; // Stop checking pages if this one is empty
                }

                console.log(`   Found ${videos.length} videos on Page ${pageNum}`);
                allVideos = [...allVideos, ...videos];

            } catch (e) { 
                console.error(`   Error on Page ${pageNum}:`, e.message); 
            }
        }
    }

    // FILTER & SCREENSHOT
    console.log(`🧐 Analyzing ${allVideos.length} total videos...`);
    
    // BROADER FILTER: Now includes "week", "month", "day" to ensure you see results
    const recentTerms = ["minute", "hour", "day", "week", "month", "new", "now"];
    const leaks = [];
    const fuse = new Fuse(allVideos, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        for (const res of results) {
            const v = res.item;
            const t = v.timeText.toLowerCase();
            
            // If it matches our broader time filter...
            if (recentTerms.some(x => t.includes(x)) || t.includes('new')) {
                console.log(`📸 Saving Evidence: ${v.title} (${v.timeText})`);
                
                try {
                    // Go to video page
                    await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                    const screenshot = await page.screenshot({ fullPage: false });
                    
                    if (process.env.DRIVE_FOLDER_ID) {
                        // Create a safe filename
                        const cleanTitle = v.title.replace(/[^a-z0-9]/gi, '_').substring(0, 20);
                        const filename = `EVIDENCE_${cleanTitle}_${Date.now()}.png`;
                        
                        await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                        v.evidence = "Saved to Drive ✅";
                    }
                } catch (e) {
                    console.error("   Screenshot failed:", e.message);
                }
                leaks.push(v);
            }
        }
    }

    await browser.close();
    console.log(`✅ Deep Scan Complete. Found ${leaks.length} actionable leaks.`);
    return leaks;
}

module.exports = { scanKeywords };
