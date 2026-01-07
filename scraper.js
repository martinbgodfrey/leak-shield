// REPLACE THE "TUBE SITES & LEAK SITES" SECTION IN scraper.js with this:

    // TUBE SITES & LEAK SITES
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
                } else if (source === 'erome') {
                    searchUrl = `https://www.erome.com/search?q=${encodeURIComponent(term)}&sort=new`;
                    container = '#room_rows .album, .album-link';
                } else if (source === 'redgifs') {
                    searchUrl = `https://www.redgifs.com/search?query=${encodeURIComponent(term)}&order=new`;
                    container = 'a[href*="/watch/"], div[data-gif]';
                    waitTime = 5000; // Redgifs loads slower
                } else if (source === 'bunkr') {
                    searchUrl = `https://bunkr.sk/search?q=${encodeURIComponent(term)}`;
                    container = '.grid-item, a[href*="/a/"], a[href*="/v/"]';
                } else {
                    throw new Error(`Unknown source: ${source}`);
                }
                
                console.log(`  → ${searchUrl}`);
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
                await page.waitForTimeout(waitTime);
                
                // Count elements first
                const elementCount = await page.$$eval(container, els => els.length).catch(() => 0);
                console.log(`  📊 Found ${elementCount} elements with selector: ${container}`);
                
                if (elementCount === 0) {
                    console.log(`  ⚠️  No results found - selector may be wrong`);
                    continue;
                }
                
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
                            title = el.querySelector('.album-title')?.innerText || el.innerText || "Erome Album";
                            link = el.querySelector('a.album-link')?.href || el.href || "";
                        } else if (siteName === 'redgifs') {
                            // Try multiple approaches for Redgifs
                            const a = el.tagName === 'A' ? el : el.querySelector('a');
                            link = a?.href || "";
                            // Look for any text content
                            title = el.querySelector('h3')?.innerText || 
                                   el.querySelector('[class*="title"]')?.innerText || 
                                   el.getAttribute('aria-label') ||
                                   "Redgifs Video";
                        } else if (siteName === 'bunkr') {
                            const a = el.tagName === 'A' ? el : el.querySelector('a');
                            link = a?.href || "";
                            title = a?.innerText?.trim() || 
                                   el.querySelector('img')?.getAttribute('alt') ||
                                   "Bunkr File";
                        }
                        
                        return { title, link, date, source: siteName };
                    }).filter(i => i && i.link && i.title);
                }, source);
                
                console.log(`  ✓ Extracted ${results.length} results`);
                allFindings.push(...results);
                
            } catch (e) {
                console.log(`  ✗ Failed: ${e.message}`);
            }
        }
    }