const { chromium } = require('playwright');

// GLOBAL BROWSER POOL (Reuse across scans)
let browserPool = null;

async function getBrowserContext() {
    if (!browserPool) {
        browserPool = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
        });
    }
    
    const context = await browserPool.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    
    return context;
}

// GRACEFUL SHUTDOWN
process.on('SIGINT', async () => {
    if (browserPool) await browserPool.close();
    process.exit();
});

// ============================================
// REDDIT SCANNER (Optimized)
// ============================================
async function scanReddit(keywords, extraSubs = [], onProgress) {
    const defaultSubs = [
        'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
        'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
        'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions',
        'OnlyFansBusty', 'OnlyFansPetite', 'collegesluts', 'RealGirls'
    ];
    
    const cleanExtras = extraSubs.map(s => s.replace('r/', '').trim()).filter(s => s);
    const allSubs = [...new Set([...defaultSubs, ...cleanExtras])];
    
    const context = await getBrowserContext();
    await context.addCookies([
        { name: 'over18', value: '1', domain: '.reddit.com', path: '/' }
    ]);
    
    const page = await context.newPage();
    const results = [];
    
    for (const term of keywords) {
        // Process subreddits in batches of 3 (parallel)
        for (let i = 0; i < allSubs.length; i += 3) {
            const batch = allSubs.slice(i, i + 3);
            
            const batchPromises = batch.map(async (sub) => {
                try {
                    const url = `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&include_over_18=on&t=all`;
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
                    
                    const findings = await page.$$eval('.search-result-link', (els, sourceSub) => {
                        return els.slice(0, 15).map(el => { // Limit to 15 per sub
                            const titleEl = el.querySelector('a.search-title');
                            const timeEl = el.querySelector('.search-time time');
                            const thumbEl = el.querySelector('.search-result-icon img');
                            
                            return { 
                                title: titleEl?.innerText?.trim() || "Reddit Post", 
                                link: titleEl?.href || "", 
                                date: timeEl?.getAttribute('datetime') || timeEl?.innerText || "Recent", 
                                source: 'Reddit',
                                subreddit: sourceSub,
                                thumbnail: thumbEl?.src || null
                            };
                        }).filter(item => item.link);
                    }, sub);
                    
                    if (onProgress && findings.length > 0) {
                        onProgress({ source: 'Reddit', sub, count: findings.length });
                    }
                    
                    return findings;
                    
                } catch (e) { 
                    console.log(`❌ Reddit r/${sub} failed:`, e.message);
                    return [];
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.flat());
            
            // Rate limiting between batches
            await new Promise(r => setTimeout(r, 500));
        }
    }
    
    await context.close();
    return results;
}

// ============================================
// TUBE SITE SCANNER (Optimized)
// ============================================
const TUBE_SITES = [
    {
        name: 'Erome',
        search: (k) => `https://www.erome.com/search?q=${encodeURIComponent(k)}`,
        container: '#room_rows .album',
        extract: (el) => ({
            title: el.querySelector('.album-title')?.innerText?.trim() || "Erome Album",
            link: el.querySelector('a.album-link')?.href || "",
            date: el.querySelector('.album-date')?.innerText || "Unknown",
            thumbnail: el.querySelector('img.lazy')?.getAttribute('data-original') || el.querySelector('img')?.src
        }),
        timeout: 10000
    },
    {
        name: 'SpankBang',
        search: (k) => `https://spankbang.com/s/${encodeURIComponent(k)}/`,
        container: '.video-item',
        extract: (el) => ({
            title: el.querySelector('.n')?.innerText?.trim() || "SpankBang Video",
            link: el.querySelector('a.thumb')?.href || "",
            date: el.querySelector('.d')?.innerText || "Unknown",
            thumbnail: el.querySelector('img.cover')?.src || el.querySelector('img')?.getAttribute('data-src')
        }),
        timeout: 12000
    },
    {
        name: 'Pornhub',
        search: (k) => `https://www.pornhub.com/video/search?search=${encodeURIComponent(k)}`,
        container: '#videoSearchResult .pcVideoListItem, .videoBox',
        extract: (el) => {
            const titleEl = el.querySelector('.title a') || el.querySelector('a[title]');
            return {
                title: titleEl?.getAttribute('title')?.trim() || titleEl?.innerText?.trim() || "Pornhub Video",
                link: titleEl?.href?.startsWith('http') ? titleEl.href : `https://pornhub.com${titleEl?.getAttribute('href') || ''}`,
                date: el.querySelector('.added')?.innerText || el.querySelector('.videoDetailsBlock')?.innerText || "Recent",
                thumbnail: el.querySelector('img')?.getAttribute('data-src') || el.querySelector('img')?.src
            };
        },
        cookies: [
            { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
            { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
        ],
        timeout: 15000
    },
    {
        name: 'XNXX',
        search: (k) => `https://www.xnxx.com/?k=${encodeURIComponent(k)}`,
        container: '.thumb-block',
        extract: (el) => {
            if (el.closest('#related-videos')) return null;
            const linkTag = el.querySelector('.thumb-under a') || el.querySelector('a');
            const title = linkTag?.getAttribute('title') || linkTag?.innerText?.trim() || "XNXX Video";
            const href = linkTag?.getAttribute('href') || "";
            return {
                title,
                link: href.startsWith('http') ? href : `https://www.xnxx.com${href}`,
                date: el.querySelector('.metadata')?.innerText || "Unknown",
                thumbnail: el.querySelector('img')?.getAttribute('data-src') || el.querySelector('img')?.src
            };
        },
        timeout: 12000
    },
    {
        name: 'XVideos',
        search: (k) => `https://www.xvideos.com/?k=${encodeURIComponent(k)}`,
        container: '.thumb-block, #main .mozaique .thumb-under',
        extract: (el) => {
            const linkTag = el.querySelector('p.title a') || el.querySelector('a[href*="/video"]');
            const title = linkTag?.getAttribute('title') || linkTag?.innerText?.trim() || "XVideos Video";
            const href = linkTag?.getAttribute('href') || "";
            return {
                title,
                link: href.startsWith('http') ? href : `https://www.xvideos.com${href}`,
                date: el.querySelector('.metadata span')?.innerText || "Unknown",
                thumbnail: el.querySelector('img')?.getAttribute('data-src') || el.querySelector('img')?.src
            };
        },
        timeout: 12000
    }
];

async function scanTubeSite(site, keyword, onProgress) {
    const context = await getBrowserContext();
    
    // Add site-specific cookies
    if (site.cookies) {
        await context.addCookies(site.cookies);
    }
    
    const page = await context.newPage();
    const results = [];
    
    try {
        console.log(`🔎 [${site.name}] Scanning for "${keyword}"...`);
        await page.goto(site.search(keyword), { 
            waitUntil: 'domcontentloaded', 
            timeout: site.timeout 
        });
        
        // Wait for content
        await page.waitForTimeout(2000);
        
        // Extract results
        const findings = await page.$$eval(site.container, (els, extractor) => {
            // Reconstruct function in browser context
            const extractFn = new Function('el', `return (${extractor})(el)`);
            return els.slice(0, 20).map(extractFn).filter(item => item && item.link);
        }, site.extract.toString());
        
        // Add source tag
        findings.forEach(item => { item.source = site.name; });
        
        if (onProgress) {
            onProgress({ source: site.name, count: findings.length });
        }
        
        results.push(...findings);
        
    } catch (e) {
        console.log(`❌ ${site.name} error:`, e.message);
    } finally {
        await context.close();
    }
    
    return results;
}

// ============================================
// MASTER SCANNER (Parallel Execution)
// ============================================
async function scanKeywords(keywords, extraSubs = [], onProgress = null) {
    console.log(`\n🚀 Starting scan for: ${keywords.join(', ')}\n`);
    
    const startTime = Date.now();
    
    // Run all sources in parallel
    const scanPromises = [
        // Reddit scan
        scanReddit(keywords, extraSubs, onProgress),
        
        // All tube sites in parallel
        ...keywords.flatMap(keyword => 
            TUBE_SITES.map(site => scanTubeSite(site, keyword, onProgress))
        )
    ];
    
    // Wait for all to complete
    const resultArrays = await Promise.all(scanPromises);
    const allResults = resultArrays.flat();
    
    // Deduplicate by URL
    const uniqueResults = [...new Map(allResults.map(item => [item.link, item])).values()];
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Scan complete in ${duration}s | Found ${uniqueResults.length} unique results\n`);
    
    return uniqueResults;
}

// Cleanup on exit
async function cleanup() {
    if (browserPool) {
        await browserPool.close();
        browserPool = null;
    }
}

module.exports = { scanKeywords, cleanup };