import { PlaywrightCrawler, Dataset } from 'crawlee';
import Fuse from 'fuse.js';

// --- CONFIGURATION ---
const INPUT = {
    keywords: ["Amouranth", "Amouranth OF", "Amouranth Leaked"], 
    // If time contains these, it's a LEAK
    recentTerms: ["minute", "hour", "day", "new", "moments ago", "just now"],
    // If time contains these, it's SAFE (ignored)
    oldTerms: ["year", "month", "week"]
};

const crawler = new PlaywrightCrawler({
    headless: true,
    launchContext: {
        launchOptions: {
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    },

    requestHandler: async ({ page, request, log }) => {
        // console.log(`\n🔍 Scanning: ${request.url}`);
        await new Promise(r => setTimeout(r, 2000)); // Wait for page load

        let videos = [];

        // ============================================================
        // PORNHUB SCANNER (Working Perfectly)
        // ============================================================
        if (request.url.includes('pornhub')) {
            try {
                await page.waitForSelector('#videoSearchResult', { timeout: 10000 });
                videos = await page.$$eval('#videoSearchResult .pcVideoListItem', (els) => {
                    return els.map(el => ({
                        title: el.querySelector('.title a')?.innerText?.trim() || "Unknown",
                        url: "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href'),
                        timeText: el.querySelector('.added')?.innerText?.trim() || "Old (Hidden)",
                        source: "Pornhub"
                    }));
                });
            } catch (err) {
                // Siently fail or log warning if blocked
            }
        }

        // ============================================================
        // SPANKBANG SCANNER (Best Effort)
        // ============================================================
        else if (request.url.includes('spankbang')) {
            try {
                await page.waitForSelector('.video-item', { timeout: 5000 });
                videos = await page.$$eval('.video-item', (els) => {
                    return els.map(el => ({
                        title: el.querySelector('.n')?.innerText || "Unknown",
                        url: "https://spankbang.com" + el.querySelector('a.thumb')?.getAttribute('href'),
                        rawText: el.innerText.replace(/\n/g, " "), 
                        source: "Spankbang"
                    }));
                });
            } catch (err) {
                // Spankbang often blocks bots, so we just skip it to keep the script running
                console.log(`⚠️ Spankbang blocked or empty. Moving on...`);
            }
        }

        // ============================================================
        // ANALYZER
        // ============================================================
        
        // 1. Clean the data
        videos = videos.map(v => {
            if (v.source === "Spankbang") {
                const match = v.rawText.match(/(\d+[mhdw]\s+ago)|(\bNew\b)/i);
                v.timeText = match ? match[0] : "Old";
            }
            return v;
        });

        // 2. Filter & Report
        if (videos.length > 0) {
            console.log(`\n✅ [${videos[0].source}] Extracted ${videos.length} videos. Analyzing...`);
            await processLeaks(videos);
        }
    },
});

async function processLeaks(videos) {
    // Fuzzy search to ensure title matches keyword
    const fuse = new Fuse(videos, { keys: ['title'], threshold: 0.4 });

    for (const keyword of INPUT.keywords) {
        const results = fuse.search(keyword);
        
        // We only show the top 3 matches in logs to keep it clean
        let processedCount = 0;

        for (const result of results) {
            const video = result.item;
            const timeLower = video.timeText.toLowerCase();

            // Skip garbage data
            if (timeLower.includes("old") || timeLower === "unknown") continue;

            const hasRecent = INPUT.recentTerms.some(t => timeLower.includes(t));
            const hasOld = INPUT.oldTerms.some(t => timeLower.includes(t));

            // DECISION ENGINE
            if ((hasRecent && !hasOld) || timeLower.includes('new')) {
                // --- ALARM: LEAK FOUND ---
                console.log(`\n🚨 LEAK DETECTED [${video.source}]`);
                console.log(`   Title: ${video.title}`);
                console.log(`   Time:  ${video.timeText}`);
                console.log(`   Link:  ${video.url}`);
                
                await Dataset.pushData({
                    status: "LEAK_FOUND",
                    keyword: keyword,
                    title: video.title,
                    url: video.url,
                    time: video.timeText,
                    scraped_at: new Date().toISOString()
                });
            } else {
                // --- SILENT LOG: Show we checked it ---
                if (processedCount < 3) {
                    console.log(`   [Checked] ${video.title.substring(0, 40)}... -> 🛑 Too Old (${video.timeText})`);
                    processedCount++;
                }
            }
        }
    }
}

// Run the crawler
const startUrls = [];
INPUT.keywords.forEach(kw => {
    const q = encodeURIComponent(kw);
    // startUrls.push(`https://spankbang.com/s/${q}/?o=new`); // Commented out Spankbang to focus on what works
    startUrls.push(`https://www.pornhub.com/video/search?search=${q}&o=mr`); 
});

console.log("🚀 Starting Leak Detector...");
await crawler.run(startUrls);
console.log("🏁 Scan Complete.");