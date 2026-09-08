export async function setupInfoTab({ contract, readOnlyContract }) {
  try {
    const activeContract = contract || readOnlyContract;
    if (!activeContract) return;

    const ethersLib = window.ethers;
    if (!ethersLib) return;

    const rem = await activeContract.remainingME();
    const res = await activeContract.reserveMON();

    const remEl = document.getElementById('rem-me');
    const resEl = document.getElementById('res-mon');
    const priceEl = document.getElementById('cur-price');

    // Lấy số liệu gốc từ hợp đồng
    const realResMon = parseFloat(ethersLib.formatEther(res));
    const remainingME = parseFloat(ethersLib.formatEther(rem));

    // Cộng thêm 100,000 MON neo giá vào tổng dự trữ
    const PEGGED_MON = 100000;
    const totalResMon = realResMon + PEGGED_MON;

    // Tính lại giá hiện tại khớp với tổng dự trữ mới (Tổng MON / Tổng ME)
    const currentPrice = remainingME > 0 ? (totalResMon / remainingME) : 0;

    // Hiển thị ra giao diện Tab Thống Kê
    if (remEl) remEl.innerText = remainingME.toLocaleString('en-US');
    if (resEl) resEl.innerText = totalResMon.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    if (priceEl) priceEl.innerText = currentPrice.toFixed(6) + " MON";

    updatePriceChanges(currentPrice);

  } catch (err) {
    console.error("Lỗi tab Thống kê:", err);
  }
}

function updatePriceChanges(currentPrice) {
  if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) return;

  let history = {};
  try {
    history = JSON.parse(localStorage.getItem('price_history') || '{}');
  } catch (e) {
    history = {};
  }

  const now = Date.now();
  history[now] = currentPrice;

  const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
  Object.keys(history).forEach(time => {
    if (parseInt(time) < oneYearAgo) delete history[time];
  });

  try {
    localStorage.setItem('price_history', JSON.stringify(history));
  } catch (e) {}

  const getHistoricalPrice = (targetTime) => {
    const times = Object.keys(history).map(Number).sort((a, b) => a - b);
    if (times.length === 0) return currentPrice;
    
    let closest = times[0];
    for (let t of times) {
      if (t <= targetTime) closest = t;
      else break;
    }
    return history[closest] || currentPrice;
  };

  const p1h = getHistoricalPrice(now - 1 * 60 * 60 * 1000);
  const p1d = getHistoricalPrice(now - 24 * 60 * 60 * 1000);
  const p1w = getHistoricalPrice(now - 7 * 24 * 60 * 60 * 1000);
  const p1t = getHistoricalPrice(now - 30 * 24 * 60 * 60 * 1000);
  const p1n = getHistoricalPrice(now - 365 * 24 * 60 * 60 * 1000);

  const calcChange = (oldP) => oldP > 0 ? ((currentPrice - oldP) / oldP) * 100 : 0;

  renderPriceBadge('change-1h', calcChange(p1h));
  renderPriceBadge('change-1d', calcChange(p1d));
  renderPriceBadge('change-1w', calcChange(p1w));
  renderPriceBadge('change-1t', calcChange(p1t));
  renderPriceBadge('change-1n', calcChange(p1n));
}

function renderPriceBadge(elementId, percent) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (percent > 0) {
    el.style.color = '#22c55e';
    el.innerHTML = `▲ +${percent.toFixed(2)}%`;
  } else if (percent < 0) {
    el.style.color = '#ef4444';
    el.innerHTML = `▼ ${percent.toFixed(2)}%`;
  } else {
    el.style.color = '#ffffff';
    el.innerHTML = `- 0.00%`;
  }
}
