"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, Trash2, ChevronUp, ChevronDown, Bell, Minimize2, Maximize2, X, ExternalLink } from "lucide-react";

interface SearchResult {
  name: string;
  code: string;
}

interface Alert {
  id: string;
  code: string;
  name: string;
  targetPrice: number;
  type: "UP" | "DOWN";
  registeredPrice: number;
}

interface PriceData {
  code: string;
  name: string;
  price: string; // string from api like "80,000"
  change: string;
  changeRate: string;
  low?: number;
  high?: number;
  prevClose?: number;
}

function playBeep() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime); // Not too loud
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.error("Audio error", e);
  }
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  
  // Selected stock for adding
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [targetPriceInput, setTargetPriceInput] = useState("");
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const searchDebounceRef = useRef<NodeJS.Timeout>(null);

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem("stock-alerts");
    if (saved) {
      try {
        setAlerts(JSON.parse(saved));
      } catch (e) {}
    }
    
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
      
      // 데스크톱 PWA 환경일 경우 창 크기를 매우 작게 강제 조정 시도
      try {
        window.resizeTo(300, 500);
      } catch (e) {}
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem("stock-alerts", JSON.stringify(alerts));
  }, [alerts]);

  // Handle Search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!query) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query]);

  // Polling Price Data
  useEffect(() => {
    const fetchPrices = async () => {
      if (alerts.length === 0) return;
      
      const uniqueCodes = Array.from(new Set(alerts.map(a => a.code)));
      const newPrices: Record<string, PriceData> = { ...prices };
      
      let alertsToRemove: string[] = [];

      await Promise.all(
        uniqueCodes.map(async (code) => {
          try {
            const res = await fetch(`/api/price?code=${code}`);
            if (!res.ok) return;
            const data = await res.json();
            newPrices[code] = data;

            // Check alerts for this code
            const currentPriceVal = data.price;
            const currentPriceNum = typeof currentPriceVal === 'string' 
              ? parseInt(currentPriceVal.replace(/,/g, ''), 10) 
              : Number(currentPriceVal);
            
            alerts.filter(a => a.code === code).forEach(alert => {
              let isTriggered = false;
              if (alert.type === "UP" && currentPriceNum >= alert.targetPrice) isTriggered = true;
              if (alert.type === "DOWN" && currentPriceNum <= alert.targetPrice) isTriggered = true;

              if (isTriggered && !alertsToRemove.includes(alert.id)) {
                // Trigger notification
                if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                  new Notification(`주식 알림: ${alert.name}`, {
                    body: `목표가 ${alert.targetPrice.toLocaleString()}원 도달! (현재가: ${data.price}원)`,
                    icon: '/icon-192x192.png'
                  });
                }
                playBeep();
                alertsToRemove.push(alert.id);
              }
            });
          } catch (e) {
            console.error("Fetch price error for", code, e);
          }
        })
      );

      setPrices(newPrices);

      if (alertsToRemove.length > 0) {
        setAlerts(prev => prev.filter(a => !alertsToRemove.includes(a.id)));
      }
    };

    fetchPrices(); // initial fetch
    const intervalId = setInterval(fetchPrices, 10000); // 10s

    return () => clearInterval(intervalId);
  }, [alerts]); // Reacts to changes in alerts

  // Auto fetch current price when stock selected
  useEffect(() => {
    if (selectedStock && !prices[selectedStock.code]) {
      fetch(`/api/price?code=${selectedStock.code}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.price) {
             setPrices(prev => ({ ...prev, [selectedStock.code]: data }));
          }
        });
    }
  }, [selectedStock, prices]);

  const handleAddAlert = () => {
    if (!selectedStock || !targetPriceInput) return;
    
    const targetNum = parseInt(targetPriceInput.replace(/,/g, ''), 10);
    if (isNaN(targetNum) || targetNum <= 0) return;

    // Get current price to determine UP or DOWN
    const currentPriceVal = prices[selectedStock.code]?.price || 0;
    const currentPriceNum = typeof currentPriceVal === 'string' 
      ? parseInt(currentPriceVal.replace(/,/g, ''), 10) 
      : Number(currentPriceVal);
    
    if (currentPriceNum === 0) {
      alert("현재가를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const type = targetNum >= currentPriceNum ? "UP" : "DOWN";

    const newAlert: Alert = {
      id: Date.now().toString(),
      code: selectedStock.code,
      name: selectedStock.name,
      targetPrice: targetNum,
      type,
      registeredPrice: currentPriceNum
    };

    setAlerts([...alerts, newAlert]);
    setSelectedStock(null);
    setQuery("");
    setTargetPriceInput("");
    setSearchResults([]);
  };

  const removeAlert = (id: string) => {
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) {
      alert('이 브라우저는 PiP 팝업을 지원하지 않습니다. 최신 크롬을 사용해주세요.');
      return;
    }
    try {
      const pip = await (window as any).documentPictureInPicture.requestWindow({
        width: 320,
        height: 400,
      });
      
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pip.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = styleSheet.type;
          link.media = (styleSheet as any).media?.mediaText || '';
          link.href = styleSheet.href || '';
          pip.document.head.appendChild(link);
        }
      });
      
      const script = document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      pip.document.head.appendChild(script);

      pip.addEventListener('pagehide', () => {
        setPipWindow(null);
      });
      
      setPipWindow(pip);
    } catch (error) {
      console.error(error);
      alert('PiP 팝업을 여는데 실패했습니다.');
    }
  };

  const groupedAlerts = alerts.reduce((acc, alert) => {
    if (!acc[alert.code]) {
      acc[alert.code] = [];
    }
    acc[alert.code].push(alert);
    return acc;
  }, {} as Record<string, Alert[]>);

  const renderAlertList = () => {
    if (alerts.length === 0) {
      return (
        <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-[#333] rounded-xl mx-2">
          등록된 알림이 없습니다.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 p-2">
        {Object.entries(groupedAlerts).map(([code, stockAlerts]) => {
          const stockInfo = prices[code];
          const stockName = stockInfo?.name || stockAlerts[0].name;
          const currentPrice = stockInfo?.price ? Number(stockInfo.price.toString().replace(/,/g, '')) : 0;
          const currentPriceStr = stockInfo?.price || "...";
          const low = stockInfo?.low ? Number(stockInfo.low) : currentPrice * 0.95;
          const high = stockInfo?.high ? Number(stockInfo.high) : currentPrice * 1.05;

          const minTarget = Math.min(...stockAlerts.map(a => a.targetPrice));
          const maxTarget = Math.max(...stockAlerts.map(a => a.targetPrice));
          
          const minBound = Math.min(low, minTarget, currentPrice) * 0.98;
          const maxBound = Math.max(high, maxTarget, currentPrice) * 1.02;
          const range = maxBound - minBound;

          const getLeft = (val: number) => {
            if (range === 0) return 50;
            return Math.max(0, Math.min(100, ((val - minBound) / range) * 100));
          };

          return (
            <div key={code} className="bg-[#1a1a1a] p-2.5 rounded-xl border border-[#333] flex flex-col gap-2 relative">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[13px]">{stockName}</span>
                  <span className="text-[9px] bg-black text-gray-400 px-1 py-0.5 rounded border border-[#333]">{code}</span>
                </div>
                <span className="font-semibold text-[13px]">{currentPriceStr}</span>
              </div>

              <div className="relative w-full h-4 mt-1 mb-1">
                {/* Base line */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#333] rounded-full -translate-y-1/2"></div>
                
                {/* Current Price Marker */}
                {currentPrice > 0 && (
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10"
                    style={{ left: `${getLeft(currentPrice)}%` }}
                    title={`현재가: ${currentPriceStr}`}
                  ></div>
                )}

                {/* Target Price Markers */}
                {stockAlerts.map(alert => (
                  <div 
                    key={alert.id}
                    className="absolute flex flex-col items-center -translate-x-1/2 group/marker z-20 cursor-pointer"
                    style={{ 
                      left: `${getLeft(alert.targetPrice)}%`,
                      top: alert.type === 'UP' ? '50%' : 'auto',
                      bottom: alert.type === 'DOWN' ? '50%' : 'auto',
                    }}
                  >
                    {alert.type === 'UP' ? (
                       <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-red-500 mt-1"></div>
                    ) : (
                       <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-blue-500 mb-1"></div>
                    )}
                    
                    {/* Tooltip on hover */}
                    <div className="absolute opacity-0 group-hover/marker:opacity-100 transition-opacity bg-[#111] text-[10px] px-2 py-1.5 rounded border border-[#444] whitespace-nowrap z-30 flex flex-col gap-1 shadow-xl"
                         style={{
                           top: alert.type === 'UP' ? '14px' : 'auto',
                           bottom: alert.type === 'DOWN' ? '14px' : 'auto',
                         }}>
                      <div className="flex items-center gap-2 justify-between">
                        <span className={alert.type === 'UP' ? 'text-red-400 font-bold' : 'text-blue-400 font-bold'}>
                          목표: {alert.targetPrice.toLocaleString()}원
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); removeAlert(alert.id); }} className="text-gray-500 hover:text-red-400 p-0.5 rounded hover:bg-[#222]">
                           <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-gray-400">
                        현재: <span className="text-gray-200">{currentPriceStr}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };



  return (
    <div className="min-h-screen p-2 max-w-sm mx-auto flex flex-col gap-4 transition-all overflow-x-hidden">
      <header className="flex items-center gap-2 pb-2 border-b border-[#333]">
        <Bell className="w-5 h-5 text-emerald-400 shrink-0" />
        <h1 className="text-lg font-bold tracking-tight truncate">주식 모니터</h1>
        <button 
          onClick={openPiP}
          className="ml-auto shrink-0 text-emerald-500 hover:text-emerald-400 p-1.5 rounded bg-[#222] hover:bg-[#333] transition-colors flex items-center gap-1 text-xs border border-[#333]"
          title="PiP 초소형 팝업 모드"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline font-medium">PiP 팝업</span>
        </button>
      </header>

      {/* Add Alert Section */}
      <section className="bg-[#1a1a1a] rounded-xl p-3 border border-[#333] relative">
        {!selectedStock ? (
          <div className="relative">
            <div className="flex items-center bg-black border border-[#333] rounded-lg overflow-hidden focus-within:border-emerald-500 transition-colors">
              <Search className="w-4 h-4 ml-3 text-gray-500" />
              <input 
                type="text" 
                className="w-full bg-transparent p-3 text-sm outline-none min-w-0"
                placeholder="종목코드 (예: 005930)"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            
            {/* Search Dropdown */}
            {searchResults.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-[#222] border border-[#444] rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {searchResults.map((res, idx) => (
                  <li 
                    key={idx} 
                    className="p-3 hover:bg-[#333] cursor-pointer text-sm flex justify-between items-center transition-colors"
                    onClick={() => {
                      setSelectedStock(res);
                      setQuery("");
                      setSearchResults([]);
                    }}
                  >
                    <span>{res.name}</span>
                    <span className="text-xs text-gray-500">{res.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center bg-black p-3 rounded-lg border border-[#333]">
              <div>
                <div className="font-medium text-emerald-400">{prices[selectedStock.code]?.name || selectedStock.name}</div>
                <div className="text-xs text-gray-500">현재가: {prices[selectedStock.code]?.price || '조회중...'}원</div>
              </div>
              <button 
                onClick={() => setSelectedStock(null)}
                className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-[#333]"
              >
                취소
              </button>
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  className="w-full bg-black border border-[#333] rounded-lg p-3 text-sm outline-none focus:border-emerald-500 transition-colors"
                  placeholder="목표가 입력 (원)"
                  value={targetPriceInput}
                  onChange={e => setTargetPriceInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddAlert(); }}
                />
              </div>
              <button 
                onClick={handleAddAlert}
                className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-lg flex items-center justify-center transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Alert List Section */}
      <section className="flex flex-col gap-2">
        {renderAlertList()}
      </section>

      {pipWindow && createPortal(
        <div className="bg-black text-white min-h-screen">
           {renderAlertList()}
        </div>,
        pipWindow.document.body
      )}
    </div>
  );
}
