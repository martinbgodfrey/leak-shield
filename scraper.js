const { chromium } = require('playwright');

async function scanSingleSource(source, keywords, extraSubs = []) {
    console.log(`\n🚀 Scan: ${source.toUpperCase()}`);
    console.log(`📝 Keywords: ${keywords.join(', ')}`);
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] 
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    
    await context.addCookies([
        { name: 'over18', value: '1', domain: '.reddit.com', path: '/' },
        { name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' },
        { name: 'isAdult', value: 'true', domain: '.redgifs.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    // === REDDIT ===
    if (source === 'reddit') {
        const defaultSubs = [
            'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
            'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
            'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions',
            'OnlyFansBusty', 'OnlyFansPetite'
        ];
        
        const cleanExtras = extraSubs.map(s => s.replace(/^r\//, '').trim()).filter(s => s.length > 0);
        const finalSubs = [...new Set([...defaultSubs, ...cleanExtras])];

        console.log(`📍 Scanning ${finalSubs.length} subreddits...`);

        for (const term of keywords) {
            for (const sub of finalSubs) {
                try {
                    const url = `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&include_over_18=on&t=all`;
                    console.log(`  🔍 r/${sub}`);
                    
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    await page.waitForTimeout(1500);
                    
                    const results = await page.$$eval('.search-result-link', (els, sourceSub) => {
                        return els.map(el => {
                            const titleEl = el.querySelector('a.search-title');
                            const thumbEl = el.querySelector('.search-result-icon img');
                            const authorEl = el.querySelector('.author');
                            const timeEl = el.querySelector('.search-time time');
                            
                            return {
                                title: `[r/${sourceSub}] ${titleEl?.innerText || "Post"}`,
                                link: titleEl?.href || "",
                                date: timeEl?.innerText || "Recent",
                                source: 'Reddit',
                                thumb: thumbEl?.src || null,
                                author: authorEl?.innerText || "Unknown"
                            };
                        }).filter(item => item.link);
                    }, sub);
                    
                    if (results.length > 0) {
                        console.log(`    ✓ Found ${results.length}`);
                        allFindings.push(...results);
                    }
                } catch (e) {
                    console.log(`    ✗ Error: ${e.message}`);
                }
            }
        }
    }
    
    // === OTHER SITES ===
    else {
        for (const term of keywords) {
            try {
                let searchUrl = '';
                let container = '';
                let waitTime = 3000;
                
                if (source === 'pornhub') {
                    searchUrl = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr`;
                    container = '#videoSearchResult .pcVideoListItem, .videoBox';
                } else if (source === 'xvideos') {
                    searchUrl = `https://www.xvideos.com/?k=${encodeURIComponent(term)}&sort=uploaddate`;
                    container = '.thumb-block';
                } else if (source === 'xnxx') {
                    searchUrl = `https://www.xnxx.com/?k=${encodeURIComponent(term)}&sort=uploaddate`;
                    container = '.thumb-block';
                } else if (source === 'spankbang') {
                    searchUrl = `https://spankbang.com/s/${encodeURIComponent(term)}/?o=new`;
                    container = '.video-item';
                } else if (source === 'redgifs') {
                    searchUrl = `https://www.redgifs.com/gifs?query=${encodeURIComponent(term)}&order=new`;
                    waitTime = 15000; // Much longer wait for SPA
                    
                    console.log(`  → ${searchUrl}`);
                    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
                    
                    // STEP 1: Accept cookie consent
                    console.log(`  🍪 Accepting cookies...`);
                    const cookieButtons = [
                        'button:has-text("Accept")',
                        'button:has-text("I Agree")',
                        'button:has-text("Agree")',
                        '[class*="accept"]',
                        '[class*="consent"] button'
                    ];
                    
                    for (const sel of cookieButtons) {
                        try {
                            const btn = await page.$(sel);
                            if (btn) {
                                await btn.click({ timeout: 1000 });
                                console.log(`     ✓ Clicked cookie consent`);
                                await page.waitForTimeout(2000);
                                break;
                            }
                        } catch (e) {}
                    }
                    
                    // STEP 2: Wait for content to load (SPA rendering)
                    console.log(`  ⏳ Waiting for content to render...`);
                    await page.waitForTimeout(waitTime);
                    
                    // STEP 3: Scroll to trigger lazy loading
                    await page.evaluate(() => {
                        window.scrollTo(0, 500);
                    });
                    await page.waitForTimeout(2000);
                    
                    await page.evaluate(() => {
                        window.scrollTo(0, 1000);
                    });
                    await page.waitForTimeout(2000);
                    
                    // STEP 4: Diagnostics - what's there NOW?
                    const pageInfo = await page.evaluate(() => {
                        const allLinks = Array.from(document.querySelectorAll('a'));
                        return {
                            title: document.title,
                            totalLinks: allLinks.length,
                            watchLinks: allLinks.filter(a => a.href.includes('/watch/')).length,
                            gifElements: document.querySelectorAll('[class*="gif"]').length,
                            videoElements: document.querySelectorAll('video').length,
                            imgElements: document.querySelectorAll('img').length,
                            sampleWatchLinks: allLinks.filter(a => a.href.includes('/watch/')).slice(0, 5).map(a => a.href)
                        };
                    });
                    
                    console.log(`  🔍 REDGIFS (after wait):`);
                    console.log(`     Total links: ${pageInfo.totalLinks}`);
                    console.log(`     Watch links: ${pageInfo.watchLinks}`);
                    console.log(`     Gif elements: ${pageInfo.gifElements}`);
                    console.log(`     Videos: ${pageInfo.videoElements}`);
                    console.log(`     Images: ${pageInfo.imgElements}`);
                    console.log(`     Sample watch links:`, pageInfo.sampleWatchLinks);
                    
                    // STEP 5: Try to extract
                    if (pageInfo.watchLinks > 0) {
                        container = 'a[href*="/watch/"]';
                        console.log(`  ✓ Using selector: ${container}`);
                    } else {
                        console.log(`  ✗ Still no content - Redgifs may require authentication or different approach`);
                        continue;
                    }
                    
                    if (maxCount > 0) {
                        console.log(`  ✓ Using: "${bestSelector}" (${maxCount} elements)`);
                        container = bestSelector;
                    } else {
                        console.log(`  ✗ NO ELEMENTS FOUND - Redgifs may use JavaScript rendering`);
                        continue;
                    }
                } else {
                    throw new Error(`Unknown source: ${source}`);
                }
                
                // REGULAR SITES (NOT REDGIFS) - Navigate here
                if (source !== 'redgifs') {
                    console.log(`  → ${searchUrl}`);
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
                    await page.waitForTimeout(waitTime);
                }
                
                // Check elements
                const elementCount = await page.$$eval(container, els => els.length).catch(() => 0);
                console.log(`  📊 Elements: ${elementCount}`);
                
                if (elementCount === 0) {
                    console.log(`  ⚠️  No results`);
                    continue;
                }
                
                // Extract results
                const results = await page.$$eval(container, (els, siteName) => {
                    return els.slice(0, 30).map(el => {
                        let title = "Found";
                        let link = "";
                        let date = "Unknown";
                        
                        if (siteName === 'pornhub') {
                            const t = el.querySelector('.title a') || el.querySelector('a[title]');
                            title = t?.getAttribute('title') || "Pornhub Video";
                            link = t ? "https://pornhub.com" + t.getAttribute('href') : "";
                            date = el.querySelector('.added')?.innerText || "Recent";
                        } else if (siteName === 'xvideos') {
                            const t = el.querySelector('.thumb-under a') || el.querySelector('a');
                            title = t?.getAttribute('title') || t?.innerText || "XVideos Video";
                            link = t?.href || "";
                        } else if (siteName === 'xnxx') {
                            if (el.closest('#related-videos')) return null;
                            const t = el.querySelector('.thumb-under a');
                            title = t?.getAttribute('title') || "XNXX Video";
                            link = t ? "https://xnxx.com" + t.getAttribute('href') : "";
                        } else if (siteName === 'spankbang') {
                            title = el.querySelector('.n')?.innerText || "SpankBang Video";
                            link = el.querySelector('a.thumb')?.href || "";
                            date = el.querySelector('.d')?.innerText || "Unknown";
                        } else if (siteName === 'redgifs') {
                            // Extract from link element
                            link = el.href || el.getAttribute('href') || "";
                            if (link && !link.startsWith('http')) {
                                link = 'https://www.redgifs.com' + link;
                            }
                            title = el.querySelector('[class*="title"]')?.innerText ||
                                   el.closest('[class*="card"]')?.querySelector('h3')?.innerText ||
                                   el.getAttribute('aria-label') ||
                                   "Redgifs Video";
                        }
                        
                        return { title, link, date, source: siteName };
                    }).filter(i => i && i.link && i.title);
                }, source);
                
                console.log(`  ✓ Results: ${results.length}`);
                allFindings.push(...results);
                
            } catch (e) {
                console.log(`  ✗ Failed: ${e.message}`);
            }
        }
    }

    await browser.close();
    
    const unique = [...new Map(allFindings.map(item => [item.link, item])).values()];
    console.log(`✅ Total: ${unique.length} unique\n`);
    
    return unique;
}

async function scanKeywords(keywords, extraSubs = []) {
    return await scanSingleSource('reddit', keywords, extraSubs);
}

module.exports = { scanKeywords, scanSingleSource };