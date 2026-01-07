const { chromium } = require('playwright');

async function scanSingleSource(source, keywords, extraSubs = []) {
    console.log(`\n🚀 Scan Start: ${source.toUpperCase()}`);
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
        { name: 'age_verified', value: '1', domain: '.pornhub.com', path: '/' }
    ]);

    const page = await context.newPage();
    let allFindings = [];

    // REDDIT
    if (source === 'reddit') {
        const defaultSubs = [
            'onlyfanshottest', 'onlyfans101', 'promotesyouronlyfans', 
            'onlyfansmoms', 'onlyfansmilfs', 'sultsofonlyfans',
            'OnlyFansAsstastic', 'leaked_content', 'OnlyFansPromotions',
            'OnlyFansBusty', 'OnlyFansPetite'
        ];
        const cleanExtras = extraSubs.map(s => s.replace('r/', '').trim()).filter(s => s);
        const finalSubs = [...new Set([...defaultSubs, ...cleanExtras])];

        console.log(`📍 Scanning ${finalSubs.length} subreddits...`);

        for (const term of keywords) {
            for (const sub of finalSubs) {
                try {
                    const url = `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&include_over_18=on`;
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    
                    const results = await page.$$eval('.search-result-link', (els, sourceSub) => {
                        return els.map(el => {
                            const titleEl = el.querySelector('a.search-title');
                            const thumbEl = el.querySelector('.search-result-icon img');
                            const authorEl = el.querySelector('.author');
                            
                            return {
                                title: `[r/${sourceSub}] ${titleEl?.innerText || "Post"}`,
                                link: titleEl?.href || "",
                                date: el.querySelector('.search-time time')?.innerText || "Recent",
                                source: 'Reddit',
                                thumb: thumbEl?.src || null,
                                author: authorEl?.innerText || "Unknown"
                            };
                        });
                    }, sub);
                    
                    if (results.length > 0) {
                        console.log(`  ✓ r/${sub}: ${results.length}`);
                        allFindings.push(...results);
                    }
                } catch (e) {
                    console.log(`  ✗ r/${sub}: ${e.message}`);
                }
            }
        }
    }
    
    // TUBE SITES & LEAK SITES
    else {
        for (const term of keywords) {
            try {
                let searchUrl = '';
                let container = '';
                
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
                } else if (source === 'erome') {
                    searchUrl = `https://www.erome.com/search?q=${encodeURIComponent(term)}&sort=new`;
                    container = '#room_rows .album';
                } else if (source === 'redgifs') {
                    searchUrl = `https://www.redgifs.com/gifs/${encodeURIComponent(term)}`;
                    container = 'a[href*="/watch/"], .gif-card';
                } else if (source === 'bunkr') {
                    searchUrl = `https://bunkr.si/search?q=${encodeURIComponent(term)}`;
                    container = '.grid-item, .file-card';
                } else {
                    throw new Error(`Unknown source: ${source}`);
                }
                
                console.log(`  → ${searchUrl}`);
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForTimeout(3000);
                
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
                        } else if (siteName === 'erome') {
                            title = el.querySelector('.album-title')?.innerText || "Erome Album";
                            link = el.querySelector('a.album-link')?.href || "";
                        } else if (siteName === 'redgifs') {
                            const a = el.tagName === 'A' ? el : el.querySelector('a');
                            link = a?.href || "";
                            title = el.querySelector('.title, h3')?.innerText || "Redgifs Video";
                        } else if (siteName === 'bunkr') {
                            const a = el.querySelector('a');
                            title = a?.innerText?.trim() || "Bunkr File";
                            link = a?.href || "";
                        }
                        
                        return { title, link, date, source: siteName };
                    }).filter(i => i && i.link && i.title);
                }, source);
                
                console.log(`  ✓ Found ${results.length} results`);
                allFindings.push(...results);
                
            } catch (e) {
                console.log(`  ✗ Failed: ${e.message}`);
            }
        }
    }

    await browser.close();
    
    const unique = [...new Map(allFindings.map(item => [item.link, item])).values()];
    console.log(`✅ Complete: ${unique.length} unique results\n`);
    
    return unique;
}

async function scanKeywords(keywords, extraSubs = []) {
    return await scanSingleSource('reddit', keywords, extraSubs);
}

module.exports = { scanKeywords, scanSingleSource };