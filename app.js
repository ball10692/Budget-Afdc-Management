// app.js - Core application logic and state management

const STORAGE_KEY_PROJECTS = 'budget_system_projects';
const STORAGE_KEY_TRANSACTIONS = 'budget_system_transactions';
const STORAGE_KEY_SETTINGS = 'budgetApp_settings';
const STORAGE_KEY_USERS = 'budgetApp_users';
const STORAGE_KEY_SESSION = 'budgetApp_session';

const GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbx7IdE64RSmc0Il8TG_OloNzrt9uXGF7aOBfpSwgn_M0dU6HWxHbeee56hkxUYNb1RZ6A/exec";

// Application State
let projects = [];
let transactions = [];
let systemSettings = {};
let currentUser = null;
let systemUsers = []; // Cache for users since it is async now

// Loading UI Helper
function showLoading(show = true) {
    let loader = document.getElementById('globalApiLoader');
    if (!loader && show) {
        loader = document.createElement('div');
        loader.id = 'globalApiLoader';
        loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;';
        loader.innerHTML = '<div style="width:50px;height:50px;border:5px solid #ccc;border-top-color:var(--primary-color);border-radius:50%;animation:spin 1s linear infinite;"></div><div style="margin-top:10px;font-weight:bold;color:var(--text-main);">กำลังประมวลผลข้อมูล...</div><style>@keyframes spin{to{transform:rotate(360deg);}}</style>';
        document.body.appendChild(loader);
    }
    if (loader) {
        loader.style.display = show ? 'flex' : 'none';
    }
}

// Global API Fetch wrapper
async function apiCall(action, payload = {}) {
    showLoading(true);
    try {
        if (!GOOGLE_API_URL || GOOGLE_API_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE") {
            alert("Error: GOOGLE_API_URL is not set. Please deploy Apps Script and update app.js");
            return { success: false, error: "Missing API URL" };
        }

        const response = await fetch(GOOGLE_API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain to avoid CORS preflight issues with GAS
            body: JSON.stringify({ action, ...payload })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("API call failed:", error);
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล");
        return { success: false, error: error.toString() };
    } finally {
        showLoading(false);
    }
}

// =============================================
// AUTHENTICATION & USER MANAGEMENT
// =============================================

const ROLES = {
    ADMIN: 'admin',
    SUPERUSER: 'superuser',
    USER: 'user'
};

// Role-based page access map
const PAGE_ACCESS = {
    'index.html': [ROLES.ADMIN, ROLES.SUPERUSER, ROLES.USER],
    'project-entry.html': [ROLES.ADMIN, ROLES.SUPERUSER, ROLES.USER],
    'budget-management.html': [ROLES.ADMIN, ROLES.SUPERUSER, ROLES.USER],
    'budget-adjustment.html': [ROLES.ADMIN, ROLES.SUPERUSER, ROLES.USER],
    'budget-transfer.html': [ROLES.ADMIN, ROLES.SUPERUSER, ROLES.USER],
    'report.html': [ROLES.ADMIN, ROLES.SUPERUSER, ROLES.USER],
    'system-settings.html': [ROLES.ADMIN, ROLES.SUPERUSER],
    'user-management.html': [ROLES.ADMIN]
};

async function initUsers() {
    // If we already fetched them during initData, use the cache
    if (systemUsers.length > 0) return systemUsers;

    // Seed default admin in cache temporarily; actual init is in initData
    systemUsers = [
        {
            id: 'admin',
            username: 'admin',
            password: 'admin',
            displayName: 'ผู้ดูแลระบบ',
            role: ROLES.ADMIN,
            createdAt: new Date().toISOString()
        }
    ];
    return systemUsers;
}

function getUsers() {
    return systemUsers;
}

async function saveUsers(usersArray) {
    systemUsers = usersArray;
    await apiCall('saveUsers', { users: usersArray });
}

function loginUser(username, password) {
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        const session = { userId: user.id, username: user.username, role: user.role, displayName: user.displayName };
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
        currentUser = session;
        return { success: true, user: session };
    }
    return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function logoutUser() {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    currentUser = null;
    window.location.href = 'login.html';
}

function getCurrentSession() {
    const saved = localStorage.getItem(STORAGE_KEY_SESSION);
    if (saved) {
        currentUser = JSON.parse(saved);
        return currentUser;
    }
    return null;
}

function checkAuth() {
    const session = getCurrentSession();
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Always allow login page
    if (currentPage === 'login.html') {
        if (session) window.location.href = 'index.html'; // Already logged in
        return;
    }

    // Not logged in → redirect to login
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // Check page access
    const allowedRoles = PAGE_ACCESS[currentPage];
    if (allowedRoles && !allowedRoles.includes(session.role)) {
        alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        window.location.href = 'index.html';
        return;
    }
}

function hasAccess(page) {
    if (!currentUser) return false;
    const allowedRoles = PAGE_ACCESS[page];
    return allowedRoles ? allowedRoles.includes(currentUser.role) : true;
}

// User CRUD (admin only)
async function addUser(userData) {
    const users = getUsers();
    if (users.find(u => u.username === userData.username)) {
        return { success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
    }
    const newUser = {
        id: generateId(),
        username: userData.username,
        password: userData.password,
        displayName: userData.displayName || userData.username,
        role: userData.role || ROLES.USER,
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    await saveUsers(users);
    return { success: true, user: newUser };
}

async function updateUser(userId, updates) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { success: false, message: 'ไม่พบผู้ใช้' };

    // Prevent changing admin's own role
    if (userId === 'admin_default' && updates.role && updates.role !== ROLES.ADMIN) {
        return { success: false, message: 'ไม่สามารถเปลี่ยนสิทธิ์ผู้ดูแลระบบหลักได้' };
    }

    // Check username uniqueness if changed
    if (updates.username && updates.username !== users[idx].username) {
        if (users.find(u => u.username === updates.username)) {
            return { success: false, message: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };
        }
    }

    users[idx] = { ...users[idx], ...updates };
    await saveUsers(users);
    return { success: true };
}

async function deleteUser(userId) {
    if (userId === 'admin_default') {
        return { success: false, message: 'ไม่สามารถลบผู้ดูแลระบบหลักได้' };
    }
    let users = getUsers();
    users = users.filter(u => u.id !== userId);
    await saveUsers(users);
    return { success: true };
}

function getRoleBadge(role) {
    const labels = {
        admin: { text: 'Admin', class: 'badge-danger' },
        superuser: { text: 'Superuser', class: 'badge-warning' },
        user: { text: 'User', class: 'badge-primary' }
    };
    const r = labels[role] || labels.user;
    return `<span class="badge ${r.class}">${r.text}</span>`;
}

// Render sidebar with role-based visibility
function renderSidebar() {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && !hasAccess(href)) {
            link.style.display = 'none';
        }
    });

    // Update header user display
    const headerUser = document.querySelector('.header-user');
    if (headerUser && currentUser) {
        headerUser.innerHTML = `
            <div class="user-details">
                <span class="user-name">${currentUser.displayName}</span>
                <span class="user-role-container">${getRoleBadge(currentUser.role)}</span>
            </div>
            <div class="avatar">
                ${currentUser.displayName.charAt(0).toUpperCase()}
            </div>
            <div class="header-divider"></div>
            <button onclick="logoutUser()" class="btn-logout" title="ออกจากระบบ">
                <i class="fa-solid fa-right-from-bracket"></i>
            </button>
        `;
    }

    // Always ensure mobile menu is initialized
    initMobileMenu();
}

/**
 * Mobile Menu Toggle Logic
 */
function initMobileMenu() {
    // Add overlay if missing
    if (!document.querySelector('.sidebar-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', toggleSidebar);
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');

        // Prevent body scroll when menu is open
        if (sidebar.classList.contains('open')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
}

// --- Dynamic Settings CRUD ---

// Regions
async function addRegion(regionName) {
    if (!systemSettings.regions.includes(regionName)) {
        systemSettings.regions.push(regionName);
        systemSettings.units[regionName] = [];
        await saveSettings();
        return true;
    }
    return false;
}
async function deleteRegion(regionName) {
    systemSettings.regions = systemSettings.regions.filter(r => r !== regionName);
    delete systemSettings.units[regionName];
    await saveSettings();
}

// Units
async function addUnit(regionName, unitName) {
    if (systemSettings.units[regionName] && !systemSettings.units[regionName].includes(unitName)) {
        systemSettings.units[regionName].push(unitName);
        await saveSettings();
        return true;
    }
    return false;
}
async function deleteUnit(regionName, unitName) {
    if (systemSettings.units[regionName]) {
        systemSettings.units[regionName] = systemSettings.units[regionName].filter(u => u !== unitName);
        await saveSettings();
    }
}

// Project Types
async function addProjectType(code, name) {
    if (!systemSettings.projectTypes.find(p => p.code === code)) {
        systemSettings.projectTypes.push({ code, name });
        systemSettings.subItems[code] = [];
        await saveSettings();
        return true;
    }
    return false;
}
async function deleteProjectType(code) {
    systemSettings.projectTypes = systemSettings.projectTypes.filter(p => p.code !== code);
    delete systemSettings.subItems[code];
    await saveSettings();
}

// Sub-items
async function addSubItem(typeCode, subItemName) {
    if (systemSettings.subItems[typeCode] && !systemSettings.subItems[typeCode].includes(subItemName)) {
        systemSettings.subItems[typeCode].push(subItemName);
        await saveSettings();
        return true;
    }
    return false;
}
async function deleteSubItem(typeCode, subItemName) {
    if (systemSettings.subItems[typeCode]) {
        systemSettings.subItems[typeCode] = systemSettings.subItems[typeCode].filter(s => s !== subItemName);
        await saveSettings();
    }
}

// === Rename / Update Functions ===

async function renameRegion(oldName, newName) {
    const idx = systemSettings.regions.indexOf(oldName);
    if (idx === -1) return false;
    if (systemSettings.regions.includes(newName)) return false;
    systemSettings.regions[idx] = newName;
    // Move units to new key
    if (systemSettings.units[oldName]) {
        systemSettings.units[newName] = systemSettings.units[oldName];
        delete systemSettings.units[oldName];
    }
    // Update existing projects
    projects.forEach(p => { if (p.region === oldName) p.region = newName; });
    await saveSettings();
    await saveData();
    return true;
}

async function renameUnit(regionName, oldUnit, newUnit) {
    if (!systemSettings.units[regionName]) return false;
    const idx = systemSettings.units[regionName].indexOf(oldUnit);
    if (idx === -1) return false;
    if (systemSettings.units[regionName].includes(newUnit)) return false;
    systemSettings.units[regionName][idx] = newUnit;
    // Update existing projects
    projects.forEach(p => { if (p.region === regionName && p.unit === oldUnit) p.unit = newUnit; });
    await saveSettings();
    await saveData();
    return true;
}

async function renameProjectType(code, newName) {
    const pt = systemSettings.projectTypes.find(t => t.code === code);
    if (!pt) return false;
    pt.name = newName;
    await saveSettings();
    return true;
}

async function renameSubItem(typeCode, oldName, newName) {
    if (!systemSettings.subItems[typeCode]) return false;
    const idx = systemSettings.subItems[typeCode].indexOf(oldName);
    if (idx === -1) return false;
    if (systemSettings.subItems[typeCode].includes(newName)) return false;
    systemSettings.subItems[typeCode][idx] = newName;
    // Update existing projects
    projects.forEach(p => { if (p.projectType === typeCode && p.subItem === oldName) p.subItem = newName; });
    await saveSettings();
    await saveData();
    return true;
}

// === Reorder Functions ===

async function moveRegion(index, direction) {
    const list = systemSettings.regions;
    if (index < 0 || index >= list.length) return false;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return false;
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    await saveSettings();
    return true;
}

async function moveUnit(regionName, index, direction) {
    const list = systemSettings.units[regionName];
    if (!list || index < 0 || index >= list.length) return false;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return false;
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    await saveSettings();
    return true;
}

async function moveProjectType(index, direction) {
    const list = systemSettings.projectTypes;
    if (index < 0 || index >= list.length) return false;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return false;
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    await saveSettings();
    return true;
}

async function moveSubItem(typeCode, index, direction) {
    const list = systemSettings.subItems[typeCode];
    if (!list || index < 0 || index >= list.length) return false;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return false;
    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;
    await saveSettings();
    return true;
}

// === Branding & Appearance ===
function applyBranding() {
    if (!systemSettings || !systemSettings.branding) return;

    // Apply Theme
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
    if (systemSettings.branding.theme && systemSettings.branding.theme !== 'indigo') {
        document.body.classList.add('theme-' + systemSettings.branding.theme);
    }

    // Apply Icon
    if (systemSettings.branding.iconUrl) {
        // Update sidebar icon
        const sidebarBrandIcon = document.querySelector('.sidebar-brand i');
        if (sidebarBrandIcon) {
            sidebarBrandIcon.outerHTML = `<img src="${systemSettings.branding.iconUrl}" style="height: 32px; width: auto; max-width: 40px; margin-right: 12px; border-radius: 4px; object-fit: contain;">`;
        } else {
            const sidebarBrandImg = document.querySelector('.sidebar-brand img');
            if (sidebarBrandImg) sidebarBrandImg.src = systemSettings.branding.iconUrl;
        }

        // Update login icon
        const loginIcon = document.querySelector('.login-brand .icon i');
        if (loginIcon) {
            loginIcon.outerHTML = `<img src="${systemSettings.branding.iconUrl}" style="height: 48px; width: auto; max-width: 100%; border-radius: 8px; object-fit: contain;">`;
        } else {
            const loginBrandImg = document.querySelector('.login-brand .icon img');
            if (loginBrandImg) loginBrandImg.src = systemSettings.branding.iconUrl;
        }
    } else {
        // Revert to font-awesome if iconUrl is null and it's currently an img
        const sidebarBrandImg = document.querySelector('.sidebar-brand img');
        if (sidebarBrandImg) {
            sidebarBrandImg.outerHTML = `<i class="fa-solid fa-wallet" style="margin-right: 12px;"></i>`;
        }
        const loginBrandImg = document.querySelector('.login-brand .icon img');
        if (loginBrandImg) {
            loginBrandImg.outerHTML = `<i class="fa-solid fa-wallet"></i>`;
        }
    }
}

async function updateBranding(theme, iconUrl) {
    if (!systemSettings.branding) {
        systemSettings.branding = { theme: 'indigo', iconUrl: null };
    }
    if (theme !== undefined) systemSettings.branding.theme = theme;
    if (iconUrl !== undefined) systemSettings.branding.iconUrl = iconUrl;
    await saveSettings();
    applyBranding();
}

// Data Management
async function initData() {
    const response = await apiCall('initData');
    if (response && response.success && response.data) {
        projects = response.data.projects || [];
        transactions = response.data.transactions || [];
        systemUsers = response.data.users || [];

        if (response.data.systemSettings) {
            systemSettings = response.data.systemSettings;
            let dirty = false;

            // Initialize Branding if empty
            if (!systemSettings.branding) {
                systemSettings.branding = { theme: 'indigo', iconUrl: null };
                dirty = true;
            }

            if (dirty) await saveSettings();
        } else {
            // Setup defaults if Google Sheet is completely fresh
            systemSettings = {
                regions: ['สนภ.1 นทพ.', 'สนภ.2 นทพ.', 'สนภ.3 นทพ.', 'สนภ.4 นทพ.', 'สนภ.5 นทพ.', 'ส่วนกลาง'],
                units: {
                    'สนภ.1 นทพ.': ['นพค.11', 'นพค.12', 'นพค.13', 'นพค.14', 'นพค.15', 'นพค.16'],
                    'สนภ.2 นทพ.': ['นพค.21', 'นพค.22', 'นพค.23', 'นพค.24', 'นพค.25', 'นพค.26'],
                    'สนภ.3 นทพ.': ['นพค.31', 'นพค.32', 'นพค.33', 'นพค.34', 'นพค.35', 'นพค.36'],
                    'สนภ.4 นทพ.': ['นพค.41', 'นพค.42', 'นพค.43', 'นพค.44', 'นพค.45', 'นพค.46'],
                    'สนภ.5 นทพ.': ['นพค.51', 'นพค.52', 'นพค.53', 'นพค.54', 'นพค.55', 'นพค.56'],
                    'ส่วนกลาง': ['ส่วนกลาง นทพ.']
                },
                projectTypes: [
                    { code: '01', name: 'งานก่อสร้างเส้นทางคมนาคม' },
                    { code: '02', name: 'งานจัดหาน้ำกินน้ำใช้' },
                    { code: '03', name: 'งานพัฒนาและช่วยเหลือประชาชน' },
                    { code: '04', name: 'งานเกษตรผสมผสาน' }
                ],
                subItems: {
                    '01': [],
                    '02': [],
                    '03': [],
                    '04': []
                },
                branding: { theme: 'indigo', iconUrl: null }
            };
            await saveSettings();
        }
    } else {
        alert("ไม่สามารถดึงข้อมูลบรรทัดแรกเริ่มจากฐานข้อมูลได้ กรุณาตรวจสอบ URL");
    }
}

async function saveData() {
    await apiCall('saveData', { projects, transactions });
}

async function saveSettings() {
    await apiCall('saveSettings', { settings: systemSettings });
}

async function addProject(projectData) {
    projectData.id = generateId();
    projectData.createdAt = new Date().toISOString();
    projectData.remainingBudget = parseFloat(projectData.budgetAmount);

    projects.push(projectData);
    await saveData();
    return projectData.id;
}

async function updateProjectMetadata(projectId, updatedData) {
    const projectIndex = projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1) return false;

    const oldProject = projects[projectIndex];

    // Calculate new remaining budget if budgetAmount changed
    if (updatedData.budgetAmount !== undefined) {
        const oldBudget = parseFloat(oldProject.budgetAmount);
        const newBudget = parseFloat(updatedData.budgetAmount);
        const diff = newBudget - oldBudget;
        updatedData.remainingBudget = oldProject.remainingBudget + diff;
    }

    // Merge updates
    projects[projectIndex] = { ...oldProject, ...updatedData };
    await saveData();
    return true;
}

function getProject(id) {
    return projects.find(p => p.id === id);
}

async function updateProjectDetails(id, updatedData) {
    const projectIndex = projects.findIndex(p => p.id === id);
    if (projectIndex === -1) return false;

    // Merge new data while keeping id, createdAt, etc.
    // Note: We don't recalculate remainingBudget here automatically based on original budgetAmount vs new budgetAmount unless requested, 
    // but typically adjustment might change base budget. For now, just update the fields.
    // However, if budgetAmount changes, we should adjust remainingBudget by the difference.
    const originalBudget = parseFloat(projects[projectIndex].budgetAmount) || 0;
    const newBudget = parseFloat(updatedData.budgetAmount) || 0;
    const diff = newBudget - originalBudget;

    projects[projectIndex] = {
        ...projects[projectIndex],
        ...updatedData,
        remainingBudget: (projects[projectIndex].remainingBudget || 0) + diff
    };

    await saveData();
    return true;
}

// Budget specific logic
async function updateProjectBudget(projectId, amount, type, description, month) {
    // type: 'request' (ขอใช้), 'bind' (ผูกพัน), 'disburse' (เบิกจ่าย), 'transfer_out', 'transfer_in', 'return'
    const project = getProject(projectId);
    if (!project) return false;

    const parsedAmount = parseFloat(amount);

    // Check if we have enough budget for reductions
    if (['request', 'bind', 'disburse', 'transfer_out', 'return'].includes(type)) {
        if (project.remainingBudget < parsedAmount) {
            alert('งบประมาณคงเหลือไม่เพียงพอ (Insufficient budget)');
            return false;
        }
        project.remainingBudget -= parsedAmount;
    } else if (type === 'transfer_in') {
        project.remainingBudget += parsedAmount;
    }

    const transaction = {
        id: generateId(),
        projectId: projectId,
        type: type,
        amount: parsedAmount,
        description: description || '',
        month: month || (new Date().getMonth() + 1).toString(), // fallback current month 1-12
        timestamp: new Date().toISOString()
    };

    transactions.push(transaction);
    await saveData();
    return true;
}

// Data formatters and utilities
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getQuarterFromMonth(monthStr) {
    const m = parseInt(monthStr, 10);
    // รัฐบาลไทย ไตรมาส 1 เริ่ม ต.ค. (10, 11, 12)
    if (m >= 10 && m <= 12) return 'Q1';
    if (m >= 1 && m <= 3) return 'Q2';
    if (m >= 4 && m <= 6) return 'Q3';
    if (m >= 7 && m <= 9) return 'Q4';
    return 'Unknown';
}

// =============================================
// MASTER DATA LOOKUP HELPERS (systemSettings source of truth)
// =============================================

// Alias for backward compatibility
function getProjectTypes() { return systemSettings.projectTypes || []; }

// Lookup project type name by code
function getProjectTypeName(code) {
    const pt = systemSettings.projectTypes.find(t => t.code === code);
    return pt ? pt.name : code;
}

// Lookup full project type by code
function getProjectTypeByCode(code) {
    return systemSettings.projectTypes.find(t => t.code === code) || null;
}

// Validate a region exists
function isValidRegion(regionName) {
    return systemSettings.regions.includes(regionName);
}

// Validate a unit exists under a region
function isValidUnit(regionName, unitName) {
    return systemSettings.units[regionName] && systemSettings.units[regionName].includes(unitName);
}

// Validate a project type code exists
function isValidProjectType(code) {
    return systemSettings.projectTypes.some(t => t.code === code);
}

// Validate a sub-item exists under a project type code
function isValidSubItem(typeCode, subItemName) {
    return systemSettings.subItems[typeCode] && systemSettings.subItems[typeCode].includes(subItemName);
}

// Full project validation against master data
function validateProjectData(data) {
    const errors = [];
    if (!isValidRegion(data.region)) errors.push(`สำนักงานภาค "${data.region}" ไม่มีในระบบ`);
    if (!isValidUnit(data.region, data.unit)) errors.push(`หน่วย "${data.unit}" ไม่มีภายใต้ภาค "${data.region}"`);
    if (!isValidProjectType(data.projectType)) errors.push(`ประเภทโครงการรหัส "${data.projectType}" ไม่มีในระบบ`);
    if (data.subItem && !isValidSubItem(data.projectType, data.subItem)) errors.push(`รายการย่อย "${data.subItem}" ไม่มีภายใต้ประเภทโครงการ "${data.projectType}"`);
    return errors;
}

// Backward compatibility alias
const PROJECT_TYPES = { find: (fn) => (systemSettings.projectTypes || []).find(fn) };

const BUDGET_TYPES = ['งบหลัก', 'งบเสริม', 'งบ กกล.', 'งบ รร.ตชด.'];
const QUARTERS = ['ไตรมาส 1', 'ไตรมาส 2', 'ไตรมาส 3', 'ไตรมาส 4'];

// Form validation UI Helpers
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.add('error');
        // Add logic to display error text below element
    }
}

// Initialize Application
async function initApp() {
    await initData();
    applyBranding();

    // Auth check (redirects if not logged in or no access)
    checkAuth();

    // Execute page-specific logic
    if (typeof pageInit === 'function') {
        pageInit();
    }

    // Render role-based sidebar
    renderSidebar();
}

document.addEventListener('DOMContentLoaded', initApp);
