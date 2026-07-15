import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    // 1. Fetch search results from Naver Finance
    const searchUrl = `https://finance.naver.com/search/searchList.naver?query=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3'
      }
    });

    const buffer = await response.arrayBuffer();
    // Decode euc-kr to utf-8
    const html = iconv.decode(Buffer.from(buffer), 'euc-kr');
    const $ = cheerio.load(html);

    const results: { name: string; code: string; }[] = [];

    // 2. Parse the search result table
    $('.tbl_search tbody tr').each((i, el) => {
      const titleLink = $(el).find('td.tit a');
      if (titleLink.length > 0) {
        const name = titleLink.text().trim();
        const href = titleLink.attr('href');
        const codeMatch = href?.match(/code=(\d+)/);
        if (codeMatch && codeMatch[1]) {
          results.push({
            name,
            code: codeMatch[1]
          });
        }
      }
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Failed to fetch search results' }, { status: 500 });
  }
}
