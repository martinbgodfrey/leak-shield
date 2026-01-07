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
                    // REDGIFS DIAGNOSTIC MODE
                    searchUrl = `https://www.redgifs.com/gifs?query=${encodeURIComponent(term)}&order=new`;
                    waitTime = 8000;
                    
                    console.log(`  → ${searchUrl}`);
                    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
                    await page.waitForTimeout(waitTime);
                    
                    // DIAGNOSTIC: What's on the page?
                    const pageInfo = await page.evaluate(() => {
                        return {
                            title: document.title,
                            bodyText: document.body.innerText.substring(0, 200),
                            totalLinks: document.querySelectorAll('a').length,
                            watchLinks: document.querySelectorAll('a[href*="watch"]').length,
                            gifElements: document.querySelectorAll('[class*="gif"]').length,
                            cardElements: document.querySelectorAll('[class*="card"]').length,
                            sampleHrefs: Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => a.href)
                        };
                    });
                    
                    console.log(`  🔍 REDGIFS DIAGNOSTICS:`);
                    console.log(`     Title: ${pageInfo.title}`);
                    console.log(`     Body preview: ${pageInfo.bodyText}`);
                    console.log(`     Total links: ${pageInfo.totalLinks}`);
                    console.log(`     Watch links: ${pageInfo.watchLinks}`);
                    console.log(`     Gif elements: ${pageInfo.gifElements}`);
                    console.log(`     Card elements: ${pageInfo.cardElements}`);
                    console.log(`     Sample URLs:`, pageInfo.sampleHrefs);
                    
                    // Test selectors
                    const testSelectors = [
                        'a[href*="/watch/"]',
                        'a[href^="/watch/"]',
                        '[class*="gif"] a',
                        '[class*="card"] a'
                    ];
                    
                    let bestSelector = '';
                    let maxCount = 0;
                    
                    for (const sel of testSelectors) {
                        const count = await page.$$eval(sel, els => els.length).catch(() => 0);
                        console.log(`     Selector "${sel}": ${count} elements`);
                        if (count > maxCount) {
                            maxCount = count;
                            bestSelector = sel;
                        }
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