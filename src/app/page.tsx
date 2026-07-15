"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Plus, Trash2, BellRing, ChevronUp, ChevronDown, Bell, Minimize2, Maximize2, X } from "lucide-react";

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
  const [isCompact, setIsCompact] = useState(false);

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

  if (isCompact) {
    return (
      <div className="min-h-screen bg-black text-white p-1 flex flex-col gap-1 relative group">
        {/* Floating Expand Button (visible on hover) */}
        <button 
          onClick={() => setIsCompact(false)} 
          className="absolute top-1 right-1 z-10 text-gray-500 hover:text-white p-1 bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          title="기본 모드로 돌아가기"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
        
        {/* Compact List */}
        <div className="flex flex-col gap-1 overflow-y-auto w-full pt-4">
          {alerts.length === 0 ? (
            <div className="text-center py-2 text-gray-600 text-[10px]">알림이 없습니다.</div>
          ) : (
            alerts.map(alert => {
              const currentPriceStr = prices[alert.code]?.price || "...";
              const stockName = prices[alert.code]?.name || alert.name;
              
              return (
                <div key={alert.id} className="flex justify-between items-center bg-[#111] p-1.5 rounded-md border border-[#222]">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-gray-200 truncate max-w-[70px]">{stockName}</span>
                    <div className={`flex items-center text-[9px] ${alert.type === 'UP' ? 'text-red-400' : 'text-blue-400'}`}>
                      {alert.type === 'UP' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                      {alert.targetPrice.toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold">{currentPriceStr}</span>
                    <button 
                      onClick={() => removeAlert(alert.id)}
                      className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-2 max-w-sm mx-auto flex flex-col gap-4 transition-all overflow-x-hidden">
      <header className="flex items-center gap-2 pb-2 border-b border-[#333]">
        <Bell className="w-5 h-5 text-emerald-400 shrink-0" />
        <h1 className="text-lg font-bold tracking-tight truncate">주식 모니터</h1>
        <button 
          onClick={() => setIsCompact(true)}
          className="ml-auto shrink-0 text-gray-400 hover:text-white p-1 rounded hover:bg-[#333] transition-colors flex items-center gap-1 text-xs"
          title="컴팩트 위젯 모드"
        >
          <Minimize2 className="w-4 h-4" />
          <span className="hidden sm:inline">위젯 모드</span>
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
        {alerts.length === 0 ? (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-[#333] rounded-xl">
            등록된 알림이 없습니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map(alert => {
              const currentPriceStr = prices[alert.code]?.price || "...";
              
              return (
                <li key={alert.id} className="bg-[#1a1a1a] p-3 rounded-xl border border-[#333] flex flex-wrap items-center justify-between group gap-2">
                  <div className="flex flex-col gap-1 min-w-[120px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate max-w-[100px]">{prices[alert.code]?.name || alert.name}</span>
                      <span className="text-[10px] bg-black text-gray-400 px-1.5 py-0.5 rounded border border-[#333]">
                        {alert.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm mt-1">
                      <div className={`flex items-center ${alert.type === 'UP' ? 'text-red-400' : 'text-blue-400'}`}>
                        {alert.type === 'UP' ? <ChevronUp className="w-4 h-4 mr-0.5" /> : <ChevronDown className="w-4 h-4 mr-0.5" />}
                        {alert.targetPrice.toLocaleString()}원
                      </div>
                      <span className="text-gray-600 text-xs truncate max-w-[80px]">(현재: {currentPriceStr})</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeAlert(alert.id)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-[#222] rounded-lg opacity-80 transition-all shrink-0 ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
