export function setupNotificationsTab() {
  const container = document.getElementById('tx-history-list');
  if (container) {
    container.innerHTML = `<p style="text-align: center; color: #94a3b8;">Chưa có thông báo</p>`;
  }
}
