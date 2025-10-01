class TerraViewer {
    constructor() {
        this.API_BASE = 'http://localhost:8000/api';
        this.currentLogs = [];
        this.requestChains = new Map();
        this.lastTimestamp = null;
        this.currentChainIndex = 0;
        this.currentChainId = null;
        this.jsonExpandedState = new Map();
        
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

        document.getElementById('sectionFilter').addEventListener('change', (e) => {
            this.filterLogs();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadLogs();
            this.loadStats();
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

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-error-search')) {
                this.searchLogs('error');
                document.getElementById('levelFilter').value = 'error';
            }
            
            if (e.target.classList.contains('quick-warn-search')) {
                this.searchLogs('warn');
                document.getElementById('levelFilter').value = 'warn';
            }
            
            if (e.target.classList.contains('show-unread')) {
                this.loadLogs(true);
            }
        });

        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                this.closeModal();
            });
        });

        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
            
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                if (e.key === 'ArrowLeft' && this.currentChainId) {
                    this.navigateChain(-1);
                }
                if (e.key === 'ArrowRight' && this.currentChainId) {
                    this.navigateChain(1);
                }
            }
        });
    }

    debounce(func, wait) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(func, wait);
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
        const section = document.getElementById('advancedSectionFilter').value;
        const searchQuery = document.getElementById('advancedSearchInput').value;

        let url = `${this.API_BASE}/logs?limit=500`;
        const params = [];

        if (resourceType) params.push(`tf_resource_type=${encodeURIComponent(resourceType)}`);
        if (level) params.push(`level=${encodeURIComponent(level)}`);
        if (section) params.push(`section=${encodeURIComponent(section)}`);
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
                const filteredLogs = data.filter(log => 
                    log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (log.raw_data && log.raw_data.toLowerCase().includes(searchQuery.toLowerCase()))
                );
                this.displayLogs(filteredLogs);
            } else {
                this.displayLogs(data);
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
        document.getElementById('advancedSectionFilter').value = '';
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

    async loadLogs(unreadOnly = false) {
        this.showLoading();
        this.lastTimestamp = null;
        
        try {
            const searchQuery = document.getElementById('searchInput').value;
            const levelFilter = document.getElementById('levelFilter').value;
            const sectionFilter = document.getElementById('sectionFilter').value;
            
            let url = `${this.API_BASE}/logs?limit=500`;
            
            if (levelFilter) {
                url += `&level=${levelFilter}`;
            }
            if (sectionFilter) {
                url += `&section=${sectionFilter}`;
            }
            if (unreadOnly) {
                url += `&unread_only=true`;
            }

            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            this.currentLogs = data;
            
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
            const response = await fetch(`${this.API_BASE}/search?q=${encodeURIComponent(query)}&limit=500`);
            
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
        const sectionFilter = document.getElementById('sectionFilter').value;
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
        
        const quickSearchHTML = this.generateQuickSearchHTML(logs);
        const logsHTML = quickSearchHTML + this.generateLogsHTML(logs);
        logsList.innerHTML = logsHTML;

        this.attachLogActionsHandlers();
    }

    generateQuickSearchHTML(logs) {
        const errorCount = logs.filter(log => log.level === 'error').length;
        const warnCount = logs.filter(log => log.level === 'warn').length;
        const unreadCount = logs.filter(log => !log.is_read).length;

        return `
            <div class="quick-search">
                <button class="quick-search-btn quick-error-search" title="Быстрый поиск ошибок">
                    🔴 Ошибки (${errorCount})
                </button>
                <button class="quick-search-btn quick-warn-search" title="Быстрый поиск предупреждений">
                    🟡 Предупреждения (${warnCount})
                </button>
                <button class="quick-search-btn show-unread" title="Показать непрочитанные">
                    📌 Непрочитанные (${unreadCount})
                </button>
            </div>
        `;
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

        const sectionBadge = log.section ? `
            <span class="log-detail-item section-badge section-${log.section}">
                🏗️ ${log.section}
            </span>
        ` : '';

        const hasJson = log.json_blocks && Object.keys(log.json_blocks).length > 0;
        const jsonPreview = hasJson ? this.generateJsonPreview(log.json_blocks) : '';

        return `
            <div class="${cssClass}" data-log-id="${log.id}">
                <div class="log-header">
                    <div class="log-info">
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span class="log-timestamp">${timestamp}</span>
                    </div>
                    <div class="log-actions">
                        ${hasJson ? `
                            <button class="action-btn toggle-json" data-log-id="${log.id}">
                                📄 JSON
                            </button>
                        ` : ''}
                        ${log.tf_req_id && type !== 'chain' ? `
                            <button class="action-btn view-chain" data-req-id="${log.tf_req_id}">
                                🔗 Цепочка
                            </button>
                        ` : ''}
                        ${!log.is_read ? `
                            <button class="action-btn mark-read" data-log-id="${log.id}">
                                ✅ Прочитано
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="log-message">${this.escapeHtml(log.message)}</div>
                <div class="log-details">
                    ${sectionBadge}
                    ${log.tf_resource_type ? `
                        <span class="log-detail-item">
                            🏷️ ${log.tf_resource_type}
                        </span>
                    ` : ''}
                    ${log.tf_rpc ? `
                        <span class="log-detail-item">
                            🔄 ${log.tf_rpc}
                        </span>
                    ` : ''}
                    ${log.module ? `
                        <span class="log-detail-item">
                            📦 ${log.module}
                        </span>
                    ` : ''}
                    ${log.tf_req_id && type !== 'chain' ? `
                        <span class="log-detail-item">
                            🔗 ${log.tf_req_id ? log.tf_req_id.substring(0, 8) + '...' : ''}
                        </span>
                    ` : ''}
                </div>
                
                ${hasJson ? `
                    <div class="quick-actions">
                        <button class="quick-action-btn primary toggle-json" data-log-id="${log.id}">
                            📄 Показать JSON
                        </button>
                        ${log.tf_req_id ? `
                            <button class="quick-action-btn warning view-chain" data-req-id="${log.tf_req_id}">
                                🔗 Вся цепочка
                            </button>
                        ` : ''}
                        ${!log.is_read ? `
                            <button class="quick-action-btn success mark-read" data-log-id="${log.id}">
                                ✅ Отметить прочитанным
                            </button>
                        ` : ''}
                        <button class="quick-action-btn" onclick="this.closest('.log-item').classList.toggle('compact')">
                            📏 Компактно
                        </button>
                    </div>
                    
                    <div class="json-accordion" id="json-accordion-${log.id}" style="display: none;">
                        <div class="json-accordion-header active" data-log-id="${log.id}">
                            <span>📋 JSON данные</span>
                            <span class="json-toggle">▼</span>
                        </div>
                        <div class="json-accordion-content active">
                            ${jsonPreview}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    generateJsonPreview(jsonBlocks) {
        let html = '';
        
        Object.entries(jsonBlocks).forEach(([key, value]) => {
            if (value) {
                html += `
                    <div class="json-accordion">
                        <div class="json-accordion-header">
                            <span>${key}</span>
                            <span class="json-toggle">▼</span>
                        </div>
                        <div class="json-accordion-content">
                            <div class="compact-json">
                                ${this.renderCompactJson(value)}
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        return html;
    }

    renderCompactJson(data, level = 0) {
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return `<div class="json-line"><span class="json-string">"${this.escapeHtml(data)}"</span></div>`;
            }
        }
        
        if (typeof data !== 'object' || data === null) {
            const type = typeof data;
            const value = String(data);
            return `<div class="json-line"><span class="json-${type}">${value}</span></div>`;
        }
        
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return '<div class="json-line">[]</div>';
            }
            
            let html = '<div class="json-line">[</div>';
            html += '<div class="json-nested">';
            data.slice(0, 3).forEach((item, index) => {
                html += this.renderCompactJson(item, level + 1);
                if (index < data.length - 1 && index < 2) {
                    html += '<div class="json-line">,</div>';
                }
            });
            if (data.length > 3) {
                html += `<div class="json-line">... и еще ${data.length - 3} элементов</div>`;
            }
            html += '</div>';
            html += '<div class="json-line">]</div>';
            return html;
        }
        
        const keys = Object.keys(data);
        if (keys.length === 0) {
            return '<div class="json-line">{}</div>';
        }
        
        let html = '<div class="json-line">{</div>';
        html += '<div class="json-nested">';
        keys.slice(0, 5).forEach((key, index) => {
            html += `<div class="json-line"><span class="json-key">"${key}"</span>: ${this.renderCompactJson(data[key], level + 1)}</div>`;
            if (index < keys.length - 1 && index < 4) {
                html += '<div class="json-line">,</div>';
            }
        });
        if (keys.length > 5) {
            html += `<div class="json-line">... и еще ${keys.length - 5} свойств</div>`;
        }
        html += '</div>';
        html += '<div class="json-line">}</div>';
        return html;
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

        document.querySelectorAll('.toggle-json').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const logId = e.target.dataset.logId;
                this.toggleJsonAccordion(logId);
            });
        });

        document.querySelectorAll('.json-accordion-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const content = header.nextElementSibling;
                const isActive = header.classList.contains('active');
                
                header.parentElement.querySelectorAll('.json-accordion-header').forEach(h => {
                    h.classList.remove('active');
                });
                header.parentElement.querySelectorAll('.json-accordion-content').forEach(c => {
                    c.classList.remove('active');
                });
                
                if (!isActive) {
                    header.classList.add('active');
                    content.classList.add('active');
                }
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
                if (!e.target.classList.contains('action-btn') && 
                    !e.target.classList.contains('quick-action-btn') &&
                    !e.target.classList.contains('json-accordion-header')) {
                    const logId = item.dataset.logId;
                    this.showLogDetails(logId);
                }
            });
        });
    }

    toggleJsonAccordion(logId) {
        const accordion = document.getElementById(`json-accordion-${logId}`);
        if (accordion) {
            accordion.style.display = accordion.style.display === 'none' ? 'block' : 'none';
        }
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

    async navigateChain(direction) {
        if (!this.currentChainId) return;
        
        const chain = this.requestChains.get(this.currentChainId);
        if (!chain) return;
        
        const sortedChain = chain.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        let newIndex = this.currentChainIndex + direction;
        
        if (newIndex >= 0 && newIndex < sortedChain.length) {
            this.currentChainIndex = newIndex;
            const log = sortedChain[newIndex];
            this.showLogDetails(log.id, true);
            this.highlightLogInList(log.id);
        }
    }

    highlightLogInList(logId) {
        document.querySelectorAll('.log-item').forEach(item => {
            item.classList.remove('highlight');
        });
        
        const logElement = document.querySelector(`[data-log-id="${logId}"]`);
        if (logElement) {
            logElement.classList.add('highlight');
            logElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    showLogDetails(logId, fromNavigation = false) {
        const log = this.currentLogs.find(l => l.id == logId);
        if (!log) return;

        const modal = document.getElementById('logDetailModal');
        const content = document.getElementById('logDetailContent');
        
        let navigationHTML = '';
        if (log.tf_req_id) {
            const chain = this.requestChains.get(log.tf_req_id);
            if (chain && chain.length > 1) {
                const sortedChain = chain.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const currentIndex = sortedChain.findIndex(l => l.id == logId);
                this.currentChainIndex = currentIndex;
                this.currentChainId = log.tf_req_id;
                
                navigationHTML = `
                    <div class="chain-navigation">
                        <button class="nav-btn prev-chain" ${currentIndex === 0 ? 'disabled' : ''}>
                            ← Предыдущий
                        </button>
                        <span class="chain-position">
                            ${currentIndex + 1} из ${sortedChain.length} в цепочке
                        </span>
                        <button class="nav-btn next-chain" ${currentIndex === sortedChain.length - 1 ? 'disabled' : ''}>
                            Следующий →
                        </button>
                    </div>
                    <div class="breadcrumbs">
                        <span class="breadcrumb-item view-full-chain" data-req-id="${log.tf_req_id}">
                            🔗 Вся цепочка запросов
                        </span>
                        <span class="breadcrumb-separator">|</span>
                        <span class="breadcrumb-item" style="cursor: default;">
                            ID: ${log.tf_req_id}
                        </span>
                    </div>
                `;
            }
        }

        const detailsHTML = `
            ${navigationHTML}
            <div class="log-detail-section">
                <h4>Основная информация</h4>
                <div class="quick-actions">
                    ${!log.is_read ? `
                        <button class="quick-action-btn success mark-read-modal" data-log-id="${log.id}">
                            ✅ Отметить прочитанным
                        </button>
                    ` : ''}
                    ${log.json_blocks && Object.keys(log.json_blocks).length > 0 ? `
                        <button class="quick-action-btn primary toggle-all-json">
                            📄 Развернуть все JSON
                        </button>
                    ` : ''}
                </div>
                <p><strong>Уровень:</strong> <span class="log-level ${log.level}">${log.level}</span></p>
                <p><strong>Время:</strong> ${this.formatTimestamp(log.timestamp)}</p>
                <p><strong>Сообщение:</strong> ${this.escapeHtml(log.message)}</p>
                ${log.section ? `<p><strong>Секция:</strong> ${log.section}</p>` : ''}
                ${log.module ? `<p><strong>Модуль:</strong> ${log.module}</p>` : ''}
                ${log.tf_resource_type ? `<p><strong>Тип ресурса:</strong> ${log.tf_resource_type}</p>` : ''}
                ${log.tf_rpc ? `<p><strong>RPC:</strong> ${log.tf_rpc}</p>` : ''}
                ${log.tf_req_id ? `<p><strong>ID запроса:</strong> ${log.tf_req_id}</p>` : ''}
            </div>
            ${log.json_blocks && Object.keys(log.json_blocks).length > 0 ? `
                <div class="log-detail-section">
                    <h4>JSON блоки</h4>
                    ${Object.entries(log.json_blocks).map(([key, value]) => 
                        value ? `
                            <div class="json-accordion">
                                <div class="json-accordion-header active">
                                    <span>${key}</span>
                                    <span class="json-toggle">▼</span>
                                </div>
                                <div class="json-accordion-content active">
                                    <div class="json-viewer">${this.renderJson(value)}</div>
                                </div>
                            </div>
                        ` : ''
                    ).join('')}
                </div>
            ` : ''}
            ${log.raw_data ? `
                <div class="log-detail-section">
                    <h4>Исходные данные</h4>
                    <div class="json-accordion">
                        <div class="json-accordion-header">
                            <span>Raw JSON data</span>
                            <span class="json-toggle">▼</span>
                        </div>
                        <div class="json-accordion-content">
                            <pre class="raw-data">${this.escapeHtml(log.raw_data)}</pre>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
        
        content.innerHTML = detailsHTML;
        modal.style.display = 'block';
        
        this.attachModalHandlers();
        
        if (!fromNavigation) {
            this.highlightLogInList(logId);
        }
    }

    attachModalHandlers() {
        document.querySelector('.prev-chain')?.addEventListener('click', () => {
            this.navigateChain(-1);
        });

        document.querySelector('.next-chain')?.addEventListener('click', () => {
            this.navigateChain(1);
        });

        document.querySelector('.mark-read-modal')?.addEventListener('click', async (e) => {
            const logId = e.target.dataset.logId;
            await this.markAsRead(logId);
            e.target.remove();
        });

        document.querySelector('.view-full-chain')?.addEventListener('click', async (e) => {
            const reqId = e.target.dataset.reqId;
            await this.showRequestChain(reqId);
        });

        document.querySelector('.toggle-all-json')?.addEventListener('click', (e) => {
            const isExpanding = e.target.textContent.includes('Развернуть');
            const headers = document.querySelectorAll('.json-accordion-header');
            const contents = document.querySelectorAll('.json-accordion-content');
            
            headers.forEach(header => {
                if (isExpanding) {
                    header.classList.add('active');
                } else {
                    header.classList.remove('active');
                }
            });
            
            contents.forEach(content => {
                if (isExpanding) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
            
            e.target.textContent = isExpanding ? '📄 Свернуть все JSON' : '📄 Развернуть все JSON';
        });

        document.querySelectorAll('.json-accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                header.classList.toggle('active');
                content.classList.toggle('active');
            });
        });

        this.attachJsonViewerHandlers();
    }

    attachJsonViewerHandlers() {
        document.querySelectorAll('.json-toggle').forEach(toggle => {
            toggle.addEventListener('click', function(e) {
                e.stopPropagation();
                const content = this.parentElement.querySelector('.json-content');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    this.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    this.textContent = '▶';
                }
            });
        });

        document.querySelectorAll('.json-content').forEach(content => {
            content.style.display = 'none';
        });
    }

    renderJson(data) {
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return `<pre>${this.escapeHtml(data)}</pre>`;
            }
        }
        
        if (typeof data !== 'object' || data === null) {
            return `<span class="json-value">${this.escapeHtml(String(data))}</span>`;
        }
        
        if (Array.isArray(data)) {
            return `
                <div class="json-array">
                    [<span class="json-toggle">▶</span>
                    <div class="json-content">
                        ${data.map(item => `
                            <div class="json-item">
                                ${this.renderJson(item)}
                            </div>
                        `).join('')}
                    </div>]
                </div>
            `;
        }
        
        return `
            <div class="json-object">
                {<span class="json-toggle">▶</span>
                <div class="json-content">
                    ${Object.entries(data).map(([key, value]) => `
                        <div class="json-property">
                            <span class="json-key">"${key}"</span>: ${this.renderJson(value)}
                        </div>
                    `).join('')}
                </div>}
            </div>
        `;
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
                                ${log.section ? `<div class="log-details"><span class="log-detail-item section-badge section-${log.section}">🏗️ ${log.section}</span></div>` : ''}
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
                            ${log.section ? `<div class="log-details"><span class="log-detail-item section-badge section-${log.section}">🏗️ ${log.section}</span></div>` : ''}
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
        const sections = {};
        
        logs.forEach(log => {
            levels[log.level] = (levels[log.level] || 0) + 1;
            if (log.section) {
                sections[log.section] = (sections[log.section] || 0) + 1;
            }
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
            sections: sections,
            duration: duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`,
            timeRange: `${this.formatTimestamp(logs[0].timestamp)} - ${this.formatTimestamp(logs[logs.length - 1].timestamp)}`,
            avgInterval: avgInterval < 1000 ? `${avgInterval.toFixed(0)}ms` : `${(avgInterval / 1000).toFixed(2)}s`
        };
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

    async loadStats() {
        try {
            const response = await fetch(`${this.API_BASE}/stats`);
            
            if (response.ok) {
                const stats = await response.json();
                this.displayStats(stats);
            } else {
                console.error('Failed to load stats:', response.status);
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
        document.getElementById('totalLogs').textContent = stats.total_logs || 0;
        document.getElementById('unreadLogs').textContent = stats.unread_logs || 0;
        
        const levelStats = Object.entries(stats.level_stats || {})
            .map(([level, count]) => {
                const color = this.getLevelColor(level);
                return `<span style="color: ${color}">${level}: ${count}</span>`;
            })
            .join(', ');
        document.getElementById('levelStats').innerHTML = levelStats || '-';
        
        const sectionStats = Object.entries(stats.section_stats || {})
            .map(([section, count]) => {
                return `${section}: ${count}`;
            })
            .join(', ');
        document.getElementById('sectionStats').textContent = sectionStats || '-';
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
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
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