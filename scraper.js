const { chromium } = require('playwright');

async function scanSingleSource(source, keywords, extraSubs = []) {
    console.log(`\n🚀 Starting scan: ${source} | Keywords: ${keywords}`);
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-extensions'] 
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();
    let allFindings = [];

    try {
        // === REDDIT LOGIC ===
        if (source === 'reddit') {
            await context.addCookies([{ name: 'over18', value: '1', domain: '.reddit.com', path: '/' }]);
            const defaultSubs = ['onlyfanshottest', 'onlyfans101', 'leaked_content', 'OnlyFansPromotions'];
            const cleanExtras = extraSubs.map(s => s.replace('r/', '').trim()).filter(s => s);
            const finalSubs = [...new Set([...defaultSubs, ...cleanExtras])];

            for (const term of keywords) {
                for (const sub of finalSubs) {
                    try {
                        const url = `https://old.reddit.com/r/${sub}/search?q=${encodeURIComponent(term)}&restrict_sr=on&sort=new&include_over_18=on`;
                        await page.goto(url, { waitUntil: 'commit', timeout: 8000 });
                        
                        // Smart Wait: Wait for results OR "there doesn't seem to be anything here"
                        try { await page.waitForSelector('.search-result-link, .search-result-listing', { timeout: 3000 }); } catch(e){}

                        const results = await page.$$eval('.search-result-link', (els, s) => els.map(el => ({
                            title: `[r/${s}] ${el.querySelector('a.search-title')?.innerText}`,
                            link: el.querySelector('a.search-title')?.href,
                            source: 'Reddit',
                            date: 'Recent'
                        })), sub);
                        
                        if(results.length) allFindings.push(...results);
                    } catch (e) { console.log(`   Skipped r/${sub}`); }
                }
            }
        } 
        // === TUBE SITES LOGIC ===
        else {
            for (const term of keywords) {
                let url = '', sel = '';
                
                if (source === 'pornhub') { 
                    url = `https://www.pornhub.com/video/search?search=${encodeURIComponent(term)}&o=mr`; 
                    sel = '#videoSearchResult .pcVideoListItem, .videoBox'; 
                    await context.addCookies([{ name: 'accessAgeDisclaimerPH', value: '1', domain: '.pornhub.com', path: '/' }]);
                }
                else if (source === 'xvideos') { url = `https://www.xvideos.com/?k=${encodeURIComponent(term)}&sort=uploaddate`; sel = '.thumb-block'; }
                else if (source === 'xnxx') { url = `https://www.xnxx.com/?k=${encodeURIComponent(term)}&sort=uploaddate`; sel = '.thumb-block'; }
                else if (source === 'erome') { url = `https://www.erome.com/search?q=${encodeURIComponent(term)}&sort=new`; sel = '#room_rows .album'; }
                else if (source === 'bunkr') { url = `https://bunkr.si/search?q=${encodeURIComponent(term)}`; sel = '.grid-item, .file-card'; }
                else if (source === 'spankbang') { url = `https://spankbang.com/s/${encodeURIComponent(term)}/?o=new`; sel = '.video-item'; }

                if (!url) continue;

                console.log(`  🔍 ${source}: ${term}`);
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                // SMART WAIT: Wait up to 5s for the specific video container
                try { await page.waitForSelector(sel, { state: 'attached', timeout: 5000 }); } catch(e) { console.log(`   ⚠️ No results for ${source}`); continue; }

                const results = await page.$$eval(sel, (els, src) => els.slice(0, 20).map(el => {
                    let t, l;
                    const a = el.querySelector('a') || el.closest('a');
                    if (!a) return null;

                    if (src === 'pornhub') { t = a.getAttribute('title'); l = "https://pornhub.com" + a.getAttribute('href'); }
                    else if (src === 'xvideos' || src === 'xnxx') { t = a.getAttribute('title') || a.innerText; l = a.href; }
                    else if (src === 'erome') { t = el.querySelector('.album-title')?.innerText; l = el.querySelector('a.album-link')?.href; }
                    else { t = a.innerText || "Video"; l = a.href; }

                    return { title: t || "Found Result", link: l, source: src, date: "Recent" };
                }).filter(x => x && x.link), source);

                allFindings.push(...results);
            }
        }
    } catch (e) {
        console.error(`Scraper Error: ${e.message}`);
    } finally {
        await browser.close();
    }
    
    return [...new Map(allFindings.map(item => [item.link, item])).values()];
}

module.exports = { scanSingleSource };
