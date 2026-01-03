const { chromium } = require('playwright');
const Fuse = require('fuse.js');
const { uploadScreenshot } = require('./drive');

async function scanKeywords(keywords, options = { saveScreenshots: false }) {
    console.log(`🚀 Starting DRAGNET Scan (8 Sources) with Date Extraction...`);
    
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        locale: 'en-US'
    });

    const page = await context.newPage();
    let allFindings = [];

    // --- DEFINING THE TARGETS ---
    const sites = [
        {
            name: 'Erome',
            searchUrl: (k) => `https://www.erome.com/search?q=${encodeURIComponent(k)}`,
            container: '#room_results .album-link, .video-link'
        },
        {
            name: 'Reddit',
            searchUrl: (k) => `https://old.reddit.com/search?q=${encodeURIComponent(k)}&sort=new`,
            container: '.search-result-link'
        },
        {
            name: 'SpankBang',
            searchUrl: (k) => `https://spankbang.com/s/${encodeURIComponent(k)}/`,
            container: '.video-item'
        },
        {
            name: 'Pornhub',
            searchUrl: (k) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}&o=mr`,
            container: '#videoSearchResult .pcVideoListItem'
        },
        {
            name: 'RedTube',
            searchUrl: (k) => `https://www.redtube.com/?search=${encodeURIComponent(k)}`,
            container: '.video_block'
        },
        {
            name: 'XHamster',
            searchUrl: (k) => `https://xhamster.com/search?q=${encodeURIComponent(k)}`,
            container: 'div[data-video-id]'
        },
        {
            name: 'XVideos',
            searchUrl: (k) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}&sort=relevance`,
            container: '.frame-block, .thumb-block'
        },
        {
            name: 'XNXX',
            searchUrl: (k) => `https://www.xnxx.com/search/${encodeURIComponent(k)}`,
            container: '.thumb-block'
        }
    ];

    // --- SEARCH LOOP ---
    for (const site of sites) {
        for (const term of keywords) {
            const url = site.searchUrl(term);
            
            try {
                console.log(`🔎 [${site.name}] Checking "${term}"...`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                if (site.name === 'Pornhub') {
                    try { await page.click('#accessAgeDisclaimerPHBtn', {timeout: 1000}); } catch(e){}
                }

                // EXTRACT DATA
                const findings = await page.$$eval(site.container, (els, siteName) => {
                    return els.map(el => {
                        let title = "Unknown";
                        let link = "";
                        let date = "Unknown Date";

                        // --- CUSTOM PARSERS ---
                        if (siteName === 'Erome') {
                            title = el.querySelector('.album-title')?.innerText?.trim() || "Erome Album";
                            link = el.getAttribute('href') || el.parentElement.getAttribute('href');
                            // Erome search results are tricky for dates, often hidden. 
                            // We default to checking if "ago" is in the text summary.
                            date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0] || "Check Link";
                        }
                        else if (siteName === 'Reddit') {
                            title = el.querySelector('a.search-title')?.innerText?.trim();
                            link = el.querySelector('a.search-title')?.getAttribute('href');
                            date = el.querySelector('.search-time time')?.innerText || "Recent";
                        }
                        else if (siteName === 'SpankBang') {
                            title = el.querySelector('.t')?.innerText?.trim();
                            link = "https://spankbang.com" + el.querySelector('.t')?.getAttribute('href');
                            date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0] || "Unknown";
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
                            // XVideos/XNXX often put date in the metadata line
                            date = el.innerText.match(/(\d+\s\w+\sago)/)?.[0] || 
                                   el.innerText.match(/(\d{4})/)?.[0] || "Unknown";
                        }

                        return { title, url: link, date: date || "Unknown", source: siteName };
                    });
                }, site.name);

                const validFindings = findings.filter(f => f && f.title && f.url);
                allFindings = [...allFindings, ...validFindings];

            } catch (e) { 
                console.error(`   Error [${site.name}]:`, e.message); 
            }
        }
    }

    // --- ANALYSIS PHASE ---
    console.log(`📊 Analysis: Found ${allFindings.length} raw results. Filtering...`);

    const recentTerms = ["minute", "hour", "day", "week", "month", "new", "now", "recent", "ago", "2024", "2025"];
    const verifiedLeaks = [];
    const fuse = new Fuse(allFindings, { keys: ['title'], threshold: 0.4 });

    for (const term of keywords) {
        const results = fuse.search(term);
        
        for (const res of results) {
            const v = res.item;
            const t = v.date.toLowerCase();
            
            // Logic: Is it recent OR from a high-risk source?
            const isRecent = recentTerms.some(x => t.includes(x));
            const isHighRisk = v.source === 'Erome' || v.source === 'Reddit';

            if (isRecent || isHighRisk) {
                v.evidence = "Found (No Screenshot)";
                
                if (options.saveScreenshots) {
                    console.log(`📸 Snapping: [${v.source}] ${v.title}`);
                    try {
                        await page.goto(v.url, { waitUntil: 'load', timeout: 15000 });
                        const screenshot = await page.screenshot();
                        
                        if (process.env.DRIVE_FOLDER_ID) {
                            const filename = `EVIDENCE_${v.source}_${Date.now()}.png`;
                            await uploadScreenshot(screenshot, filename, process.env.DRIVE_FOLDER_ID);
                            v.evidence = "Saved to Drive ✅";
                        } else {
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
