class TerraViewer {
    constructor() {
        this.API_BASE = 'http://localhost:8000/api';
        this.currentLogs = [];
        this.requestChains = new Map();
        
        this.initializeEventListeners();
        this.loadInitialStats();
    }

    initializeEventListeners() {
        document.getElementById('uploadBtn').addEventListener('click', () => {
            document.getElementById('logFile').click();
        });

        document.getElementById('logFile').addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files[0]);
        });

        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.debounce(() => this.searchLogs(e.target.value), 300);
        });

        document.getElementById('levelFilter').addEventListener('change', (e) => {
            this.filterLogs();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadLogs();
        });

        document.querySelector('.close').addEventListener('click', () => {
            this.closeModal();
        });

        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('chainsModal')) {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    debounce(func, wait) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(func, wait);
    }

    async handleFileUpload(file) {
        if (!file) return;

        document.getElementById('fileName').textContent = file.name;
        this.showLoading();

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${this.API_BASE}/upload-logs`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                this.showNotification('Файл успешно загружен! Логи обрабатываются...', 'success');
                setTimeout(() => {
                    this.loadLogs();
                    this.loadStats();
                }, 2000);
            } else {
                throw new Error('Ошибка загрузки файла');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification('Ошибка при загрузке файла', 'error');
            this.hideLoading();
        }
    }

    async loadLogs() {
        this.showLoading();
        
        try {
            const searchQuery = document.getElementById('searchInput').value;
            const levelFilter = document.getElementById('levelFilter').value;
            
            let url = `${this.API_BASE}/logs?limit=500`;
            
            if (levelFilter) {
                url += `&level=${levelFilter}`;
            }

            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            this.currentLogs = data.logs;
            
            this.displayLogs(this.currentLogs);
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading logs:', error);
            this.showNotification('Ошибка при загрузке логов', 'error');
            this.hideLoading();
        }
    }

    async searchLogs(query) {
        if (!query.trim()) {
            this.loadLogs();
            return;
        }

        this.showLoading();

        try {
            const response = await fetch(`${this.API_BASE}/search?q=${encodeURIComponent(query)}&limit=200`);
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            this.displayLogs(data.logs);
            this.hideLoading();
            
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Ошибка при поиске', 'error');
            this.hideLoading();
        }
    }

    filterLogs() {
        const levelFilter = document.getElementById('levelFilter').value;
        const searchQuery = document.getElementById('searchInput').value;

        if (searchQuery) {
            this.searchLogs(searchQuery);
        } else {
            this.loadLogs();
        }
    }

    displayLogs(logs) {
        const logsList = document.getElementById('logsList');
        const emptyState = document.getElementById('emptyState');

        if (logs.length === 0) {
            logsList.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        logsList.style.display = 'block';
        emptyState.style.display = 'none';

        this.groupLogsByRequestId(logs);
        
        const logsHTML = this.generateLogsHTML(logs);
        logsList.innerHTML = logsHTML;

        this.attachLogActionsHandlers();
    }

    groupLogsByRequestId(logs) {
        this.requestChains.clear();
        
        logs.forEach(log => {
            if (log.tf_req_id) {
                if (!this.requestChains.has(log.tf_req_id)) {
                    this.requestChains.set(log.tf_req_id, []);
                }
                this.requestChains.get(log.tf_req_id).push(log);
            }
        });
    }

    generateLogsHTML(logs) {
        return logs.map(log => `
            <div class="log-item ${log.is_read ? 'read' : 'unread'}" data-log-id="${log.id}">
                <div class="log-header">
                    <div class="log-info">
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span class="log-timestamp">${this.formatTimestamp(log.timestamp)}</span>
                    </div>
                    <div class="log-actions">
                        ${log.tf_req_id ? 
                            `<button class="action-btn view-chain" data-req-id="${log.tf_req_id}">
                                🔗 Цепочка
                            </button>` : ''
                        }
                        ${!log.is_read ? 
                            `<button class="action-btn mark-read" data-log-id="${log.id}">
                                ✅ Прочитано
                            </button>` : ''
                        }
                    </div>
                </div>
                <div class="log-message">${this.escapeHtml(log.message)}</div>
                <div class="log-details">
                    ${log.tf_resource_type ? 
                        `<span class="log-detail-item">
                            🏷️ ${log.tf_resource_type}
                        </span>` : ''
                    }
                    ${log.tf_rpc ? 
                        `<span class="log-detail-item">
                            🔄 ${log.tf_rpc}
                        </span>` : ''
                    }
                    ${log.module ? 
                        `<span class="log-detail-item">
                            📦 ${log.module}
                        </span>` : ''
                    }
                </div>
            </div>
        `).join('');
    }

    attachLogActionsHandlers() {
        document.querySelectorAll('.mark-read').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const logId = e.target.dataset.logId;
                await this.markAsRead(logId);
            });
        });

        document.querySelectorAll('.view-chain').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const reqId = e.target.dataset.reqId;
                await this.showRequestChain(reqId);
            });
        });

        document.querySelectorAll('.log-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('action-btn')) {
                    const logId = item.dataset.logId;
                    this.showLogDetails(logId);
                }
            });
        });
    }

    async markAsRead(logId) {
        try {
            const response = await fetch(`${this.API_BASE}/logs/${logId}/read`, {
                method: 'PATCH'
            });

            if (response.ok) {
                const logElement = document.querySelector(`[data-log-id="${logId}"]`);
                if (logElement) {
                    logElement.classList.remove('unread');
                    logElement.classList.add('read');
                    logElement.querySelector('.mark-read')?.remove();
                }
                
                this.loadStats();
                this.showNotification('Лог помечен как прочитанный', 'success');
            }
        } catch (error) {
            console.error('Error marking as read:', error);
            this.showNotification('Ошибка при обновлении лога', 'error');
        }
    }

    async showRequestChain(reqId) {
        try {
            const response = await fetch(`${this.API_BASE}/chains/${reqId}`);
            
            if (!response.ok) throw new Error('Chain not found');
            
            const chainData = await response.json();
            this.displayRequestChain(chainData);
            
        } catch (error) {
            console.error('Error loading chain:', error);
            this.showNotification('Ошибка при загрузке цепочки', 'error');
        }
    }

    displayRequestChain(chainData) {
        const modal = document.getElementById('chainsModal');
        const chainsList = document.getElementById('chainsList');
        
        const chainHTML = `
            <div class="chain-group expanded">
                <div class="chain-header">
                    <span>Request ID: ${chainData.tf_req_id}</span>
                    <span>Логов: ${chainData.total_logs}</span>
                </div>
                <div class="chain-logs">
                    ${chainData.logs.map(log => `
                        <div class="log-item ${log.is_read ? 'read' : 'unread'}">
                            <div class="log-header">
                                <span class="log-level ${log.level}">${log.level}</span>
                                <span class="log-timestamp">${this.formatTimestamp(log.timestamp)}</span>
                            </div>
                            <div class="log-message">${this.escapeHtml(log.message)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        chainsList.innerHTML = chainHTML;
        modal.style.display = 'block';
    }

    showLogDetails(logId) {
        const log = this.currentLogs.find(l => l.id == logId);
        if (log) {
            alert(`Детали лога:\n\nСообщение: ${log.message}\nУровень: ${log.level}\nВремя: ${this.formatTimestamp(log.timestamp)}`);
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`${this.API_BASE}/stats`);
            
            if (response.ok) {
                const stats = await response.json();
                this.displayStats(stats);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadInitialStats() {
        await this.loadStats();
        await this.loadLogs();
    }

    displayStats(stats) {
        document.getElementById('totalLogs').textContent = stats.total_logs;
        document.getElementById('unreadLogs').textContent = stats.unread_logs;
        
        const levelStats = Object.entries(stats.level_stats || {})
            .map(([level, count]) => `${level}: ${count}`)
            .join(', ');
        document.getElementById('levelStats').textContent = levelStats || '-';
    }

    showLoading() {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('logsList').style.display = 'none';
        document.getElementById('emptyState').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    closeModal() {
        document.getElementById('chainsModal').style.display = 'none';
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            transition: all 0.3s ease;
            background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8'};
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TerraViewer();
});