// Slow Spain — 数据加载器
// 优先级:1. jsdelivr CDN  2. window.SLOW_SPAIN (data.js 内嵌兜底)

(function() {
  // 优先用 commit SHA 绕过 jsdelivr @main 缓存(避免陈旧数据)
  // localStorage 缓存 SHA 30 分钟
  const CDN_BASE = 'https://cdn.jsdelivr.net/gh/622duan/slow-spain-data';
  const SHA_CACHE_KEY = 'slow_spain_data_sha';
  const SHA_TTL = 30 * 60 * 1000;

  function getCDNUrl() {
    const cached = localStorage.getItem(SHA_CACHE_KEY);
    if (cached) {
      try {
        const { sha, ts } = JSON.parse(cached);
        if (Date.now() - ts < SHA_TTL) {
          return `${CDN_BASE}@${sha}/data.json`;
        }
      } catch (e) {}
    }
    // 后台拉新 SHA
    fetch('https://api.github.com/repos/622duan/slow-spain-data/commits?per_page=1')
      .then(r => r.ok ? r.json() : null)
      .then(arr => {
        if (Array.isArray(arr) && arr[0] && arr[0].sha) {
          localStorage.setItem(SHA_CACHE_KEY, JSON.stringify({
            sha: arr[0].sha.slice(0, 12),
            ts: Date.now()
          }));
        }
      })
      .catch(() => {});
    // 当前缓存过期前用 @main
    return `${CDN_BASE}@main/data.json`;
  }

  const CDN_URL = getCDNUrl();

  // 检测是否已经通过 data.js 注入了数据(内嵌)
  function hasInlineData() {
    return !!(window.SLOW_SPAIN && window.SLOW_SPAIN.spots);
  }

  // 生成距离计算工具
  function setupUtils() {
    if (window.SS && window.SS.haversine) return;
    window.SS = {
      currentTimeSlot() {
        const h = new Date().getHours();
        if (h >= 7 && h < 11) return "morning";
        if (h >= 11 && h < 15) return "lunch";
        if (h >= 15 && h < 18) return "tea";
        if (h >= 18 && h < 22) return "dinner";
        return "night";
      },
      greeting() {
        const h = new Date().getHours();
        if (h < 11) return "早上好";
        if (h < 14) return "中午好";
        if (h < 18) return "下午好";
        return "晚上好";
      },
      findSpot(id) {
        const all = Object.values(window.SLOW_SPAIN.spots).flat();
        return all.find(s => s.id === id);
      },
      findCity(id) {
        return window.SLOW_SPAIN.cities.find(c => c.id === id);
      },
      haversine(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      },
      googleMapsUrl(spot) {
        if (!spot) return '';
        if (spot.google_query) {
          return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.google_query)}`;
        }
        if (spot.lat && spot.lng) {
          return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
        }
        return '';
      },
      googleMapsWalkingDirections(fromLat, fromLng, spot) {
        if (!spot) return '';
        if (spot.google_query) {
          return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(spot.google_query)}&travelmode=walking`;
        }
        return `https://www.google.com/maps/dir/?api=1&destination=${fromLat},${fromLng}&travelmode=walking`;
      },
      // ============== 行程追踪 ==============
      // 行程顺序: Madrid → Toledo → Cuenca → Valencia → Barcelona → Madrid
      // idx 0=Madrid, 1=Toledo, 2=Cuenca, 3=Valencia, 4=Barcelona, 5=Madrid-return
      journeyOrder: ['madrid', 'toledo', 'cuenca', 'valencia', 'barcelona', 'madrid'],
      getJourneyIdx() {
        const v = parseInt(localStorage.getItem('slow_spain_journey_idx'));
        return isNaN(v) ? 4 : Math.min(5, Math.max(0, v));  // 默认 Barcelona (Day 8/11)
      },
      setJourneyIdx(idx) {
        localStorage.setItem('slow_spain_journey_idx', String(Math.min(5, Math.max(0, idx))));
      },
      getCurrentCityId() {
        const idx = this.getJourneyIdx();
        return this.journeyOrder[idx];
      },
      getCurrentCity() {
        return window.SLOW_SPAIN.cities.find(c => c.id === this.getCurrentCityId());
      },
      // 当前 day (累计天数)
      getCurrentDay() {
        const idx = this.getJourneyIdx();
        const dayMap = { 0: 1, 1: 3, 2: 4, 3: 5, 4: 7, 5: 11 };
        return dayMap[idx] || 1;
      },
      // 完成当前城市 → 下一站
      advanceJourney() {
        const cur = this.getJourneyIdx();
        if (cur < 5) this.setJourneyIdx(cur + 1);
      },
      // 当前站 day 范围
      getCurrentDays() {
        const idx = this.getJourneyIdx();
        const map = { 0: 'Day 1-2', 1: 'Day 3', 2: 'Day 4', 3: 'Day 5-6', 4: 'Day 7-10', 5: 'Day 11' };
        return map[idx];
      }
    };
  }

  // 监听数据就绪事件
  function fireReady() {
    setupUtils();
    window.dispatchEvent(new CustomEvent('slowspain:ready'));
    console.log('[data-loader] Slow Spain data ready (' +
      Object.values(window.SLOW_SPAIN.spots).flat().length + ' spots)');
  }

  // 如果已有内嵌数据,直接 fire
  if (hasInlineData()) {
    fireReady();
    return;
  }

  // 否则异步拉 CDN
  console.log('[data-loader] fetching from CDN:', CDN_URL);
  fetch(CDN_URL, { cache: 'no-cache' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      window.SLOW_SPAIN = data;
      fireReady();
    })
    .catch(err => {
      console.error('[data-loader] CDN sha failed, trying @main:', err);
      // fallback 到 @main
      return fetch(`${CDN_BASE}@main/data.json`, { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(data => { window.SLOW_SPAIN = data; fireReady(); })
        .catch(err2 => {
          console.error('[data-loader] all CDN failed:', err2);
          alert('数据加载失败,请检查网络');
        });
    });
})();