    
        /** * FEATURE: INDEXEDDB STORAGE ENGINE
         **/
        const DB_NAME = "AceIDEProDB";
        const DB_VERSION = 1;
        const STORE_NAME = "projectData";
        
        const DB = {
            db: null,
            async init() {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(DB_NAME, DB_VERSION);
                    request.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME);
                        }
                    };
                    request.onsuccess = (e) => {
                        this.db = e.target.result;
                        resolve();
                    };
                    request.onerror = (e) => reject("DB Error: " + e.target.error);
                });
            },
            async set(key, value) {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction([STORE_NAME], "readwrite");
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.put(value, key);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            },
            async get(key) {
                return new Promise((resolve, reject) => {
                    const transaction = this.db.transaction([STORE_NAME], "readonly");
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.get(key);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }
        };
        
        /** * EDITOR CORE CONFIGURATION & STATE
         **/
        ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.7/');
        const editor = ace.edit("editor");
        
        editor.setOption("scrollPastEnd", 0.8);
        editor.setOption("fixedWidthGutter", true);
        editor.setOption("highlightSelectedWord", true);
        editor.setOption("displayIndentGuides", true);
        editor.setOption("highlightGutterLine", false);
        editor.setOption("showPrintMargin", false);
        editor.setOption("highlightActiveLine", true);
        editor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true,
            autoScrollEditorIntoView: true,
            animatedScroll: true,
        });
        editor.focus();
        editor.getSession().setUseWorker(false);
        editor.getCursorPosition();
        editor.renderer.setScrollMargin(10, 10);
        AceColorPicker.load(ace, editor);
        
        const DEFAULT_SETTINGS = {
            theme: 'ace/theme/monokai',
            fontFamily: 'Fira Code',
            fontSize: 14,
            tabSize: 4,
            softTabs: true,
            wrap: false,
            showInvisibles: false,
            showToolbar: true
        };
        
        const DEFAULT_FS_TEMPLATE = {
            id: 'root',
            type: 'folder',
            name: 'root',
            children: [
                { id: 'f1', name: 'index.html', type: 'file', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>New Project</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>' },
                { id: 'f2', name: 'style.css', type: 'file', content: 'body { font-family: sans-serif; padding: 20px; }' },
                { id: 'f3', name: 'script.js', type: 'file', content: 'console.log("Hello from AceIDE Pro!");' }
            ]
        };
        
        const DEFAULT_STORE = {
            settings: DEFAULT_SETTINGS,
            activeProjectId: 'default',
            projects: [{
                id: 'default',
                name: 'My Project',
                lastModified: Date.now(),
                fs: JSON.parse(JSON.stringify(DEFAULT_FS_TEMPLATE))
            }]
        };
        
        let store;
        let currentProject;
        let fsData;
        let sessions = {};
        let openTabs = [];
        let currentFileId = null;
        let expandedFolders = new Set(['root']);
        let importTargetFolder = null;
        let autoSaveTimeout;
        let isDesktopMode = false;
        let searchOptions = { regex: false, case: false, word: false };
        
        /** * ASYNC APP INITIALIZATION
         **/
        async function init() {
            try {
                await DB.init();
                
                let savedData = await DB.get('ace_ide_pro_data');
                
                // Migration from LocalStorage to IndexedDB
                if (!savedData) {
                    const oldData = localStorage.getItem('ace_ide_pro_data');
                    if (oldData) {
                        savedData = JSON.parse(oldData);
                        await DB.set('ace_ide_pro_data', savedData);
                    }
                }
                
                store = savedData || DEFAULT_STORE;
                
                document.getElementById('set-theme').value = store.settings.theme;
                document.getElementById('set-font').value = store.settings.fontFamily;
                document.getElementById('set-size').value = store.settings.fontSize;
                document.getElementById('set-tabsize').value = store.settings.tabSize;
                document.getElementById('set-softtabs').checked = store.settings.softTabs;
                document.getElementById('set-wrap').checked = store.settings.wrap;
                document.getElementById('set-invisibles').checked = store.settings.showInvisibles;
                document.getElementById('set-toolbar').checked = store.settings.showToolbar !== false;
                
                applySettings();
                
                currentProject = store.projects.find(p => p.id === store.activeProjectId) || store.projects[0];
                
                if (store.lastOpenTabs) {
                    store.lastOpenTabs = store.lastOpenTabs.filter(id => findNode(currentProject.fs.children, id));
                }
                
                loadProjectIntoWorkspace(currentProject);
                updateStatusBar();
                
            } catch (err) {
                console.error("Initialization failed:", err);
                showStatusMsg("Storage Error!", true);
            }
        }
        
        /** * PROJECT MANAGEMENT LOGIC
         **/
        function loadProjectIntoWorkspace(project) {
            currentProject = project;
            store.activeProjectId = project.id;
            fsData = project.fs;
            document.getElementById('project-name-display').textContent = project.name;
            sessions = {};
            openTabs = store.lastOpenTabs || [];
            currentFileId = store.lastActiveFileId || null;
            expandedFolders = new Set(['root']);
            renderTree();
            renderProjectList();
            if (currentFileId) {
                openFile(currentFileId);
            } else {
                updateUI();
            }
            updateStatusBar();
        }
        
        function createNewProject() {
            const validator = (name) => {
                const cleanName = name.trim();
                if (!cleanName) return null;
                const exists = store.projects.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
                return exists ? "A project with this name already exists." : null;
            };
            
            Modal.prompt("Project Name", "New Project", validator).then(name => {
                if (!name || !name.trim()) return;
                const newProj = {
                    id: generateUID(),
                    name: name.trim(),
                    lastModified: Date.now(),
                    fs: JSON.parse(JSON.stringify(DEFAULT_FS_TEMPLATE))
                };
                store.projects.push(newProj);
                loadProjectIntoWorkspace(newProj);
                switchTab('explorer');
                showStatusMsg("Project created successfully");
            });
        }
        
        function renameProject(pid) {
            const proj = store.projects.find(p => p.id === pid);
            if (!proj) return;
            const validator = (newName) => {
                const cleanName = newName.trim();
                if (!cleanName || cleanName === proj.name) return null;
                const exists = store.projects.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
                return exists ? "This project name is already taken." : null;
            };
            Modal.prompt("Rename Project", proj.name, validator).then(newName => {
                if (newName && newName.trim() && newName.trim() !== proj.name) {
                    proj.name = newName.trim();
                    if (pid === currentProject.id) {
                        document.getElementById('project-name-display').textContent = proj.name;
                    }
                    renderProjectList();
                    saveProjectData();
                    showStatusMsg("Project renamed.");
                }
            });
        }
        
        function deleteProject(pid) {
            Modal.confirm("Delete Project", "This action cannot be undone.").then(ok => {
                if (!ok) return;
                const idx = store.projects.findIndex(p => p.id === pid);
                if (idx === -1) return;
                store.projects.splice(idx, 1);
                if (pid === currentProject.id && store.projects.length > 0) {
                    loadProjectIntoWorkspace(store.projects[0]);
                } else if (store.projects.length === 0) {
                    createNewProject();
                }
                renderProjectList();
                saveProjectData();
            });
        }
        
        function renderProjectList() {
            const list = document.getElementById('project-list');
            list.innerHTML = '';
            store.projects.forEach(p => {
                const el = document.createElement('div');
                el.className = `project-item ${p.id === currentProject.id ? 'active' : ''}`;
                const dateStr = new Date(p.lastModified).toLocaleString();
                el.innerHTML = `
            <div class="project-info">
                <div class="project-name">${p.name}</div>
                <div class="project-meta">Modified: ${dateStr}</div>
            </div>
            <div class="project-actions">
                <i class="fas fa-edit" title="Rename" onclick="event.stopPropagation(); renameProject('${p.id}')"></i>
                ${store.projects.length > 1 ? `<i class="fas fa-trash" title="Delete" onclick="event.stopPropagation(); deleteProject('${p.id}')"></i>` : ''}
            </div>
        `;
                el.onclick = () => {
                    if (p.id !== currentProject.id) {
                        saveProjectData();
                        loadProjectIntoWorkspace(p);
                    }
                };
                list.appendChild(el);
            });
        }
        
        /** * FILE EXPLORER & TREE RENDERING
         **/
        function renderTree() {
            const root = document.getElementById('tree-root');
            root.innerHTML = '';
            const sortedChildren = [...fsData.children].sort(sortNodes);
            sortedChildren.forEach(node => root.appendChild(createNodeEl(node, 0, 'root')));
        }
        
        function createNodeEl(node, depth, parentId) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tree-node-wrapper';
            const row = document.createElement('div');
            row.className = `tree-node ${currentFileId === node.id ? 'active-file' : ''}`;
            row.style.paddingLeft = `${depth * 15 + 10}px`;
            row.onclick = e => {
                e.stopPropagation();
                if (node.type === 'folder') toggleFolder(node.id);
                else openFile(node.id);
            };
            row.oncontextmenu = e => {
                e.preventDefault();
                showContextMenu(e, node, parentId);
            };
            const isExpanded = expandedFolders.has(node.id);
            const arrowClass = node.type === 'folder' ? `fas fa-chevron-right arrow ${isExpanded ? 'expanded' : ''}` : 'arrow spacer';
            let iconHtml = node.type === 'folder' ? `<i class="fas fa-folder${isExpanded ? '-open' : ''} icon ${getFolderStyle(node.name).cls}"></i>` : getFileIcon(node.name);
            row.innerHTML = `<i class="${arrowClass}"></i><div class="icon">${iconHtml}</div><span>${node.name}</span>`;
            wrapper.appendChild(row);
            if (node.type === 'folder' && isExpanded && node.children?.length > 0) {
                const sortedChildren = [...node.children].sort(sortNodes);
                sortedChildren.forEach(child => wrapper.appendChild(createNodeEl(child, depth + 1, node.id)));
            } else if (node.type === 'folder' && isExpanded && (!node.children || node.children.length === 0)) {
                const empty = document.createElement('div');
                empty.textContent = '(empty)';
                empty.style.paddingLeft = `${(depth + 1) * 15 + 28}px`;
                empty.style.color = '#555';
                empty.style.fontStyle = 'italic';
                empty.style.fontSize = '0.8rem';
                wrapper.appendChild(empty);
            }
            return wrapper;
        }
        
        function sortNodes(a, b) {
            if (a.type === 'file' && b.type === 'folder') return 1;
            if (a.type === 'folder' && b.type === 'file') return -1;
            return 0;
        }
        
        function getFolderStyle(name) {
            const n = name.toLowerCase();
            if (['src', 'source', 'code'].includes(n)) return { cls: 'f-src' };
            if (['app', 'core'].includes(n)) return { cls: 'f-app' };
            if (['api', 'server', 'backend'].includes(n)) return { cls: 'f-api' };
            if (['assets', 'img', 'images', 'public'].includes(n)) return { cls: 'f-assets' };
            return { cls: 'f-default' };
        }
        
        function getFileIcon(name) {
            if (!name) return `<i class="fas fa-file"></i>`;
            const lower = name.toLowerCase();
            let iconName = 'plain';
            if (lower.endsWith('.html') || lower.endsWith('.htm')) iconName = 'html5';
            else if (lower.endsWith('.css')) iconName = 'css3';
            else if (lower.endsWith('.js')) iconName = 'javascript';
            else if (lower.endsWith('.jsx')) iconName = 'react';
            else if (lower.endsWith('.ts') || lower.endsWith('.tsx')) iconName = 'typescript';
            else if (lower.endsWith('.json')) iconName = 'json';
            else if (lower.endsWith('.md')) iconName = 'markdown';
            else if (lower.endsWith('.py')) iconName = 'python';
            else if (lower.endsWith('.java')) iconName = 'java';
            else if (lower.endsWith('.php')) iconName = 'php';
            else return `<i class="fas fa-file"></i>`;
            const url = `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${iconName}/${iconName}-original.svg`;
            return `<img src="${url}" style="width:18px; height:18px;" alt="${iconName}">`;
        }
        
        function getMode(name) {
            const ext = name.toLowerCase();
            if (ext.endsWith('.js')) return 'ace/mode/javascript';
            if (ext.endsWith('.html')) return 'ace/mode/html';
            if (ext.endsWith('.css')) return 'ace/mode/css';
            if (ext.endsWith('.json')) return 'ace/mode/json';
            return 'ace/mode/text';
        }
        
        /** * TAB & SESSION MANAGEMENT
         **/
        function openFile(id) {
            const node = findNode(fsData.children, id);
            if (!node || node.type !== 'file') return;
            expandToNode(id);
            if (!openTabs.includes(id)) openTabs.push(id);
            if (!sessions[id]) {
                const session = ace.createEditSession(node.content || '', getMode(node.name));
                session.setUseWorker(false);
                session.on('change', () => {
                    node.content = session.getValue();
                    currentProject.lastModified = Date.now();
                    triggerAutoSave();
                });
                sessions[id] = session;
            }
            currentFileId = id;
            editor.setSession(sessions[id]);
            editor.selection.on('changeCursor', updateStatusBar);
            updateStatusBar();
            applySettings();
            editor.focus();
            updateUI();
            saveProjectData();
            if (window.innerWidth <= 768) toggleSidebar(false);
        }
        
        function closeTab(id) {
            const idx = openTabs.indexOf(id);
            if (idx > -1) openTabs.splice(idx, 1);
            if (currentFileId === id) {
                if (openTabs.length > 0) {
                    openFile(openTabs[openTabs.length - 1]);
                } else {
                    currentFileId = null;
                    const dummySession = ace.createEditSession("", "ace/mode/text");
                    editor.setSession(dummySession);
                }
            }
            updateUI();
            saveProjectData();
            updateStatusBar();
        }
        
        function closeAllTabs() {
            Modal.confirm("Close All Tabs", "Are you sure you want to close all open files?").then(ok => {
                if (!ok) return;
                openTabs = [];
                currentFileId = null;
                sessions = {};
                updateUI();
                saveProjectData();
            });
        }
        
        function closeOtherTabs(idToKeep) {
            openTabs = [idToKeep];
            currentFileId = idToKeep;
            editor.setSession(sessions[idToKeep]);
            Object.keys(sessions).forEach(sessId => { if (sessId !== idToKeep) delete sessions[sessId]; });
            updateUI();
            saveProjectData();
        }
        
        /** * EDITOR SETTINGS & UI UPDATES
         **/
        function updateUI() {
            renderTree();
            const editorEl = document.getElementById('editor');
            const emptyEl = document.getElementById('empty-state');
            editorEl.style.display = currentFileId ? 'block' : 'none';
            emptyEl.style.display = currentFileId ? 'none' : 'flex';
            const bar = document.getElementById('tab-bar');
            bar.innerHTML = '';
            openTabs.forEach(id => {
                const node = findNode(fsData.children, id);
                if (!node) return;
                const tab = document.createElement('div');
                tab.className = `tab ${currentFileId === id ? 'active' : ''}`;
                tab.dataset.id = id;
                tab.innerHTML = `<div class="icon" style="margin-right:6px;">${getFileIcon(node.name)}</div>${node.name}<i class="fas fa-times tab-close"></i>`;
                tab.onclick = () => openFile(id);
                tab.querySelector('.tab-close').onclick = e => {
                    e.stopPropagation();
                    closeTab(id);
                };
                bar.appendChild(tab);
                if (currentFileId === id) {
                    setTimeout(() => {
                        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                    }, 50);
                }
            });
        }
        
        function applySettings() {
            editor.setTheme(store.settings.theme);
            editor.setFontSize(store.settings.fontSize);
            editor.getSession().setTabSize(store.settings.tabSize);
            editor.getSession().setUseSoftTabs(store.settings.softTabs);
            editor.setOption('wrap', store.settings.wrap);
            editor.setOption('showInvisibles', store.settings.showInvisibles);
            editor.renderer.setOption('fontFamily', store.settings.fontFamily);
            const toolbar = document.querySelector('.quick-toolbar');
            if (toolbar) toolbar.style.display = store.settings.showToolbar ? 'flex' : 'none';
        }
        
        function updateSettings() {
            store.settings = {
                theme: document.getElementById('set-theme').value,
                fontFamily: document.getElementById('set-font').value,
                fontSize: parseInt(document.getElementById('set-size').value),
                tabSize: parseInt(document.getElementById('set-tabsize').value),
                softTabs: document.getElementById('set-softtabs').checked,
                wrap: document.getElementById('set-wrap').checked,
                showInvisibles: document.getElementById('set-invisibles').checked,
                showToolbar: document.getElementById('set-toolbar').checked,
            };
            saveProjectData();
            applySettings();
        }
        
        function resetSettings() {
            Modal.confirm("Reset Settings", "Are you sure you want to restore all settings to default?").then(ok => {
                if (!ok) return;
                store.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                document.getElementById('set-theme').value = store.settings.theme;
                document.getElementById('set-font').value = store.settings.fontFamily;
                document.getElementById('set-size').value = store.settings.fontSize;
                document.getElementById('set-tabsize').value = store.settings.tabSize;
                document.getElementById('set-softtabs').checked = store.settings.softTabs;
                document.getElementById('set-wrap').checked = store.settings.wrap;
                document.getElementById('set-invisibles').checked = store.settings.showInvisibles;
                document.getElementById('set-toolbar').checked = store.settings.showToolbar;
                applySettings();
                saveProjectData();
            });
        }
        
        /** * SEARCH & REPLACE MODULE
         **/
        function openSearchBox() {
            const box = document.getElementById('search-box');
            const input = document.getElementById('search-input');
            const btn = document.getElementById('header-search-btn');
            const selectedText = editor.getSelectedText();
            if (selectedText) input.value = selectedText;
            box.style.display = 'block';
            btn.classList.add('btn-search-active');
            setTimeout(() => {
                input.focus();
                if (input.value) input.select();
                performSearch();
            }, 10);
        }
        
        function closeSearchBox() {
            const box = document.getElementById('search-box');
            const btn = document.getElementById('header-search-btn');
            box.style.display = 'none';
            btn.classList.remove('btn-search-active');
            editor.focus();
        }
        
        function toggleSearchBtn() {
            const box = document.getElementById('search-box');
            if (box.style.display === 'block') closeSearchBox();
            else openSearchBox();
        }
        
        function toggleSearchOpt(opt) {
            searchOptions[opt] = !searchOptions[opt];
            const el = document.getElementById(`sb-${opt}`);
            if (el) el.classList.toggle('active', searchOptions[opt]);
            performSearch();
        }
        
        function performSearch() {
            const query = document.getElementById('search-input').value;
            const countEl = document.getElementById('sb-count');
            editor.getSession().highlight(null);
            if (!query) {
                countEl.textContent = "0/0";
                editor.clearSelection();
                return;
            }
            try {
                editor.find(query, { regExp: searchOptions.regex, caseSensitive: searchOptions.case, wholeWord: searchOptions.word, wrap: true, preventScroll: false });
                editor.getSession().highlight(query);
                updateSearchCount();
            } catch (e) { countEl.textContent = "Err"; }
        }
        
        function updateSearchCount() {
            const query = document.getElementById('search-input').value;
            const countEl = document.getElementById('sb-count');
            if (!query) { countEl.textContent = "0/0"; return; }
            const session = editor.getSession();
            const Search = ace.require("ace/search").Search;
            const searcher = new Search();
            searcher.set({ needle: query, regExp: searchOptions.regex, caseSensitive: searchOptions.case, wholeWord: searchOptions.word });
            const allMatches = searcher.findAll(session);
            if (allMatches.length > 0) {
                const cursor = editor.getSelection().getCursor();
                let currentIdx = allMatches.findIndex(range => range.start.row > cursor.row || (range.start.row === cursor.row && range.start.column >= cursor.column));
                if (currentIdx === -1) currentIdx = allMatches.length;
                else if (currentIdx === 0 && allMatches.length > 0) currentIdx = 1;
                countEl.textContent = `${currentIdx}/${allMatches.length}`;
            } else { countEl.textContent = "0/0"; }
        }
        
        function findNext() {
            editor.findNext();
            updateSearchCount();
        }
        
        function findPrev() {
            editor.findPrevious();
            updateSearchCount();
        }
        
        function replaceOne() {
            editor.replace(document.getElementById('replace-input').value);
            updateSearchCount();
        }
        
        function replaceAll() {
            editor.replaceAll(document.getElementById('replace-input').value);
            updateSearchCount();
        }
        
        function toggleReplaceSection() {
            const section = document.getElementById('sb-replace-section');
            const toggleIcon = document.getElementById('sb-expand-toggle');
            const isHidden = section.style.display === 'none';
            section.style.display = isHidden ? 'block' : 'none';
            toggleIcon.classList.toggle('expanded', isHidden);
        }
        
        /** * FILE SEARCH & NAVIGATION
         **/
        function handleFileSearch() {
            const input = document.getElementById('file-search-input');
            const query = input.value.trim().toLowerCase();
            const container = document.getElementById('tree-root');
            if (!query) { renderTree(); return; }
            const results = [];
            
            function collect(children, path = '') {
                children.forEach(node => {
                    const currentPath = path ? `${path} / ${node.name}` : node.name;
                    if (node.name.toLowerCase().includes(query)) results.push({ ...node, displayPath: path || '(root)' });
                    if (node.type === 'folder' && node.children) collect(node.children, currentPath);
                });
            }
            collect(fsData.children);
            container.innerHTML = '';
            if (results.length === 0) {
                const msg = document.createElement('div');
                msg.textContent = `No matches found for "${input.value}"`;
                msg.style.padding = '15px';
                msg.style.color = '#888';
                msg.style.fontStyle = 'italic';
                container.appendChild(msg);
                return;
            }
            results.forEach(node => {
                const wrapper = document.createElement('div');
                wrapper.className = 'tree-node-wrapper';
                const row = document.createElement('div');
                row.className = 'tree-node';
                row.style.paddingLeft = '10px';
                row.style.height = 'auto';
                row.style.paddingTop = '6px';
                row.style.paddingBottom = '6px';
                row.style.flexWrap = 'wrap';
                row.onclick = () => {
                    const ancestors = findAncestors(fsData.children, node.id);
                    if (ancestors) ancestors.forEach(id => expandedFolders.add(id));
                    toggleExplorerSearch(false);
                    if (node.type === 'folder') {
                        expandedFolders.add(node.id);
                        input.value = '';
                        renderTree();
                    }
                    else {
                        input.value = '';
                        renderTree();
                        openFile(node.id);
                    }
                };
                let iconHtml = node.type === 'folder' ? `<i class="fas fa-folder icon ${getFolderStyle(node.name).cls}"></i>` : getFileIcon(node.name);
                row.innerHTML = `<div style="display:flex; align-items:center; width:100%;"><i class="arrow spacer"></i><div class="icon">${iconHtml}</div><span style="flex: 1; overflow: hidden; text-overflow: ellipsis; font-weight:${node.type === 'folder' ? 'bold' : 'normal'}">${node.name}</span></div><div style="color: #666; font-size: 0.7rem; margin-left: 32px; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${node.displayPath}</div>`;
                wrapper.appendChild(row);
                container.appendChild(wrapper);
            });
        }
        
        function toggleExplorerSearch(show) {
            const defaultState = document.getElementById('header-default-state');
            const searchState = document.getElementById('header-search-state');
            const input = document.getElementById('file-search-input');
            if (show) {
                defaultState.style.display = 'none';
                searchState.style.display = 'flex';
                input.focus();
            }
            else {
                defaultState.style.display = 'flex';
                searchState.style.display = 'none';
                input.value = '';
                handleFileSearch();
            }
        }
        
        /** * EDITOR COMMANDS & FORMATTING
         **/
        editor.commands.addCommand({ name: 'formatCode', bindKey: { win: 'Alt-Shift-F', mac: 'Alt-Shift-F' }, exec: () => formatCode() });
        editor.commands.addCommand({ name: 'runProject', bindKey: { win: 'Ctrl-R', mac: 'Command-R' }, exec: () => runProject(), readOnly: true });
        editor.commands.addCommand({ name: "find", bindKey: { win: "Ctrl-F", mac: "Command-F" }, exec: () => openSearchBox(), readOnly: true });
        editor.commands.addCommand({ name: "closeSearch", bindKey: { win: "Esc", mac: "Esc" }, exec: () => closeSearchBox() });
        
        function formatCode() {
            if (!currentFileId) return;
            const session = editor.getSession();
            let value = session.getValue();
            const mode = session.getMode().$id;
            if (mode.includes('html')) value = html_beautify(value);
            else if (mode.includes('css')) value = css_beautify(value);
            else if (mode.includes('javascript') || mode.includes('json')) value = js_beautify(value);
            if (value !== session.getValue()) session.setValue(value);
        }
        
        /** * MODAL & CONTEXT MENU COMPONENTS
         **/
        const Modal = {
            overlay: document.getElementById('modal-overlay'),
            title: document.getElementById('modal-title'),
            message: document.getElementById('modal-message'),
            input: document.getElementById('modal-input'),
            error: document.getElementById('modal-error'),
            confirmBtn: document.getElementById('modal-confirm'),
            cancelBtn: document.getElementById('modal-cancel'),
            show() { this.overlay.style.display = 'flex'; },
            hide() {
                this.overlay.style.display = 'none';
                this.input.oninput = null;
            },
            reset() {
                this.input.style.display = 'block';
                this.message.style.display = 'none';
                this.error.style.display = 'none';
                this.error.textContent = '';
                this.input.value = '';
                this.confirmBtn.disabled = false;
                this.confirmBtn.style.opacity = "1";
            },
            prompt(title, defaultVal = '', validateFn = null) {
                return new Promise(resolve => {
                    this.reset();
                    this.title.textContent = title;
                    this.input.value = defaultVal;
                    this.show();
                    const handleValidation = () => {
                        if (validateFn) {
                            const errorMsg = validateFn(this.input.value);
                            if (errorMsg) {
                                this.error.textContent = errorMsg;
                                this.error.style.display = 'block';
                                this.confirmBtn.disabled = true;
                                this.confirmBtn.style.opacity = "0.5";
                            }
                            else {
                                this.error.style.display = 'none';
                                this.confirmBtn.disabled = false;
                                this.confirmBtn.style.opacity = "1";
                            }
                        }
                    };
                    this.input.oninput = handleValidation;
                    this.confirmBtn.onclick = () => {
                        this.hide();
                        resolve(this.input.value);
                    };
                    this.cancelBtn.onclick = () => {
                        this.hide();
                        resolve(null);
                    };
                    setTimeout(() => {
                        this.input.focus();
                        handleValidation();
                    }, 100);
                });
            },
            confirm(title, msg) {
                return new Promise(resolve => {
                    this.reset();
                    this.title.textContent = title;
                    this.message.textContent = msg;
                    this.message.style.display = 'block';
                    this.input.style.display = 'none';
                    this.show();
                    this.confirmBtn.onclick = () => {
                        this.hide();
                        resolve(true);
                    };
                    this.cancelBtn.onclick = () => {
                        this.hide();
                        resolve(false);
                    };
                });
            },
            alert(title, msg) {
                return new Promise(resolve => {
                    this.reset();
                    this.title.textContent = title;
                    this.message.textContent = msg;
                    this.message.style.display = 'block';
                    this.input.style.display = 'none';
                    this.cancelBtn.style.display = 'none';
                    this.show();
                    this.confirmBtn.onclick = () => {
                        this.hide();
                        this.cancelBtn.style.display = 'inline-block';
                        resolve(true);
                    };
                });
            }
        };
        
        const ctxMenu = document.getElementById('context-menu');
        document.addEventListener('click', () => ctxMenu.style.display = 'none');
        
        function showContextMenu(e, node, parentId) {
            ctxMenu.innerHTML = '';
            if (node.type === 'folder') {
                addCtxItem('New File', 'fa-file-circle-plus', () => startCreate('file', node));
                addCtxItem('New Folder', 'fa-folder-plus', () => startCreate('folder', node));
                addCtxItem('Import File', 'fa-file-import', () => triggerImport(node));
                addCtxSep();
            } else {
                addCtxItem('Download File', 'fa-download', () => downloadFile(node));
                addCtxSep();
            }
            addCtxItem('Rename', 'fa-edit', () => renameItem(node));
            addCtxItem('Delete', 'fa-trash', () => deleteItem(node, parentId));
            ctxMenu.style.display = 'block';
            const menuWidth = 180;
            const menuHeight = ctxMenu.offsetHeight || 200;
            let posX = e.clientX;
            let posY = e.clientY;
            if (posX + menuWidth > window.innerWidth) posX -= menuWidth;
            if (posY + menuHeight > window.innerHeight) posY -= menuHeight;
            ctxMenu.style.left = posX + 'px';
            ctxMenu.style.top = posY + 'px';
        }
        
        function addCtxItem(text, icon, callback) {
            const item = document.createElement('div');
            item.className = 'ctx-item';
            item.innerHTML = `<i class="fas ${icon}"></i>${text}`;
            item.onclick = e => {
                e.stopPropagation();
                ctxMenu.style.display = 'none';
                callback();
            };
            ctxMenu.appendChild(item);
        }
        
        function addCtxSep() {
            const sep = document.createElement('div');
            sep.className = 'ctx-sep';
            ctxMenu.appendChild(sep);
        }
        
        /** * FILE & FOLDER OPERATIONS
         **/
        function generateUID() { return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(); }
        
        function startCreate(type, parentNode) {
            toggleExplorerSearch(false);
            const parent = parentNode ? parentNode : { children: fsData.children };
            const validator = (name) => {
                const cleanName = name.trim();
                if (!cleanName) return null;
                const exists = parent.children.some(node => node.name.toLowerCase() === cleanName.toLowerCase() && node.type === type);
                return exists ? `A ${type} with this name already exists.` : null;
            };
            Modal.prompt(`New ${type === 'file' ? 'File' : 'Folder'} Name`, '', validator).then(name => {
                if (!name || !name.trim()) return;
                const newNode = { id: generateUID(), name: name.trim(), type, content: type === 'file' ? '' : undefined, children: type === 'folder' ? [] : undefined };
                parent.children.push(newNode);
                if (parentNode) expandedFolders.add(parentNode.id);
                saveProjectData();
                renderTree();
                if (type === 'file') openFile(newNode.id);
            });
        }
        
        function renameItem(node) {
            let parentChildren;
            const ancestors = findAncestors(fsData.children, node.id);
            parentChildren = (!ancestors || ancestors.length === 0) ? fsData.children : findNode(fsData.children, ancestors[ancestors.length - 1]).children;
            const validator = (name) => {
                const cleanName = name.trim();
                if (!cleanName || cleanName === node.name) return null;
                const exists = parentChildren.some(n => n.name.toLowerCase() === cleanName.toLowerCase() && n.type === node.type);
                return exists ? `Name already exists in this folder.` : null;
            };
            Modal.prompt('Rename', node.name, validator).then(newName => {
                if (newName && newName.trim() && newName.trim() !== node.name) {
                    node.name = newName.trim();
                    saveProjectData();
                    renderTree();
                    updateUI();
                    updateStatusBar();
                }
            });
        }
        
        function deleteItem(node, parentId) {
            Modal.confirm(`Delete ${node.type}`, `Do you want to delete "${node.name}"?`).then(ok => {
                if (!ok) return;
                if (sessions[node.id]) {
                    sessions[node.id].destroy();
                    delete sessions[node.id];
                }
                const parent = parentId === 'root' ? fsData.children : findNode(fsData.children, parentId).children;
                const idx = parent.findIndex(n => n.id === node.id);
                if (idx > -1) parent.splice(idx, 1);
                if (openTabs.includes(node.id)) closeTab(node.id);
                saveProjectData();
                renderTree();
                updateUI();
            });
        }
        
        function checkNameConflict(parentChildren, name, type) { return parentChildren.some(node => node.name.toLowerCase() === name.toLowerCase() && node.type === type); }
        
        /** * IMPORT & EXPORT MODULE
         **/
        function triggerImport(folderNode) {
            importTargetFolder = folderNode;
            document.getElementById('file-importer').click();
        }
        
        function handleFileImport(input) {
            const files = Array.from(input.files);
            if (files.length === 0) return;
            const targetList = importTargetFolder ? importTargetFolder.children : fsData.children;
            let filesProcessed = 0;
            let importedCount = 0;
            let lastId = null;
            let skipped = [];
            files.forEach((file, index) => {
                if (checkNameConflict(targetList, file.name, 'file')) {
                    skipped.push(file.name);
                    filesProcessed++;
                    if (filesProcessed === files.length) handleFinish();
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    const newFile = { id: generateUID() + index, name: file.name, type: 'file', content: e.target.result };
                    targetList.push(newFile);
                    lastId = newFile.id;
                    importedCount++;
                    filesProcessed++;
                    if (filesProcessed === files.length) handleFinish();
                };
                reader.readAsText(file);
            });
            
            function handleFinish() {
                if (importTargetFolder) expandedFolders.add(importTargetFolder.id);
                saveProjectData();
                renderTree();
                if (lastId) openFile(lastId);
                input.value = '';
                if (importedCount > 0) showStatusMsg(`Imported ${importedCount} files.`);
                if (skipped.length > 0) Modal.alert("Import Conflict", `${skipped.length} files skipped.`);
            }
        }
        
        function downloadFile(node) { saveAs(new Blob([node.content], { type: 'text/plain' }), node.name); }
        
        function downloadProject() {
            const zip = new JSZip();
            
            function add(items, folder) {
                items.forEach(item => {
                    if (item.type === 'folder') add(item.children || [], folder.folder(item.name));
                    else folder.file(item.name, item.content || '');
                });
            }
            add(fsData.children, zip);
            zip.generateAsync({ type: 'blob' }).then(blob => saveAs(blob, currentProject.name + '.zip'));
        }
        
        /** * LIVE PREVIEW & VIRTUAL CONSOLE
         **/
        function runProject() {
            clearConsole();
            const activeFile = currentFileId ? findNode(fsData.children, currentFileId) : null;
            if (!activeFile || !activeFile.name.endsWith('.html')) { showStatusMsg("Open an HTML file to preview.", true); return; }
            const ancestors = findAncestors(fsData.children, activeFile.id);
            const parentFolder = (ancestors && ancestors.length > 0) ? findNode(fsData.children, ancestors[ancestors.length - 1]) : fsData;
            let htmlContent = activeFile.content;
            const scriptRegex = /<script\b[^>]*?\bsrc=["'](.+?)["'][^>]*><\/script>/gi;
            const linkRegex = /<link\b[^>]*?\bhref=["'](.+?)["'][^>]*>/gi;
            let processedHtml = htmlContent.replace(scriptRegex, (match, path) => {
                const linked = findFileByPath(path, parentFolder.children);
                return linked ? `<script>\n${linked.content}\n<\/script>` : match;
            }).replace(linkRegex, (match, path) => {
                const linked = findFileByPath(path, parentFolder.children);
                return (linked && linked.name.endsWith('.css')) ? `<style>\n${linked.content}\n</style>` : match;
            });
            if (!window.history.state || window.history.state.view !== 'preview') window.history.pushState({ view: 'preview' }, 'Preview', window.location.pathname);
            injectAndPreview(processedHtml);
        }
        
        function injectAndPreview(htmlContent) {
            const consoleScript = `<script>
        (function(){
            const oldLog = console.log; const oldWarn = console.warn; const oldError = console.error;
            function send(type, args) { try { const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '); window.parent.postMessage({type: 'console', method: type, message: msg}, '*'); } catch(e) {} }
            console.log = function(...a){ oldLog.apply(console, a); send('log', a); };
            console.warn = function(...a){ oldWarn.apply(console, a); send('warn', a); };
            console.error = function(...a){ oldError.apply(console, a); send('error', a); };
            window.onerror = function(m, s, l, c) { send('error', [m + ' (' + l + ':' + c + ')']); return false; };
        })();
    <\/script>`;
            const frame = document.getElementById('preview-frame');
            frame.srcdoc = htmlContent.includes('<head>') ? htmlContent.replace('<head>', '<head>' + consoleScript) : consoleScript + htmlContent;
            document.getElementById('preview-overlay').style.display = 'flex';
        }
        
        function toggleDesktopMode() {
            const frame = document.getElementById('preview-frame');
            const btn = document.getElementById('desktop-toggle-btn');
            const container = document.querySelector('.preview-content');
            isDesktopMode = !isDesktopMode;
            if (isDesktopMode) {
                frame.classList.add('desktop-mode');
                btn.classList.add('btn-toggle-active');
                btn.innerHTML = '<i class="fas fa-mobile-alt"></i>';
                const zoom = container.clientWidth / 1280;
                frame.style.zoom = zoom;
                frame.style.MozTransform = `scale(${zoom})`;
                frame.style.MozTransformOrigin = "0 0";
            } else {
                frame.classList.remove('desktop-mode');
                btn.classList.remove('btn-toggle-active');
                btn.innerHTML = '<i class="fas fa-laptop"></i>';
                frame.style.zoom = "1";
                frame.style.MozTransform = "none";
                frame.style.width = "100%";
            }
        }
        
        function closePreview(fromBackButton = false) {
            const preview = document.getElementById('preview-overlay');
            const frame = document.getElementById('preview-frame');
            const btn = document.getElementById('desktop-toggle-btn');
            const zoomDisplay = document.getElementById('zoom-percent');
            if (preview.style.display === 'none') return;
            preview.style.display = 'none';
            isDesktopMode = false;
            frame.classList.remove('desktop-mode');
            frame.style.zoom = "1";
            frame.style.MozTransform = "none";
            frame.style.width = "100%";
            if (btn) {
                btn.classList.remove('btn-toggle-active');
                btn.innerHTML = '<i class="fas fa-laptop"></i>';
            }
            if (zoomDisplay) zoomDisplay.textContent = "100%";
            frame.srcdoc = "";
            if (!fromBackButton && window.history.state?.view === 'preview') window.history.back();
        }
        
        function toggleConsole() {
            const pane = document.getElementById('console-pane');
            pane.classList.toggle('collapsed');
            document.getElementById('console-toggle-icon').className = pane.classList.contains('collapsed') ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
        }
        
        function clearConsole() { document.getElementById('console-logs').innerHTML = ''; }
        
        /** * VIRTUAL FILE PATH RESOLUTION
         **/
        function findFileByPath(path, contextChildren = fsData.children) {
            let clean = path.replace(/^\.\//, '').replace(/^\//, '');
            const parts = clean.split('/');
            let current = contextChildren;
            let found = null;
            for (let i = 0; i < parts.length; i++) {
                const node = current.find(n => n.name === parts[i]);
                if (!node) return null;
                if (i === parts.length - 1) found = node;
                else if (node.type === 'folder') current = node.children;
                else return null;
            }
            return found;
        }
        
        /** * UTILITY HELPERS
         **/
        function findNode(list, id) {
            for (const n of list) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children, id); if (f) return f; } }
            return null;
        }
        
        function findAncestors(list, id, anc = []) {
            for (const n of list) { if (n.id === id) return anc; if (n.type === 'folder' && n.children) { const f = findAncestors(n.children, id, [...anc, n.id]); if (f) return f; } }
            return null;
        }
        
        function toggleFolder(id) {
            if (expandedFolders.has(id)) expandedFolders.delete(id);
            else expandedFolders.add(id);
            renderTree();
        }
        
        function expandToNode(id) {
            const anc = findAncestors(fsData.children, id);
            if (anc) {
                anc.forEach(i => expandedFolders.add(i));
                renderTree();
                setTimeout(() => { const el = document.querySelector('.active-file'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
            }
        }
        
        function updateStatusBar() {
            const pos = document.getElementById('cursor-pos');
            const chr = document.getElementById('char-count');
            const typ = document.getElementById('file-type');
            if (!currentFileId) {
                pos.textContent = "No File Open";
                chr.textContent = "0 chars";
                typ.textContent = "Plain Text";
                return;
            }
            const session = editor.getSession();
            const cur = editor.getCursorPosition();
            const val = session.getValue();
            pos.textContent = `Ln ${cur.row + 1}, Col ${cur.column + 1}`;
            chr.textContent = `${val.length} chars`;
            typ.textContent = session.getMode().$id.split('/').pop().toUpperCase();
        }
        
        function showStatusMsg(text, isErr = false) {
            const el = document.getElementById('status-msg');
            el.textContent = text;
            el.style.color = isErr ? "red" : "#fff";
            el.style.opacity = "1";
            setTimeout(() => {
                el.style.opacity = "0";
                setTimeout(() => { el.textContent = ""; }, 300);
            }, 3000);
        }
        
        /** * HIGH-CAPACITY ASYNC PERSISTENCE
         **/
        async function saveProjectData() {
            const data = { settings: store.settings, activeProjectId: store.activeProjectId, projects: store.projects, lastOpenTabs: openTabs, lastActiveFileId: currentFileId };
            try {
                await DB.set('ace_ide_pro_data', data);
                currentProject.lastModified = Date.now();
            }
            catch (e) {
                console.error("DB Error:", e);
                showStatusMsg("Critical Save Error!", true);
            }
        }
        
        function triggerAutoSave() {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(async () => { await saveProjectData(); }, 1000);
        }
        
        function switchTab(id) {
            document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(`tab-${id}`).classList.add('active');
            document.querySelectorAll('.sidebar-view').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${id}`).classList.add('active');
            if (id === 'projects') renderProjectList();
        }
        
        function toggleSidebar(open) {
            const sb = document.getElementById('sidebar');
            const ov = document.getElementById('sidebar-overlay');
            if (open) {
                sb.classList.add('open');
                ov.classList.add('active');
            }
            else {
                sb.classList.remove('open');
                ov.classList.remove('active');
            }
        }
        
        /** * GLOBAL LISTENERS
         **/
        window.addEventListener('popstate', (e) => { if (document.getElementById('preview-overlay').style.display === 'flex') closePreview(true); });
        
        window.addEventListener('message', e => {
            const d = e.data;
            if (d?.type === 'console') {
                const logs = document.getElementById('console-logs');
                const line = document.createElement('div');
                line.className = `log-item log-${d.method}`;
                line.textContent = `[${d.method.toUpperCase()}] ${d.message}`;
                logs.appendChild(line);
                logs.scrollTop = logs.scrollHeight;
            }
        });
        
        document.getElementById('tab-bar').addEventListener('contextmenu', e => {
            e.preventDefault();
            if (openTabs.length === 0) return;
            ctxMenu.innerHTML = '';
            const tab = e.target.closest('.tab');
            if (tab) {
                addCtxItem('Close Others', 'fa-minus-circle', () => closeOtherTabs(tab.dataset.id));
                addCtxSep();
            }
            addCtxItem('Close All Tabs', 'fa-times-circle', closeAllTabs);
            ctxMenu.style.display = 'block';
            const w = 150;
            const h = ctxMenu.offsetHeight || 100;
            let x = e.clientX;
            let y = e.clientY;
            if (x + w > window.innerWidth) x -= w;
            if (y + h > window.innerHeight) y -= h;
            ctxMenu.style.left = x + 'px';
            ctxMenu.style.top = y + 'px';
        });
        
        init();
    
