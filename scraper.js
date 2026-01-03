const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive');

async function scanKeywords(keywords, options = { saveScreenshots: false }) {
    console.log(`🚀 Starting DEEP SCAN (Sort: Newest | Pages: 1-3)...`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });

    // Add cookies to bypass age gates
    await context.addCookies([
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'accessAgeDisclaimerRT', value: '1', domain: '.redtube.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    // --- DEFINING THE TARGETS (SORTED BY NEWEST) ---
    const sites = [
        {
            name: 'Erome', // Erome doesn't hold 'new' sort well in URL, sticking to default
            searchUrl: (k, p) => `https://www.erome.com/search?q=${encodeURIComponent(k)}&page=${p}`,
            container: '#room_results .album-link, .video-link'
        },
        {
            name: 'Reddit',
            searchUrl: (k, p) => `https://old.reddit.com/search?q=${encodeURIComponent(k)}&sort=new`, // Already new
            container: '.search-result-link'
        },
        {
            name: 'SpankBang',
            searchUrl: (k, p) => `https://spankbang.com/s/${encodeURIComponent(k)}/${p}/?o=new`,
            container: '.video-item'
        },
        {
            name: 'Pornhub',
            searchUrl: (k, p) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=d&page=${p}`, // o=d is Date
            container: '#videoSearchResult .pcVideoListItem'
        },
        {
            name: 'RedTube',
            searchUrl: (k, p) => `https://www.redtube.com/?search=${encodeURIComponent(k)}&ordering=newest&page=${p}`,
            container: '.video_block'
        },
        {
            name: 'XHamster',
            searchUrl: (k, p) => `https://xhamster.com/search?q=${encodeURIComponent(k)}&sort=new&page=${p}`,
            container: 'div[data-video-id]'
        },
        {
            name: 'XVideos',
            searchUrl: (k, p) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&sort=uploaddate&p=${p}`,
            container: '.frame-block, .thumb-block'
        },
        {
            name: 'XNXX', // XNXX structure: search/keyword/sort/page
            searchUrl: (k, p) => `https://www.xnxx.com/search/${encodeURIComponent(k)}/date/${p}`,
            container: '.thumb-block'
        }
    ];

    // --- SEARCH LOOP ---
    for (const site of sites) {
        for (const term of keywords) {
            // CHECKING PAGES 1 - 3
            for (let pageNum = 1; pageNum <= 3; pageNum++) {
                
                // Skip pages 2/3 for Reddit to avoid rate limits, scan deep on others
                if (site.name === 'Reddit' && pageNum > 1) continue;

                const url = site.searchUrl(term, pageNum);
                
                try {
                    console.log(`🔎 [${site.name}] Checking "${term}" (Page ${pageNum})...`);
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

                    // HANDLE POPUPS
                    if (pageNum === 1 && site.name === 'Pornhub') {
                        try { await page.click('#accessAgeDisclaimerPHBtn', {timeout: 1000}); } catch(e){}
                    }

                    // EXTRACT DATA
                    const findings = await page.$$eval(site.container, (els, siteName) => {
                        return els.map(el => {
                            let title = "Unknown";
                            let link = "";
                            let date = "Unknown";

                            if (siteName === 'Erome') {
                                title = el.querySelector('.album-title')?.innerText?.trim() || "Erome Album";
                                link = el.getAttribute('href') || el.parentElement.getAttribute('href');
                                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0] || "Recent"; 
                            }
                            else if (siteName === 'Reddit') {
                                title = el.querySelector('a.search-title')?.innerText?.trim();
                                link = el.querySelector('a.search-title')?.getAttribute('href');
                                date = el.querySelector('.search-time time')?.innerText || "Recent";
                            }
                            else if (siteName === 'SpankBang') {
                                title = el.querySelector('.t')?.innerText?.trim();
                                link = "https://spankbang.com" + el.querySelector('.t')?.getAttribute('href');
                                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0] || "Recent";
                            }
                            else if (siteName === 'Pornhub') {
                                title = el.querySelector('.title a')?.innerText?.trim();
                                link = "https://pornhub.com" + el.querySelector('.title a')?.getAttribute('href');
                                date = el.querySelector('.added')?.innerText?.trim();
                            }
                            else if (siteName === 'RedTube') {
                                title = el.querySelector('a.video_title')?.innerText?.trim();
                                link = "https://redtube.com" + el.querySelector('a.video_link')?.getAttribute('href');
                                date = el.querySelector('.added_time')?.innerText?.trim();
                            }
                            else if (siteName === 'XHamster') {
                                title = el.querySelector('.video-thumb__title')?.innerText?.trim();
                                link = el.querySelector('a.video-thumb__link')?.getAttribute('href');
                                date = el.querySelector('.video-thumb__upload-time')?.innerText?.trim();
                            }
                            else if (siteName === 'XVideos' || siteName === 'XNXX') {
                                const linkTag = el.querySelector('a') || el.parentElement.querySelector('a');
                                title = linkTag?.getAttribute('title') || linkTag?.innerText || "Video";
                                link = linkTag?.getAttribute('href');
                                if (link && !link.startsWith('http')) {
                                    link = (siteName === 'XVideos' ? "https://xvideos.com" : "https://xnxx.com") + link;
                                }
                                date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0] || "Recent";
                            }

                            return { title, url: link, date: date || "Unknown", source: siteName };
                        });
                    }, site.name);

                    const validFindings = findings.filter(f => f && f.title && f.url);
                    allFindings = [...allFindings, ...validFindings];

                } catch (e) { 
                    console.error(`   Error [${site.name}] Page ${pageNum}:`, e.message); 
                }
            }
        }
    }

    // --- ANALYSIS PHASE ---
    console.log(`📊 Analysis: Found ${allFindings.length} raw results. Filtering for relevance...`);

    // Extended filter terms since we are now looking at "Newest"
    const recentTerms = ["minute", "hour", "day", "week", "month", "new", "now", "recent", "ago", "2024", "2025"];
    const verifiedLeaks = [];
    const fuse = new Fuse(allFindings, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        // Strict matching for vague terms, looser for specific names
        const results = fuse.search(term);
        
        for (const res of results) {
            const v = res.item;
            const t = v.date.toLowerCase();
            
            // Check recency OR high risk source
            const isRecent = recentTerms.some(x => t.includes(x));
            const isHighRisk = v.source === 'Erome' || v.source === 'Reddit';

            // Because we sorted by Date, we can trust the results more, 
            // but we still filter to ensure we don't show "2 years ago" if the site ignored our sort.
            if (isRecent || isHighRisk) {
                v.evidence = "Found (No Screenshot)";
                
                if (options.saveScreenshots) {
                    console.log(`📸 Snapping: [${v.source}] ${v.title}`);
                    try {
                        await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                        const screenshot = await page.screenshot();
                        
                        if (process.env.DRIVE_FOLDER_ID && process.env.GOOGLE_CLIENT_EMAIL) {
                            const filename = `EVIDENCE_${v.source}_${Date.now()}.png`;
                            await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                            v.evidence = "Saved to Drive ✅";
                        } else {
                            // Suppress error if creds are just missing
                            v.evidence = "Drive Not Configured ⚠️";
                        }
                    } catch (e) {
                        v.evidence = "Screenshot Failed ❌";
                    }
                }
                
                verifiedLeaks.push(v);
            }
        }
    }

    await browser.close();
    return verifiedLeaks;
}

module.exports = { scanKeywords };
