/**
 * TaskFlow - Premium Job Manager
 * Core Application Logic
 */

// --- State Management ---
const AppState = {
    jobs: [],
    view: 'dashboard', // dashboard, kanban, list
    filter: '',
    darkMode: true
};

// --- IndexedDB Wrapper ---
const DB_NAME = 'TaskFlowDB';
const DB_VERSION = 1;
const STORE_NAME = 'jobs';

const db = {
    instance: null,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('dueDate', 'dueDate', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this.instance = e.target.result;
                resolve(this.instance);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    },

    getAllJobs() {
        return new Promise((resolve, reject) => {
            const tx = this.instance.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    addJob(job) {
        return new Promise((resolve, reject) => {
            const tx = this.instance.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(job); // put handles both add and update

            request.onsuccess = () => resolve(job);
            request.onerror = () => reject(request.error);
        });
    },

    deleteJob(id) {
        return new Promise((resolve, reject) => {
            const tx = this.instance.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// --- DOM Elements ---
const views = {
    dashboard: document.getElementById('view-dashboard'),
    kanban: document.getElementById('view-kanban'),
    list: document.getElementById('view-list')
};
const navLinks = document.querySelectorAll('.nav-links li');
const modalOverlay = document.getElementById('job-modal');
const jobForm = document.getElementById('job-form');
const btnAddJob = document.getElementById('btn-add-job');
const btnCloseModal = document.querySelectorAll('.close-modal');
const themeToggle = document.getElementById('theme-toggle');
const searchInput = document.getElementById('global-search');

// --- Initialization ---
async function initApp() {
    try {
        await db.init();
        await loadJobs();
        setupEventListeners();
        renderCurrentView();
        updateStats();
    } catch (err) {
        console.error('Failed to initialize app:', err);
        alert('Database error. Please use a modern browser.');
    }
}

async function loadJobs() {
    AppState.jobs = await db.getAllJobs();
    // Sort by due date (closest first)
    AppState.jobs.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
}

function setupEventListeners() {
    // Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const viewName = link.getAttribute('data-view');
            AppState.view = viewName;
            
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            views[viewName].classList.add('active');
            
            document.getElementById('page-header').textContent = 
                viewName.charAt(0).toUpperCase() + viewName.slice(1);
            
            renderCurrentView();
        });
    });

    // Modal
    btnAddJob.addEventListener('click', () => openModal());
    btnCloseModal.forEach(btn => btn.addEventListener('click', closeModal));
    
    // Form Submit
    jobForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSaveJob();
    });

    // Theme Toggle
    themeToggle.addEventListener('click', () => {
        AppState.darkMode = !AppState.darkMode;
        document.body.classList.toggle('light-mode', !AppState.darkMode);
        themeToggle.querySelector('i').className = AppState.darkMode ? 'ph ph-moon' : 'ph ph-sun';
    });

    // Search
    searchInput.addEventListener('input', (e) => {
        AppState.filter = e.target.value.toLowerCase();
        renderCurrentView();
    });

    // Drag and Drop (Kanban)
    setupDragAndDrop();
}

// --- Rendering Logic ---

function renderCurrentView() {
    const filteredJobs = AppState.jobs.filter(job => {
        const query = AppState.filter;
        if (!query) return true;
        return job.title.toLowerCase().includes(query) || 
               job.tags.some(t => t.toLowerCase().includes(query));
    });

    if (AppState.view === 'dashboard') {
        renderRecentActivity(filteredJobs);
    } else if (AppState.view === 'kanban') {
        renderKanban(filteredJobs);
    } else if (AppState.view === 'list') {
        renderList(filteredJobs);
    }
    
    updateStats();
}

function renderKanban(jobs) {
    const columns = {
        todo: document.getElementById('col-todo'),
        'in-progress': document.getElementById('col-in-progress'),
        review: document.getElementById('col-review'),
        done: document.getElementById('col-done')
    };

    // Clear columns
    Object.values(columns).forEach(col => col.innerHTML = '');

    // Reset counts
    const counts = { todo: 0, 'in-progress': 0, review: 0, done: 0 };

    jobs.forEach(job => {
        if (columns[job.status]) {
            const card = createJobCard(job);
            columns[job.status].appendChild(card);
            counts[job.status]++;
        }
    });

    // Update counts UI
    document.getElementById('count-todo').textContent = counts.todo;
    document.getElementById('count-progress').textContent = counts['in-progress'];
    document.getElementById('count-review').textContent = counts.review;
    document.getElementById('count-done').textContent = counts.done;
}

function createJobCard(job) {
    const el = document.createElement('div');
    el.className = 'job-card';
    el.setAttribute('draggable', 'true');
    el.setAttribute('data-id', job.id);
    
    // Format Date
    const date = new Date(job.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    
    // Tags HTML
    const tagsHtml = job.tags.map(tag => `<span class="tag">${tag}</span>`).join('');

    el.innerHTML = `
        <div class="card-header">
            <span class="badge ${job.priority}">${job.priority}</span>
            <button class="icon-btn btn-delete" data-id="${job.id}"><i class="ph ph-trash"></i></button>
        </div>
        <div class="card-title">${job.title}</div>
        <div class="tags">${tagsHtml}</div>
        <div class="card-footer">
            <span><i class="ph ph-calendar-blank"></i> ${date}</span>
        </div>
    `;

    // Edit Event
    el.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-delete')) {
            openModal(job);
        }
    });

    // Delete Event
    el.querySelector('.btn-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if(confirm('Delete this job?')) {
            await db.deleteJob(job.id);
            await loadJobs();
            renderCurrentView();
        }
    });

    // Drag Events
    el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', job.id);
        el.classList.add('dragging');
    });

    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
    });

    return el;
}

function renderList(jobs) {
    const tbody = document.getElementById('job-table-body');
    tbody.innerHTML = '';

    jobs.forEach(job => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${job.title}</strong></td>
            <td><span class="badge badge-${job.status}">${job.status}</span></td>
            <td><span class="badge ${job.priority}">${job.priority}</span></td>
            <td>${job.dueDate}</td>
            <td>
                <button class="icon-btn btn-edit-list" data-id="${job.id}"><i class="ph ph-pencil-simple"></i></button>
            </td>
        `;
        
        tr.querySelector('.btn-edit-list').addEventListener('click', () => openModal(job));
        tbody.appendChild(tr);
    });
}

function renderRecentActivity(jobs) {
    const list = document.getElementById('recent-list');
    list.innerHTML = '';
    
    if (jobs.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="ph ph-ghost"></i><p>No jobs found.</p></div>';
        return;
    }

    // Show top 5
    jobs.slice(0, 5).forEach(job => {
        const item = document.createElement('div');
        item.style.padding = '1rem';
        item.style.borderBottom = '1px solid var(--border-color)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        
        item.innerHTML = `
            <div>
                <div style="font-weight: 600;">${job.title}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">Due ${job.dueDate}</div>
            </div>
            <span class="badge ${job.priority}">${job.status}</span>
        `;
        list.appendChild(item);
    });
}

function updateStats() {
    const total = AppState.jobs.length;
    const active = AppState.jobs.filter(j => j.status === 'in-progress').length;
    const completed = AppState.jobs.filter(j => j.status === 'done').length;
    const pending = AppState.jobs.filter(j => j.status === 'todo' || j.status === 'review').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-pending').textContent = pending;
}

// --- Drag & Drop Logic ---
function setupDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-column');

    columns.forEach(col => {
        col.addEventListener('dragover', (e) => {
            e.preventDefault(); // Allow drop
            col.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        });

        col.addEventListener('dragleave', () => {
            col.style.backgroundColor = '';
        });

        col.addEventListener('drop', async (e) => {
            e.preventDefault();
            col.style.backgroundColor = '';
            
            const jobId = e.dataTransfer.getData('text/plain');
            const newStatus = col.getAttribute('data-status');
            
            const jobIndex = AppState.jobs.findIndex(j => j.id === jobId);
            if (jobIndex > -1 && AppState.jobs[jobIndex].status !== newStatus) {
                AppState.jobs[jobIndex].status = newStatus;
                await db.addJob(AppState.jobs[jobIndex]); // Save new status
                renderCurrentView();
            }
        });
    });
}

// --- Modal & Form Logic ---
function openModal(job = null) {
    modalOverlay.classList.remove('hidden');
    // Force reflow for transition
    void modalOverlay.offsetWidth;
    modalOverlay.classList.add('open');

    if (job) {
        document.getElementById('modal-title').textContent = 'Edit Job';
        document.getElementById('job-id').value = job.id;
        document.getElementById('job-title').value = job.title;
        document.getElementById('job-desc').value = job.desc || '';
        document.getElementById('job-status').value = job.status;
        document.getElementById('job-priority').value = job.priority;
        document.getElementById('job-date').value = job.dueDate;
        document.getElementById('job-tags').value = job.tags.join(', ');
    } else {
        document.getElementById('modal-title').textContent = 'Create New Job';
        jobForm.reset();
        document.getElementById('job-id').value = '';
        document.getElementById('job-date').valueAsDate = new Date();
    }
}

function closeModal() {
    modalOverlay.classList.remove('open');
    setTimeout(() => {
        modalOverlay.classList.add('hidden');
    }, 200);
}

async function handleSaveJob() {
    const id = document.getElementById('job-id').value || crypto.randomUUID();
    const title = document.getElementById('job-title').value;
    const desc = document.getElementById('job-desc').value;
    const status = document.getElementById('job-status').value;
    const priority = document.getElementById('job-priority').value;
    const dueDate = document.getElementById('job-date').value;
    const tagsInput = document.getElementById('job-tags').value;
    
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);

    const job = {
        id,
        title,
        desc,
        status,
        priority,
        dueDate,
        tags,
        updatedAt: new Date().toISOString()
    };

    await db.addJob(job);
    await loadJobs(); // Reload to refresh sort/filter
    renderCurrentView();
    closeModal();
}

// Start
initApp();
