class TerraViewer {
    constructor() {
        this.API_BASE = 'http://localhost:8000/api';
        this.currentLogs = [];
        this.requestChains = new Map();
        this.lastTimestamp = null;
        
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

        document.getElementById('advancedSearchBtn').addEventListener('click', () => {
            this.toggleAdvancedSearch();
        });

        document.getElementById('applyAdvancedSearch').addEventListener('click', () => {
            this.applyAdvancedSearch();
        });

        document.getElementById('clearAdvancedSearch').addEventListener('click', () => {
            this.clearAdvancedSearch();
        });

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
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

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    toggleAdvancedSearch() {
        const panel = document.getElementById('advancedSearchPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    async applyAdvancedSearch() {
        const resourceType = document.getElementById('resourceTypeFilter').value;
        const startDate = document.getElementById('startDateFilter').value;
        const endDate = document.getElementById('endDateFilter').value;
        const level = document.getElementById('advancedLevelFilter').value;
        const searchQuery = document.getElementById('advancedSearchInput').value;

        let url = `${this.API_BASE}/logs?limit=500`;
        const params = [];

        if (resourceType) params.push(`tf_resource_type=${encodeURIComponent(resourceType)}`);
        if (level) params.push(`level=${encodeURIComponent(level)}`);
        if (startDate) params.push(`start_date=${encodeURIComponent(startDate)}`);
        if (endDate) params.push(`end_date=${encodeURIComponent(endDate)}`);

        if (params.length > 0) {
            url += `&${params.join('&')}`;
        }

        this.showLoading();

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            
            if (searchQuery) {
                const filteredLogs = data.logs.filter(log => 
                    log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (log.raw_data && log.raw_data.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                this.displayLogs(filteredLogs);
            } else {
                this.displayLogs(data.logs);
            }
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Advanced search error:', error);
            this.showNotification('Ошибка при расширенном поиске', 'error');
            this.hideLoading();
        }
    }

    clearAdvancedSearch() {
        document.getElementById('resourceTypeFilter').value = '';
        document.getElementById('startDateFilter').value = '';
        document.getElementById('endDateFilter').value = '';
        document.getElementById('advancedLevelFilter').value = '';
        document.getElementById('advancedSearchInput').value = '';
        this.loadLogs();
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
        this.lastTimestamp = null;
        
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
        const groupedLogs = this.groupLogsForDisplay(logs);
        return groupedLogs.map(group => {
            if (group.type === 'chain' && group.logs.length > 1) {
                return this.generateChainHTML(group);
            } else {
                return group.logs.map(log => this.generateLogItemHTML(log, 'single')).join('');
            }
        }).join('');
    }

    groupLogsForDisplay(logs) {
        const groups = [];
        const processedIds = new Set();

        logs.forEach(log => {
            if (processedIds.has(log.id)) return;

            if (log.tf_req_id && this.requestChains.has(log.tf_req_id)) {
                const chainLogs = this.requestChains.get(log.tf_req_id);
                if (chainLogs.length > 1) {
                    groups.push({
                        type: 'chain',
                        tf_req_id: log.tf_req_id,
                        logs: chainLogs
                    });
                    chainLogs.forEach(chainLog => processedIds.add(chainLog.id));
                } else {
                    groups.push({
                        type: 'single',
                        logs: [log]
                    });
                    processedIds.add(log.id);
                }
            } else {
                groups.push({
                    type: 'single',
                    logs: [log]
                });
                processedIds.add(log.id);
            }
        });

        return groups;
    }

    generateChainHTML(group) {
        const sortedLogs = group.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        return `
            <div class="chain-group expanded">
                <div class="chain-header">
                    <div>
                        <span>🔗 Цепочка запросов</span>
                        <div class="chain-info">
                            <span class="chain-badge">ID: ${group.tf_req_id}</span>
                            <span class="chain-badge">Записей: ${group.logs.length}</span>
                            <span class="chain-badge">Длительность: ${this.calculateChainDuration(sortedLogs)}</span>
                        </div>
                    </div>
                    <button class="action-btn view-chain-details" data-req-id="${group.tf_req_id}">
                        📊 Детали
                    </button>
                </div>
                <div class="chain-logs">
                    ${sortedLogs.map((log, index) => 
                        this.generateLogItemHTML(log, 'chain', index, sortedLogs.length)
                    ).join('')}
                </div>
            </div>
        `;
    }

    generateLogItemHTML(log, type, index = 0, total = 1) {
        const timestamp = this.formatTimestampWithDifference(log.timestamp);
        let cssClass = 'log-item';
        if (!log.is_read) cssClass += ' unread';
        if (log.is_read) cssClass += ' read';
        
        if (type === 'chain') {
            if (index === 0) cssClass += ' chain-start';
            else if (index === total - 1) cssClass += ' chain-end';
            else cssClass += ' chain-middle';
        }

        return `
            <div class="${cssClass}" data-log-id="${log.id}">
                <div class="log-header">
                    <div class="log-info">
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span class="log-timestamp">${timestamp}</span>
                    </div>
                    <div class="log-actions">
                        ${log.tf_req_id && type !== 'chain' ? 
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
                    ${log.tf_req_id && type !== 'chain' ? 
                        `<span class="log-detail-item">
                            🔗 ${log.tf_req_id.substring(0, 8)}...
                        </span>` : ''
                    }
                </div>
            </div>
        `;
    }

    calculateChainDuration(logs) {
        if (logs.length < 2) return '0ms';
        const start = new Date(logs[0].timestamp);
        const end = new Date(logs[logs.length - 1].timestamp);
        const duration = end - start;
        
        if (duration < 1000) return `${duration}ms`;
        return `${(duration / 1000).toFixed(2)}s`;
    }

    formatTimestampWithDifference(timestamp) {
        const currentDate = new Date(timestamp);
        const formattedTime = currentDate.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let differenceHtml = '';
        if (this.lastTimestamp) {
            const prevDate = new Date(this.lastTimestamp);
            const diff = currentDate - prevDate;
            
            if (diff > 0) {
                if (diff < 1000) {
                    differenceHtml = `<span class="time-difference">+${diff}ms</span>`;
                } else {
                    differenceHtml = `<span class="time-difference">+${(diff / 1000).toFixed(2)}s</span>`;
                }
            }
        }

        this.lastTimestamp = timestamp;
        return formattedTime + differenceHtml;
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

        document.querySelectorAll('.view-chain-details').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const reqId = e.target.dataset.reqId;
                await this.showRequestChainDetails(reqId);
            });
        });

        document.querySelectorAll('.chain-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (!e.target.classList.contains('action-btn')) {
                    const chainGroup = e.currentTarget.parentElement;
                    chainGroup.classList.toggle('expanded');
                }
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

    async showRequestChainDetails(reqId) {
        try {
            const response = await fetch(`${this.API_BASE}/chains/${reqId}`);
            
            if (!response.ok) throw new Error('Chain not found');
            
            const chainData = await response.json();
            this.displayRequestChainDetails(chainData);
            
        } catch (error) {
            console.error('Error loading chain details:', error);
            this.showNotification('Ошибка при загрузке деталей цепочки', 'error');
        }
    }

    displayRequestChain(chainData) {
        const modal = document.getElementById('chainsModal');
        const chainsList = document.getElementById('chainsList');
        
        const sortedLogs = chainData.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        let lastTimestamp = null;
        
        const chainHTML = `
            <div class="chain-group expanded">
                <div class="chain-header">
                    <div>
                        <span>🔗 Детали цепочки запросов</span>
                        <div class="chain-info">
                            <span class="chain-badge">ID: ${chainData.tf_req_id}</span>
                            <span class="chain-badge">Записей: ${chainData.total_logs}</span>
                            <span class="chain-badge">Длительность: ${this.calculateChainDuration(sortedLogs)}</span>
                        </div>
                    </div>
                </div>
                <div class="chain-logs">
                    ${sortedLogs.map(log => {
                        const timestamp = this.formatTimestampWithDifferenceForChain(log.timestamp, lastTimestamp);
                        lastTimestamp = log.timestamp;
                        return `
                            <div class="log-item ${log.is_read ? 'read' : 'unread'}">
                                <div class="log-header">
                                    <span class="log-level ${log.level}">${log.level}</span>
                                    <span class="log-timestamp">${timestamp}</span>
                                </div>
                                <div class="log-message">${this.escapeHtml(log.message)}</div>
                                ${log.tf_rpc ? `<div class="log-details"><span class="log-detail-item">🔄 ${log.tf_rpc}</span></div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        chainsList.innerHTML = chainHTML;
        modal.style.display = 'block';
    }

    displayRequestChainDetails(chainData) {
        const modal = document.getElementById('chainsModal');
        const chainsList = document.getElementById('chainsList');
        
        const sortedLogs = chainData.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const stats = this.calculateChainStats(sortedLogs);
        
        const chainHTML = `
            <div class="chain-group expanded">
                <div class="chain-header">
                    <div>
                        <span>📊 Статистика цепочки</span>
                        <div class="chain-info">
                            <span class="chain-badge">ID: ${chainData.tf_req_id}</span>
                            <span class="chain-badge">Уровни: ${Object.entries(stats.levels).map(([k,v]) => `${k}:${v}`).join(', ')}</span>
                            <span class="chain-badge">Длительность: ${stats.duration}</span>
                        </div>
                    </div>
                </div>
                <div class="chain-logs">
                    <div style="padding: 1rem; background: white; border-radius: 8px; margin-bottom: 1rem;">
                        <h4>Общая статистика:</h4>
                        <p>Всего записей: ${stats.total}</p>
                        <p>Временной диапазон: ${stats.timeRange}</p>
                        <p>Среднее время между событиями: ${stats.avgInterval}</p>
                    </div>
                    ${sortedLogs.map(log => `
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

    calculateChainStats(logs) {
        const levels = {};
        logs.forEach(log => {
            levels[log.level] = (levels[log.level] || 0) + 1;
        });

        const start = new Date(logs[0].timestamp);
        const end = new Date(logs[logs.length - 1].timestamp);
        const duration = end - start;

        let totalInterval = 0;
        for (let i = 1; i < logs.length; i++) {
            totalInterval += new Date(logs[i].timestamp) - new Date(logs[i-1].timestamp);
        }
        const avgInterval = totalInterval / (logs.length - 1);

        return {
            total: logs.length,
            levels: levels,
            duration: duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`,
            timeRange: `${this.formatTimestamp(logs[0].timestamp)} - ${this.formatTimestamp(logs[logs.length - 1].timestamp)}`,
            avgInterval: avgInterval < 1000 ? `${avgInterval.toFixed(0)}ms` : `${(avgInterval / 1000).toFixed(2)}s`
        };
    }

    formatTimestampWithDifferenceForChain(timestamp, lastTimestamp) {
        const currentDate = new Date(timestamp);
        const formattedTime = currentDate.toLocaleString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + '.' + currentDate.getMilliseconds().toString().padStart(3, '0');

        let differenceHtml = '';
        if (lastTimestamp) {
            const prevDate = new Date(lastTimestamp);
            const diff = currentDate - prevDate;
            
            if (diff > 0) {
                differenceHtml = `<span class="time-difference">+${diff}ms</span>`;
            }
        }

        return formattedTime + differenceHtml;
    }

    showLogDetails(logId) {
        const log = this.currentLogs.find(l => l.id == logId);
        if (log) {
            alert(`Детали лога:\n\nСообщение: ${log.message}\nУровень: ${log.level}\nВремя: ${this.formatTimestamp(log.timestamp)}\nРесурс: ${log.tf_resource_type || 'N/A'}\nRPC: ${log.tf_rpc || 'N/A'}`);
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
            .map(([level, count]) => {
                const color = this.getLevelColor(level);
                return `<span style="color: ${color}">${level}: ${count}</span>`;
            })
            .join(', ');
        document.getElementById('levelStats').innerHTML = levelStats || '-';
    }

    getLevelColor(level) {
        const colors = {
            'error': '#dc3545',
            'warn': '#ffc107',
            'info': '#17a2b8',
            'debug': '#6c757d',
            'trace': '#6c757d'
        };
        return colors[level] || '#6c757d';
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