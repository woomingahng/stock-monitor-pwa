import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://ac.finance.naver.com/ac?q=${encodeURIComponent(query)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8`);
    const data = await response.json();
    
    // Naver autocomplete returns data in items[0]
    const items = data.items && data.items[0] ? data.items[0] : [];
    
    // items is an array of arrays like [ ["삼성전자", "005930", ...], ... ]
    const results = items.map((item: any[]) => ({
      name: item[0],
      code: item[1]
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Failed to fetch search results' }, { status: 500 });
  }
}
