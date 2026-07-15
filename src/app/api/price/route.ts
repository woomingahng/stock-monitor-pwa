import { NextResponse } from 'next/server';
import iconv from 'iconv-lite';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      cache: 'no-store'
    });
    
    const buffer = await response.arrayBuffer();
    const decodedStr = iconv.decode(Buffer.from(buffer), 'EUC-KR');
    const data = JSON.parse(decodedStr);
    
    if (data.resultCode !== 'success' || !data.result?.areas[0]?.datas[0]) {
      return NextResponse.json({ error: 'Invalid data from Naver' }, { status: 404 });
    }

    const stockData = data.result.areas[0].datas[0];
    
    return NextResponse.json({
      code: stockData.cd,
      name: stockData.nm,
      price: stockData.nv,
      change: stockData.cv,
      changeRate: stockData.cr,
    });
  } catch (error) {
    console.error('Price API error:', error);
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 });
  }
}
