/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - MAIN APPLICATION JS
   ========================================================================== */

const API_BASE = (window.location.protocol === 'http:' || window.location.protocol === 'https:') && !window.location.hostname.includes('github.io') && window.location.port === '8000'
    ? `${window.location.origin}/api`
    : 'http://127.0.0.1:8000/api';

// --- STATE MANAGEMENT ---
const state = {
    currentUser: JSON.parse(localStorage.getItem('lib_user')) || null,
    activeTab: 'books',
    viewMode: 'grid', // 'grid' or 'table'
    books: [],
    categories: [],
    readers: [],
    loans: [],
    reservations: [],
    users: [],
    charts: {
        topBooks: null,
        category: null
    }
};

// --- DOM INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    try {
        await loadCategories();
    } catch (err) {
        console.warn("Backend server not reached during initialization:", err.message);
    }
    checkAuthState();
}

// --- MANDATORY LOGIN GATE & AUTH CHECK ---
function checkAuthState() {
    const loginOverlay = document.getElementById('loginOverlay');
    const appContainer = document.getElementById('app');

    if (!state.currentUser) {
        // Show Full Screen Login Gate
        loginOverlay.classList.remove('hidden');
        appContainer.classList.add('hidden');
    } else {
        // User logged in -> Hide login gate & Show App
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');

        updateUserUI();
        applyRoleAccess();
        
        // Select initial tab based on role
        if (state.currentUser.role === 'reader') {
            switchTab('books');
        } else {
            switchTab('dashboard');
        }
    }
}

function applyRoleAccess() {
    const role = state.currentUser ? state.currentUser.role : 'guest';

    // Update Book Nav Label
    const bookNavLabel = document.getElementById('bookNavLabel');
    if (bookNavLabel) {
        bookNavLabel.textContent = (role === 'reader') ? 'Tra cứu Sách' : 'Tra cứu & Quản lý Sách';
    }

    // Hide/Show navigation links and UI components based on role
    document.querySelectorAll('.role-staff-only').forEach(el => {
        el.style.display = (role === 'admin' || role === 'librarian') ? 'flex' : 'none';
    });

    document.querySelectorAll('.role-admin-only').forEach(el => {
        el.style.display = (role === 'admin') ? 'flex' : 'none';
    });

    document.querySelectorAll('.role-reader-only').forEach(el => {
        el.style.display = (role === 'reader') ? 'flex' : 'none';
    });

    document.querySelectorAll('.role-librarian-only').forEach(el => {
        el.style.display = (role === 'admin' || role === 'librarian') ? 'inline-flex' : 'none';
    });
}

function handleLogout() {
    localStorage.removeItem('lib_user');
    state.currentUser = null;
    showToast('Đã đăng xuất tài khoản thành công', 'info');
    
    // Reset overlay form inputs
    document.getElementById('overlayUsername').value = '';
    document.getElementById('overlayPassword').value = '';
    
    checkAuthState();
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('overlayUsername').value.trim();
    const password = document.getElementById('overlayPassword').value.trim();

    if (!username || !password) {
        showToast('Vui lòng nhập tên đăng nhập và mật khẩu', 'warning');
        return;
    }

    try {
        const res = await fetchAPI('/auth/login', 'POST', { username, password });
        state.currentUser = res.user;
        localStorage.setItem('lib_user', JSON.stringify(res.user));
        showToast(`Xin chào ${res.user.full_name} (${res.user.role.toUpperCase()})!`, 'success');
        checkAuthState();
    } catch (err) {
        // Fallback for Demo / Static Mode (e.g. GitHub Pages or when Python backend is down)
        const demoUsers = {
            'admin': { id: 1, username: 'admin', role: 'admin', full_name: 'Quản trị viên Hệ thống', email: 'admin@library.edu.vn' },
            'thuthu1': { id: 2, username: 'thuthu1', role: 'librarian', full_name: 'Thủ thư Nguyễn Thị Mai', email: 'mai.thuthu@library.edu.vn' },
            'docgia1': { id: 3, username: 'docgia1', role: 'reader', full_name: 'Nguyễn Văn An', email: 'an.nguyen@email.com', reader_id: 1 }
        };
        const demoPasswords = {
            'admin': 'admin123',
            'thuthu1': '123456',
            'docgia1': '123456'
        };

        if (demoUsers[username] && demoPasswords[username] === password) {
            state.currentUser = demoUsers[username];
            localStorage.setItem('lib_user', JSON.stringify(state.currentUser));
            showToast(`[Demo Mode] Xin chào ${state.currentUser.full_name} (${state.currentUser.role.toUpperCase()})!`, 'success');
            checkAuthState();
        } else if (demoUsers[username]) {
            showToast('Mật khẩu không chính xác!', 'error');
        } else {
            showToast(`Không tìm thấy tài khoản '${username}'. Chọn Admin / Thủ thư / Độc giả bên dưới để thử nghiệm!`, 'warning');
        }
    }
}

// --- MOCK DATA FOR STATIC HOSTING / DEMO MODE ---
function getMockData(endpoint, method = 'GET', data = null) {
    // Auth Login
    if (endpoint === '/auth/login' && method === 'POST') {
        const username = (data && data.username) ? data.username.trim() : '';
        const password = (data && data.password) ? data.password.trim() : '';
        const demoUsers = {
            'admin': { id: 1, username: 'admin', role: 'admin', full_name: 'Quản trị viên Hệ thống', email: 'admin@library.edu.vn' },
            'thuthu1': { id: 2, username: 'thuthu1', role: 'librarian', full_name: 'Thủ thư Nguyễn Thị Mai', email: 'mai.thuthu@library.edu.vn' },
            'docgia1': { id: 3, username: 'docgia1', role: 'reader', full_name: 'Nguyễn Văn An', email: 'an.nguyen@email.com', reader_id: 1 }
        };
        const demoPasswords = {
            'admin': 'admin123',
            'thuthu1': '123456',
            'docgia1': '123456'
        };
        if (demoUsers[username] && demoPasswords[username] === password) {
            return { user: demoUsers[username], message: 'Đăng nhập thành công (Demo Mode)' };
        } else if (demoUsers[username]) {
            throw new Error('Mật khẩu không chính xác!');
        } else {
            throw new Error(`Tài khoản '${username}' không tồn tại. Vui lòng chọn tài khoản mẫu (admin, thuthu1, docgia1) để dùng thử!`);
        }
    }

    // Categories
    if (endpoint.startsWith('/categories')) {
        return [
            { id: 1, code: 'CNTT', name: 'Công nghệ Thông tin & AI', description: 'Lập trình, AI, Data' },
            { id: 2, code: 'VH', name: 'Văn học & Nghệ thuật', description: 'Tiểu thuyết, truyện ngắn' },
            { id: 3, code: 'KT', name: 'Kinh tế & Quản trị', description: 'Kinh doanh, Tài chính' },
            { id: 4, code: 'KH', name: 'Khoa học & Kỹ thuật', description: 'Vật lý, Toán học' },
            { id: 5, code: 'LS', name: 'Lịch sử & Triết học', description: 'Lịch sử thế giới & VN' },
            { id: 6, code: 'KNS', name: 'Kỹ năng sống & Phát triển', description: 'Phát triển bản thân' }
        ];
    }

    // Dashboard Stats
    if (endpoint.startsWith('/stats/dashboard')) {
        return {
            book_stats: { total_books: 150, available_copies: 112 },
            reader_stats: { total_readers: 48, active_readers: 42 },
            loan_stats: { active_loans: 38, overdue_loans: 4, total_fines: 120000 },
            top_books: [
                { id: 1, title: 'Nhập Môn Lập Trình Python', borrow_count: 28 },
                { id: 2, title: 'Trí Tuệ Nhân Tạo & Deep Learning', borrow_count: 24 },
                { id: 3, title: 'Đắc Nhân Tâm', borrow_count: 19 },
                { id: 4, title: 'Nhà Giả Kim', borrow_count: 15 },
                { id: 5, title: 'Kinh Tế Học Vĩ Mô', borrow_count: 12 }
            ],
            category_stats: [
                { category_name: 'Công nghệ Thông tin & AI', book_count: 45 },
                { category_name: 'Văn học & Nghệ thuật', book_count: 35 },
                { category_name: 'Kinh tế & Quản trị', book_count: 30 },
                { category_name: 'Khoa học & Kỹ thuật', book_count: 20 },
                { category_name: 'Kỹ năng sống', book_count: 20 }
            ]
        };
    }

    // Books
    if (endpoint.startsWith('/books')) {
        return [
            { id: 1, book_code: 'MS001', title: 'Nhập Môn Lập Trình Python', author: 'Guido van Rossum', category_id: 1, category_name: 'Công nghệ Thông tin & AI', publisher: 'NXB Bách Khoa', publish_year: 2023, total_qty: 5, available_qty: 3, rack_location: 'Kệ A1-01', description: 'Cuốn sách căn bản dành cho người mới bắt đầu học lập trình Python.', cover_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&q=80' },
            { id: 2, book_code: 'MS002', title: 'Trí Tuệ Nhân Tạo & Deep Learning', author: 'Andrew Ng', category_id: 1, category_name: 'Công nghệ Thông tin & AI', publisher: 'NXB Giáo Dục', publish_year: 2024, total_qty: 4, available_qty: 2, rack_location: 'Kệ A1-02', description: 'Kiến thức chuyên sâu về mạng Nơ-ron nhân tạo và học sâu.', cover_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80' },
            { id: 3, book_code: 'MS003', title: 'Đắc Nhân Tâm', author: 'Dale Carnegie', category_id: 6, category_name: 'Kỹ năng sống & Phát triển', publisher: 'NXB Trẻ', publish_year: 2022, total_qty: 10, available_qty: 7, rack_location: 'Kệ B2-05', description: 'Nghệ thuật thu phục lòng người và giao tiếp ứng xử thành công.', cover_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80' },
            { id: 4, book_code: 'MS004', title: 'Nhà Giả Kim', author: 'Paulo Coelho', category_id: 2, category_name: 'Văn học & Nghệ thuật', publisher: 'NXB Hội Nhà Văn', publish_year: 2021, total_qty: 8, available_qty: 4, rack_location: 'Kệ C1-03', description: 'Hành trình theo đuổi vận mệnh và giấc mơ của chú bé chăn cừu Santiago.', cover_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&q=80' },
            { id: 5, book_code: 'MS005', title: 'Kinh Tế Học Vĩ Mô', author: 'N. Gregory Mankiw', category_id: 3, category_name: 'Kinh tế & Quản trị', publisher: 'NXB Thống Kê', publish_year: 2023, total_qty: 6, available_qty: 5, rack_location: 'Kệ D3-01', description: 'Giáo trình chuẩn quốc tế về các nguyên lý kinh tế học vĩ mô.', cover_url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=400&q=80' }
        ];
    }

    // Readers
    if (endpoint.startsWith('/readers')) {
        return [
            { id: 1, reader_code: 'DG001', full_name: 'Nguyễn Văn An', email: 'an.nguyen@email.com', phone: '0901234567', card_type: 'Sinh viên', status: 'Hoạt động', issue_date: '2025-09-01', expiry_date: '2027-09-01' },
            { id: 2, reader_code: 'DG002', full_name: 'Trần Thị Bình', email: 'binh.tran@email.com', phone: '0912345678', card_type: 'Sinh viên', status: 'Hoạt động', issue_date: '2025-09-01', expiry_date: '2027-09-01' },
            { id: 3, reader_code: 'DG003', full_name: 'Lê Hoàng Cường', email: 'cuong.le@email.com', phone: '0923456789', card_type: 'Giảng viên', status: 'Hoạt động', issue_date: '2024-01-15', expiry_date: '2028-01-15' }
        ];
    }

    // Loans
    if (endpoint.startsWith('/loans')) {
        return [
            { id: 1, borrow_code: 'PM001', reader_id: 1, reader_name: 'Nguyễn Văn An', reader_code: 'DG001', book_id: 1, book_title: 'Nhập Môn Lập Trình Python', borrow_date: '2026-03-01', due_date: '2026-03-15', return_date: null, status: 'Đang mượn', fine_amount: 0, fine_status: 'N/A' },
            { id: 2, borrow_code: 'PM002', reader_id: 2, reader_name: 'Trần Thị Bình', reader_code: 'DG002', book_id: 2, book_title: 'Trí Tuệ Nhân Tạo & Deep Learning', borrow_date: '2026-02-10', due_date: '2026-02-24', return_date: null, status: 'Quá hạn', fine_amount: 85000, fine_status: 'Chưa nộp' }
        ];
    }

    // Users
    if (endpoint.startsWith('/users')) {
        return [
            { id: 1, username: 'admin', role: 'admin', full_name: 'Quản trị viên Hệ thống', email: 'admin@library.edu.vn', created_at: '2025-01-01' },
            { id: 2, username: 'thuthu1', role: 'librarian', full_name: 'Thủ thư Nguyễn Thị Mai', email: 'mai.thuthu@library.edu.vn', created_at: '2025-01-05' },
            { id: 3, username: 'docgia1', role: 'reader', full_name: 'Nguyễn Văn An', email: 'an.nguyen@email.com', created_at: '2025-09-01' }
        ];
    }

    // Reservations
    if (endpoint.startsWith('/reservations')) {
        return [];
    }

    // Profile
    if (endpoint.startsWith('/auth/profile')) {
        return state.currentUser || { id: 1, username: 'admin', role: 'admin', full_name: 'Quản trị viên Hệ thống', email: 'admin@library.edu.vn' };
    }

    // Generic response for mutations
    if (method !== 'GET') {
        return { message: 'Thao tác thành công (Demo Mode)' };
    }

    return [];
}

// --- HELPER: FETCH API ---
async function fetchAPI(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `Lỗi HTTP: ${response.status}`);
        }
        return result;
    } catch (err) {
        // Fallback to Demo Mock Data for Static GitHub Pages
        try {
            const mock = getMockData(endpoint, method, data);
            if (mock !== null) return mock;
        } catch (mockErr) {
            showToast(mockErr.message, 'error');
            throw mockErr;
        }

        showToast(err.message || 'Lỗi kết nối server', 'warning');
        throw err;
    }
}

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div>${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = item.getAttribute('data-tab');
            switchTab(tab);
        });
    });

    // Theme Toggle
    document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

    // Logout Action
    document.getElementById('headerLogoutBtn').addEventListener('click', handleLogout);
    document.getElementById('sidebarLogoutBtn').addEventListener('click', handleLogout);

    // Overlay Login Presets
    document.querySelectorAll('#loginOverlay .preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const user = btn.getAttribute('data-user');
            const pass = btn.getAttribute('data-pass');
            document.getElementById('overlayUsername').value = user;
            document.getElementById('overlayPassword').value = pass;
        });
    });

    document.getElementById('overlayLoginForm').addEventListener('submit', handleLoginSubmit);

    // View Toggle (Grid vs Table)
    document.getElementById('viewGridBtn').addEventListener('click', () => setBookViewMode('grid'));
    document.getElementById('viewTableBtn').addEventListener('click', () => setBookViewMode('table'));

    // Search & Filter Inputs
    document.getElementById('bookSearchInput').addEventListener('input', filterBooks);
    document.getElementById('bookCategoryFilter').addEventListener('change', filterBooks);
    document.getElementById('bookStatusFilter').addEventListener('change', filterBooks);
    document.getElementById('readerSearchInput').addEventListener('input', filterReaders);
    document.getElementById('readerStatusFilter').addEventListener('change', filterReaders);
    document.getElementById('loanSearchInput').addEventListener('input', filterLoans);
    document.getElementById('loanStatusFilter').addEventListener('change', filterLoans);
    document.getElementById('globalSearchInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val) {
                switchTab('books');
                document.getElementById('bookSearchInput').value = val;
                filterBooks();
            }
        }
    });

    // User Profile Card click action (All roles)
    document.getElementById('userProfileCard').addEventListener('click', openProfileModal);

    // Modals Open Actions
    document.getElementById('addBookBtn').addEventListener('click', () => openBookModal());
    document.getElementById('addReaderBtn').addEventListener('click', () => openReaderModal());
    document.getElementById('createLoanBtn').addEventListener('click', () => openLoanModal());
    document.getElementById('quickBorrowBtn').addEventListener('click', () => openLoanModal());
    document.getElementById('addUserBtn').addEventListener('click', () => openUserModal());
    document.getElementById('viewAllLoansBtn').addEventListener('click', () => switchTab('loans'));

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) closeModal(modal.id);
        });
    });

    // Modal forms submission
    document.getElementById('bookForm').addEventListener('submit', handleBookSubmit);
    document.getElementById('readerForm').addEventListener('submit', handleReaderSubmit);
    document.getElementById('loanForm').addEventListener('submit', handleLoanSubmit);
    document.getElementById('userForm').addEventListener('submit', handleUserSubmit);
    document.getElementById('profileForm').addEventListener('submit', handleProfileSubmit);


    // AI Chat
    document.getElementById('aiChatSendBtn').addEventListener('click', handleAiSearch);
    document.getElementById('aiChatInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleAiSearch();
    });
    document.getElementById('refreshAiRecBtn').addEventListener('click', loadAiRecommendations);

    // Export Buttons
    document.getElementById('exportBooksBtn').addEventListener('click', exportBooksCSV);
    document.getElementById('exportReadersBtn').addEventListener('click', exportReadersCSV);
    document.getElementById('exportLoansBtn').addEventListener('click', exportLoansCSV);
    document.getElementById('printFullReportBtn').addEventListener('click', openFullReportPrint);
}

// --- USER PROFILE MODAL HANDLERS ---
async function openProfileModal() {
    if (!state.currentUser) return;

    openModal('profileModal');
    
    try {
        const profile = await fetchAPI(`/auth/profile?user_id=${state.currentUser.id}`);

        document.getElementById('profileUserId').value = profile.id;
        document.getElementById('profileHeaderName').textContent = profile.full_name;
        document.getElementById('profileHeaderMeta').textContent = `@${profile.username} • Tham gia: ${(profile.created_at || '').substring(0, 10)}`;
        
        const badge = document.getElementById('profileHeaderRoleBadge');
        badge.className = `role-tag ${profile.role}`;
        badge.textContent = profile.role === 'admin' ? 'QUẢN TRỊ VIÊN' : (profile.role === 'librarian' ? 'THỦ THƯ' : 'ĐỘC GIẢ');

        document.getElementById('profileFullName').value = profile.full_name || '';
        document.getElementById('profileEmail').value = profile.email || '';
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profilePassword').value = '';

        // Readonly Metadata
        document.getElementById('profileUsernameText').textContent = profile.username;
        document.getElementById('profileRoleText').textContent = profile.role.toUpperCase();
        document.getElementById('profileReaderCodeText').textContent = profile.reader_code || 'N/A';
        document.getElementById('profileCardStatusText').textContent = profile.card_status || 'Không áp dụng';
        document.getElementById('profileExpiryText').textContent = profile.expiry_date || 'Vĩnh viễn';
        document.getElementById('profileCreatedAtText').textContent = (profile.created_at || '').substring(0, 10);

    } catch (err) {
        console.error("Failed loading profile", err);
    }
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const userId = parseInt(document.getElementById('profileUserId').value);
    const data = {
        user_id: userId,
        full_name: document.getElementById('profileFullName').value.trim(),
        email: document.getElementById('profileEmail').value.trim(),
        phone: document.getElementById('profilePhone').value.trim(),
        password: document.getElementById('profilePassword').value.trim()
    };

    try {
        const res = await fetchAPI('/auth/profile', 'PUT', data);
        showToast(res.message, 'success');
        
        // Update local state currentUser
        state.currentUser.full_name = res.user.full_name;
        state.currentUser.email = res.user.email;
        localStorage.setItem('lib_user', JSON.stringify(state.currentUser));
        
        updateUserUI();
        closeModal('profileModal');
    } catch (err) {}
}

// --- USER & ROLE LOGIC ---
function updateUserUI() {

    if (!state.currentUser) return;
    const role = state.currentUser.role || 'reader';
    const roleTag = document.getElementById('sidebarUserRole');
    const userName = document.getElementById('sidebarUserName');
    const avatar = document.getElementById('sidebarAvatar');

    userName.textContent = state.currentUser.full_name || state.currentUser.username;
    roleTag.className = `role-tag ${role}`;

    if (role === 'admin') {
        roleTag.textContent = 'Quản trị viên';
        avatar.innerHTML = '<i class="fa-solid fa-user-shield"></i>';
    } else if (role === 'librarian') {
        roleTag.textContent = 'Thủ thư';
        avatar.innerHTML = '<i class="fa-solid fa-user-tie"></i>';
    } else {
        roleTag.textContent = 'Độc giả';
        avatar.innerHTML = '<i class="fa-solid fa-graduation-cap"></i>';
    }
}

function toggleTheme() {
    const body = document.body;
    const btn = document.getElementById('themeToggleBtn');
    if (body.classList.contains('theme-dark')) {
        body.classList.remove('theme-dark');
        body.classList.add('theme-light');
        btn.innerHTML = '<i class="fa-solid fa-sun"></i> <span>Giao diện Sáng</span>';
    } else {
        body.classList.remove('theme-light');
        body.classList.add('theme-dark');
        btn.innerHTML = '<i class="fa-solid fa-moon"></i> <span>Giao diện Tối</span>';
    }
}



// --- TAB SWITCHING ---
async function switchTab(tabId) {
    state.activeTab = tabId;

    // Update Nav UI
    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.getAttribute('data-tab') === tabId) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Update Views
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.remove('active');
    });

    const targetView = document.getElementById(`tab-${tabId}`);
    if (targetView) targetView.classList.add('active');

    const isReader = state.currentUser && state.currentUser.role === 'reader';

    // Page titles
    const titles = {
        'dashboard': ['Tổng quan Thư viện', 'Thống kê hoạt động & chỉ số thư viện thời gian thực'],
        'books': [isReader ? 'Tra cứu Sách' : 'Tra cứu & Quản lý Sách', isReader ? 'Tra cứu danh mục các đầu sách trong thư viện' : 'Danh mục đầu sách, tìm kiếm và quản lý kho sách'],
        'readers': ['Quản lý Độc giả', 'Danh sách thẻ thư viện, gia hạn và theo dõi trạng thái độc giả'],
        'loans': ['Quản lý Mượn / Trả / Phạt', 'Theo dõi lưu thông sách, tính tiền phạt quá hạn và gia hạn'],
        'my-loans': ['Lịch sử Mượn Sách', 'Danh sách các cuốn sách bạn đang mượn và hạn trả'],
        'reservations': ['Hàng chờ Đặt trước Sách', 'Quản lý danh sách độc giả đặt trước khi sách hết mượn'],
        'users': ['Quản lý Tài khoản & Phân quyền', 'Danh sách tài khoản hệ thống và cấp quyền Admin, Thủ thư, Độc giả'],
        'ai-assistant': ['Trợ lý AI & Gợi ý Sách', 'Tìm kiếm theo ngữ nghĩa và nhận khuyến nghị sách thông minh'],
        'reports': ['Báo cáo & Xuất dữ liệu', 'Xuất dữ liệu Excel/CSV và tạo báo cáo in ấn chính thức']
    };

    if (titles[tabId]) {
        document.getElementById('pageTitle').textContent = titles[tabId][0];
        document.getElementById('pageSubtitle').textContent = titles[tabId][1];
    }

    // Load tab-specific data
    if (tabId === 'dashboard') await loadDashboardData();
    if (tabId === 'books') await loadBooks();
    if (tabId === 'readers') await loadReaders();
    if (tabId === 'loans') await loadLoans();
    if (tabId === 'my-loans') await loadMyLoans();
    if (tabId === 'reservations') await loadReservations();
    if (tabId === 'users') await loadUsers();
    if (tabId === 'ai-assistant') await loadAiRecommendations();
}

// --- CATEGORIES LOADING ---
async function loadCategories() {
    try {
        state.categories = await fetchAPI('/categories');
        const selectFilter = document.getElementById('bookCategoryFilter');
        const selectForm = document.getElementById('bookFormCategory');

        selectFilter.innerHTML = '<option value="all">Tất cả thể loại</option>';
        selectForm.innerHTML = '<option value="">-- Chọn thể loại --</option>';

        state.categories.forEach(cat => {
            selectFilter.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
            selectForm.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    } catch (err) {
        console.error("Failed loading categories", err);
    }
}

// --- DASHBOARD & CHARTS ---
async function loadDashboardData() {
    try {
        const stats = await fetchAPI('/stats/dashboard');

        // Metric Cards
        document.getElementById('statTotalBooks').textContent = stats.book_stats.total_books || 0;
        document.getElementById('statAvailableCopies').textContent = stats.book_stats.available_copies || 0;
        document.getElementById('statTotalReaders').textContent = stats.reader_stats.total_readers || 0;
        document.getElementById('statActiveReaders').textContent = stats.reader_stats.active_readers || 0;
        document.getElementById('statActiveLoans').textContent = stats.loan_stats.active_loans || 0;
        document.getElementById('statOverdueLoans').textContent = stats.loan_stats.overdue_loans || 0;
        document.getElementById('statTotalFines').textContent = `${(stats.loan_stats.total_fines || 0).toLocaleString()} VNĐ`;

        // Render Overdue Table
        const overdueLoans = await fetchAPI('/loans?status=Quá hạn');
        renderOverdueTable(overdueLoans);

        // Render Charts
        renderTopBooksChart(stats.top_books);
        renderCategoryChart(stats.category_stats);
    } catch (err) {
        console.error("Failed loading dashboard data", err);
    }
}

function renderOverdueTable(overdueLoans) {
    const tbody = document.getElementById('overdueTableBody');
    if (!overdueLoans || overdueLoans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">🎉 Không có sách nào bị quá hạn! Thư viện đang hoạt động rất tốt.</td></tr>`;
        return;
    }

    tbody.innerHTML = overdueLoans.map(loan => {
        const dueDt = new Date(loan.due_date);
        const today = new Date();
        const daysOverdue = Math.max(1, Math.floor((today - dueDt) / (1000 * 60 * 60 * 24)));

        return `
            <tr>
                <td><strong>${loan.borrow_code}</strong></td>
                <td>
                    <div><strong>${loan.reader_name}</strong></div>
                    <small class="text-muted">${loan.reader_code}</small>
                </td>
                <td>${loan.book_title}</td>
                <td>${loan.borrow_date}</td>
                <td><span class="text-danger"><strong>${loan.due_date}</strong></span></td>
                <td><span class="badge badge-danger">${daysOverdue} ngày</span></td>
                <td><strong class="text-danger">${(loan.fine_amount || 0).toLocaleString()} VNĐ</strong></td>
                <td>
                    <button onclick="processReturn(${loan.id})" class="btn btn-sm btn-success" title="Trả sách & tính phạt">
                        <i class="fa-solid fa-rotate-left"></i> Trả sách
                    </button>
                    ${loan.fine_status === 'Chưa nộp' ? `
                        <button onclick="processPayFine(${loan.id})" class="btn btn-sm btn-warning" title="Thu tiền phạt">
                            <i class="fa-solid fa-money-bill"></i> Thu phạt
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function renderTopBooksChart(topBooks) {
    const ctx = document.getElementById('topBooksChart').getContext('2d');
    if (state.charts.topBooks) state.charts.topBooks.destroy();

    const labels = topBooks.map(b => b.title.length > 20 ? b.title.substring(0, 20) + '...' : b.title);
    const data = topBooks.map(b => b.borrow_count);

    state.charts.topBooks = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Số lượt mượn',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: '#6366f1',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function renderCategoryChart(categoryStats) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (state.charts.category) state.charts.category.destroy();

    const labels = categoryStats.map(c => c.category_name);
    const data = categoryStats.map(c => c.total_copies);

    state.charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12 } }
            }
        }
    });
}

// --- BOOK MANAGEMENT & LOOKUP ---
async function loadBooks() {
    try {
        state.books = await fetchAPI('/books');
        filterBooks();
    } catch (err) {
        console.error("Failed loading books", err);
    }
}

function filterBooks() {
    const q = document.getElementById('bookSearchInput').value.trim().toLowerCase();
    const cat = document.getElementById('bookCategoryFilter').value;
    const status = document.getElementById('bookStatusFilter').value;

    const filtered = state.books.filter(b => {
        const matchesQ = !q || (
            b.title.toLowerCase().includes(q) ||
            b.author.toLowerCase().includes(q) ||
            b.book_code.toLowerCase().includes(q) ||
            (b.publisher && b.publisher.toLowerCase().includes(q))
        );

        const matchesCat = (cat === 'all' || b.category_id == cat);
        let matchesStatus = true;
        if (status === 'available') matchesStatus = (b.available_qty > 0);
        if (status === 'out_of_stock') matchesStatus = (b.available_qty === 0);

        return matchesQ && matchesCat && matchesStatus;
    });

    renderBooksGrid(filtered);
    renderBooksTable(filtered);
}

function setBookViewMode(mode) {
    state.viewMode = mode;
    document.getElementById('viewGridBtn').classList.toggle('active', mode === 'grid');
    document.getElementById('viewTableBtn').classList.toggle('active', mode === 'table');

    document.getElementById('booksGridContainer').classList.toggle('hidden', mode !== 'grid');
    document.getElementById('booksTableContainer').classList.toggle('hidden', mode !== 'table');
}

function renderBooksGrid(booksList) {
    const container = document.getElementById('booksGridContainer');
    if (!booksList || booksList.length === 0) {
        container.innerHTML = `<div class="glass-panel full-width text-center py-5 text-muted">Không tìm thấy cuốn sách nào khớp với tìm kiếm của bạn.</div>`;
        return;
    }

    const isStaff = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'librarian');

    container.innerHTML = booksList.map(book => `
        <div class="book-card">
            <img src="${book.cover_url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80'}" alt="${book.title}" class="book-cover" onerror="this.src='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80'">
            <div class="book-card-body">
                <div class="book-category">${book.category_name} • ${book.book_code}</div>
                <h4 class="book-title">${book.title}</h4>
                <div class="book-author"><i class="fa-solid fa-feather"></i> ${book.author}</div>
                <div class="book-meta">
                    <span><i class="fa-solid fa-warehouse"></i> Tồn: <strong>${book.available_qty}/${book.total_qty}</strong></span>
                    <span><i class="fa-solid fa-location-dot"></i> ${book.rack_location || 'Kệ A1'}</span>
                </div>
            </div>
            <div class="book-card-actions">
                <button onclick="triggerAiSummarize(${book.id})" class="btn btn-sm btn-ai flex-1" title="Xem AI Tóm tắt">
                    <i class="fa-solid fa-sparkles"></i> AI Tóm tắt
                </button>
                ${book.available_qty > 0 ? `
                    <button onclick="handleBorrowClick(${book.id})" class="btn btn-sm btn-primary" title="Mượn sách ngay">
                        <i class="fa-solid fa-handshake"></i> Mượn sách
                    </button>
                ` : `
                    <button onclick="reserveBook(${book.id})" class="btn btn-sm btn-warning" title="Đặt trước khi có sách">
                        <i class="fa-solid fa-bookmark"></i> Đặt trước
                    </button>
                `}
                ${isStaff ? `
                    <button onclick="editBook(${book.id})" class="btn btn-sm btn-icon" title="Chỉnh sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button onclick="deleteBook(${book.id})" class="btn btn-sm btn-icon" title="Xóa"><i class="fa-solid fa-trash text-danger"></i></button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderBooksTable(booksList) {
    const tbody = document.getElementById('booksTableBody');
    const isStaff = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'librarian');

    if (!booksList || booksList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">Không tìm thấy dữ liệu.</td></tr>`;
        return;
    }

    tbody.innerHTML = booksList.map(b => `
        <tr>
            <td><strong>${b.book_code}</strong></td>
            <td><img src="${b.cover_url}" style="width:36px; height:48px; object-fit:cover; border-radius:4px;"></td>
            <td>
                <div><strong>${b.title}</strong></div>
                <small class="text-muted">NXB ${b.publisher} (${b.publish_year})</small>
            </td>
            <td>${b.author}</td>
            <td><span class="badge badge-info">${b.category_name}</span></td>
            <td>${b.publisher}</td>
            <td>${b.rack_location}</td>
            <td>
                <span class="badge ${b.available_qty > 0 ? 'badge-success' : 'badge-danger'}">
                    ${b.available_qty} / ${b.total_qty}
                </span>
            </td>
            <td>
                <button onclick="triggerAiSummarize(${b.id})" class="btn btn-sm btn-ai" title="AI Tóm tắt"><i class="fa-solid fa-sparkles"></i> Tóm tắt</button>
                ${b.available_qty > 0 ? `
                    <button onclick="handleBorrowClick(${b.id})" class="btn btn-sm btn-primary" title="Mượn sách"><i class="fa-solid fa-handshake"></i> Mượn sách</button>
                ` : `
                    <button onclick="reserveBook(${b.id})" class="btn btn-sm btn-warning" title="Đặt trước"><i class="fa-solid fa-bookmark"></i> Đặt trước</button>
                `}
                ${isStaff ? `
                    <button onclick="editBook(${b.id})" class="btn btn-sm btn-outline"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteBook(${b.id})" class="btn btn-sm btn-outline text-danger"><i class="fa-solid fa-trash"></i></button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

async function handleBorrowClick(bookId) {
    if (!state.currentUser) return;
    const isStaff = (state.currentUser.role === 'admin' || state.currentUser.role === 'librarian');

    if (isStaff) {
        quickBorrowBook(bookId);
    } else {
        // Reader self-borrowing
        const book = state.books.find(b => b.id === bookId);
        if (!book) return;

        const readerId = state.currentUser.reader_id;
        if (!readerId) {
            showToast("Tài khoản chưa có thẻ thư viện để thực hiện mượn sách!", "error");
            return;
        }

        if (!confirm(`Bạn có chắc chắn muốn đăng ký mượn cuốn sách "${book.title}" (Thời hạn 14 ngày) không?`)) return;

        try {
            const res = await fetchAPI('/loans', 'POST', {
                reader_id: readerId,
                book_id: bookId,
                borrow_days: 14,
                notes: 'Độc giả tự đăng ký mượn trực tuyến'
            });
            showToast(res.message, 'success');
            await loadBooks();
            if (state.activeTab === 'my-loans') await loadMyLoans();
        } catch (err) {}
    }
}


function openBookModal(book = null) {
    document.getElementById('bookFormId').value = book ? book.id : '';
    document.getElementById('bookFormCode').value = book ? book.book_code : `MS0${state.books.length + 1}`;
    document.getElementById('bookFormTitle').value = book ? book.title : '';
    document.getElementById('bookFormAuthor').value = book ? book.author : '';
    document.getElementById('bookFormCategory').value = book ? book.category_id : (state.categories[0]?.id || '');
    document.getElementById('bookFormPublisher').value = book ? book.publisher : 'NXB Trẻ';
    document.getElementById('bookFormYear').value = book ? book.publish_year : 2024;
    document.getElementById('bookFormTotalQty').value = book ? book.total_qty : 5;
    document.getElementById('bookFormRack').value = book ? book.rack_location : 'Kệ A1-01';
    document.getElementById('bookFormCover').value = book ? book.cover_url : '';
    document.getElementById('bookFormDesc').value = book ? book.description : '';

    document.getElementById('bookModalTitle').innerHTML = book ? '<i class="fa-solid fa-pen"></i> Chỉnh sửa Sách' : '<i class="fa-solid fa-book"></i> Thêm Sách Mới';
    openModal('bookModal');
}

async function handleBookSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('bookFormId').value;
    const data = {
        book_code: document.getElementById('bookFormCode').value.trim(),
        title: document.getElementById('bookFormTitle').value.trim(),
        author: document.getElementById('bookFormAuthor').value.trim(),
        category_id: parseInt(document.getElementById('bookFormCategory').value),
        publisher: document.getElementById('bookFormPublisher').value.trim(),
        publish_year: parseInt(document.getElementById('bookFormYear').value),
        total_qty: parseInt(document.getElementById('bookFormTotalQty').value),
        available_qty: parseInt(document.getElementById('bookFormTotalQty').value),
        rack_location: document.getElementById('bookFormRack').value.trim(),
        cover_url: document.getElementById('bookFormCover').value.trim(),
        description: document.getElementById('bookFormDesc').value.trim()
    };

    try {
        if (id) {
            await fetchAPI(`/books/${id}`, 'PUT', data);
            showToast('Cập nhật sách thành công!', 'success');
        } else {
            await fetchAPI('/books', 'POST', data);
            showToast('Thêm sách mới thành công!', 'success');
        }
        closeModal('bookModal');
        await loadBooks();
    } catch (err) {}
}

function editBook(id) {
    const book = state.books.find(b => b.id === id);
    if (book) openBookModal(book);
}

async function deleteBook(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa cuốn sách này khỏi thư viện không?")) return;
    try {
        const res = await fetchAPI(`/books/${id}`, 'DELETE');
        showToast(res.message, 'success');
        await loadBooks();
    } catch (err) {}
}

// --- ADMIN USER MANAGEMENT & ROLE ASSIGNMENT ---
async function loadUsers() {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    try {
        state.users = await fetchAPI('/users');
        renderUsersTable();
    } catch (err) {
        console.error("Failed loading users", err);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!state.users || state.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Không tìm thấy tài khoản nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.users.map(u => {
        let roleBadge = `<span class="badge badge-info">Độc giả</span>`;
        if (u.role === 'admin') roleBadge = `<span class="badge badge-danger"><i class="fa-solid fa-user-shield"></i> Admin</span>`;
        if (u.role === 'librarian') roleBadge = `<span class="badge badge-success"><i class="fa-solid fa-user-tie"></i> Thủ thư</span>`;

        return `
            <tr>
                <td><strong>#${u.id}</strong></td>
                <td><strong>${u.username}</strong></td>
                <td>${u.full_name}</td>
                <td>${u.email || '<em class="text-muted">Chưa cập nhật</em>'}</td>
                <td>${roleBadge}</td>
                <td>${(u.created_at || '').substring(0, 10)}</td>
                <td>
                    <button onclick="editUser(${u.id})" class="btn btn-sm btn-outline"><i class="fa-solid fa-pen"></i> Sửa</button>
                    ${u.username !== 'admin' ? `
                        <button onclick="deleteUser(${u.id})" class="btn btn-sm btn-outline text-danger"><i class="fa-solid fa-trash"></i> Xóa</button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function openUserModal(user = null) {
    document.getElementById('userFormId').value = user ? user.id : '';
    document.getElementById('userFormUsername').value = user ? user.username : '';
    document.getElementById('userFormUsername').disabled = !!user; // Username cannot be changed on edit
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormFullName').value = user ? user.full_name : '';
    document.getElementById('userFormEmail').value = user ? user.email : '';
    document.getElementById('userFormRole').value = user ? user.role : 'reader';

    document.getElementById('userModalTitle').innerHTML = user ? '<i class="fa-solid fa-pen"></i> Chỉnh sửa Tài Khoản' : '<i class="fa-solid fa-user-plus"></i> Thêm Tài Khoản Mới';
    openModal('userModal');
}

async function handleUserSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('userFormId').value;
    const data = {
        username: document.getElementById('userFormUsername').value.trim(),
        password: document.getElementById('userFormPassword').value.trim(),
        full_name: document.getElementById('userFormFullName').value.trim(),
        email: document.getElementById('userFormEmail').value.trim(),
        role: document.getElementById('userFormRole').value
    };

    try {
        if (id) {
            await fetchAPI(`/users/${id}`, 'PUT', data);
            showToast('Cập nhật tài khoản người dùng thành công!', 'success');
        } else {
            const res = await fetchAPI('/users', 'POST', data);
            showToast(res.message, 'success');
        }
        closeModal('userModal');
        await loadUsers();
    } catch (err) {}
}

function editUser(id) {
    const user = state.users.find(u => u.id === id);
    if (user) openUserModal(user);
}

async function deleteUser(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này khỏi hệ thống?")) return;
    try {
        const res = await fetchAPI(`/users/${id}`, 'DELETE');
        showToast(res.message, 'success');
        await loadUsers();
    } catch (err) {}
}

// --- READER MANAGEMENT ---
async function loadReaders() {
    try {
        state.readers = await fetchAPI('/readers');
        filterReaders();
    } catch (err) {
        console.error("Failed loading readers", err);
    }
}

function filterReaders() {
    const q = document.getElementById('readerSearchInput').value.trim().toLowerCase();
    const status = document.getElementById('readerStatusFilter').value;

    const filtered = state.readers.filter(r => {
        const matchesQ = !q || (
            r.full_name.toLowerCase().includes(q) ||
            r.reader_code.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            r.phone.includes(q)
        );
        const matchesStatus = (status === 'all' || r.status === status);
        return matchesQ && matchesStatus;
    });

    renderReadersTable(filtered);
}

function renderReadersTable(readersList) {
    const tbody = document.getElementById('readersTableBody');
    const isStaff = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'librarian');

    if (!readersList || readersList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Không tìm thấy độc giả nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = readersList.map(r => `
        <tr>
            <td><strong>${r.reader_code}</strong></td>
            <td>
                <div><strong>${r.full_name}</strong></div>
                <small class="text-muted">Tài khoản: ${r.reader_code.toLowerCase()}</small>
            </td>
            <td>
                <div><i class="fa-solid fa-envelope"></i> ${r.email}</div>
                <small class="text-muted"><i class="fa-solid fa-phone"></i> ${r.phone}</small>
            </td>
            <td><span class="badge badge-info">${r.card_type}</span></td>
            <td>
                <span class="badge ${r.status === 'Hoạt động' ? 'badge-success' : (r.status === 'Hết hạn' ? 'badge-warning' : 'badge-danger')}">
                    ${r.status}
                </span>
            </td>
            <td>${r.issue_date}</td>
            <td>${r.expiry_date}</td>
            <td>
                ${isStaff ? `
                    <button onclick="editReader(${r.id})" class="btn btn-sm btn-outline"><i class="fa-solid fa-pen"></i> Sửa</button>
                    ${r.status === 'Hoạt động' ? `
                        <button onclick="toggleReaderStatus(${r.id}, 'Bị khóa')" class="btn btn-sm btn-outline text-danger" title="Khóa thẻ"><i class="fa-solid fa-lock"></i></button>
                    ` : `
                        <button onclick="toggleReaderStatus(${r.id}, 'Hoạt động')" class="btn btn-sm btn-outline text-success" title="Kích hoạt thẻ"><i class="fa-solid fa-unlock"></i></button>
                    `}
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function openReaderModal(reader = null) {
    document.getElementById('readerFormId').value = reader ? reader.id : '';
    document.getElementById('readerFormCode').value = reader ? reader.reader_code : `DG00${state.readers.length + 1}`;
    document.getElementById('readerFormName').value = reader ? reader.full_name : '';
    document.getElementById('readerFormEmail').value = reader ? reader.email : '';
    document.getElementById('readerFormPhone').value = reader ? reader.phone : '';
    document.getElementById('readerFormCardType').value = reader ? reader.card_type : 'Sinh viên';
    document.getElementById('readerFormStatus').value = reader ? reader.status : 'Hoạt động';

    document.getElementById('readerModalTitle').innerHTML = reader ? '<i class="fa-solid fa-pen"></i> Sửa Thông tin Độc giả' : '<i class="fa-solid fa-id-card"></i> Cấp Thẻ Độc Giả Mới';
    openModal('readerModal');
}

async function handleReaderSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('readerFormId').value;
    const data = {
        reader_code: document.getElementById('readerFormCode').value.trim(),
        full_name: document.getElementById('readerFormName').value.trim(),
        email: document.getElementById('readerFormEmail').value.trim(),
        phone: document.getElementById('readerFormPhone').value.trim(),
        card_type: document.getElementById('readerFormCardType').value,
        status: document.getElementById('readerFormStatus').value
    };

    try {
        if (id) {
            await fetchAPI(`/readers/${id}`, 'PUT', data);
            showToast('Cập nhật độc giả thành công!', 'success');
        } else {
            const res = await fetchAPI('/readers', 'POST', data);
            showToast(res.message, 'success');
        }
        closeModal('readerModal');
        await loadReaders();
    } catch (err) {}
}

function editReader(id) {
    const reader = state.readers.find(r => r.id === id);
    if (reader) openReaderModal(reader);
}

async function toggleReaderStatus(id, newStatus) {
    const reader = state.readers.find(r => r.id === id);
    if (!reader) return;
    try {
        await fetchAPI(`/readers/${id}`, 'PUT', {
            full_name: reader.full_name,
            email: reader.email,
            phone: reader.phone,
            card_type: reader.card_type,
            status: newStatus,
            expiry_date: reader.expiry_date
        });
        showToast(`Đã chuyển trạng thái thẻ thành '${newStatus}'`, 'success');
        await loadReaders();
    } catch (err) {}
}

// --- LOANS & FINES MANAGEMENT (STAFF VIEW & MY LOANS READER VIEW) ---
async function loadLoans() {
    try {
        state.loans = await fetchAPI('/loans');
        filterLoans();
    } catch (err) {
        console.error("Failed loading loans", err);
    }
}

async function loadMyLoans() {
    if (!state.currentUser) return;
    const readerId = state.currentUser.reader_id;
    if (!readerId) {
        renderMyLoansTable([]);
        return;
    }
    try {
        const myLoans = await fetchAPI(`/loans?reader_id=${readerId}`);
        renderMyLoansTable(myLoans);
    } catch (err) {
        console.error("Failed loading personal loans", err);
    }
}

function renderMyLoansTable(loansList) {
    const tbody = document.getElementById('myLoansTableBody');
    if (!loansList || loansList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Bạn chưa mượn cuốn sách nào từ thư viện. Dữ liệu tài khoản của bạn hoàn toàn mới!</td></tr>`;
        return;
    }

    tbody.innerHTML = loansList.map(loan => {
        let statusBadge = `<span class="badge badge-info">${loan.status}</span>`;
        if (loan.status === 'Đang mượn') statusBadge = `<span class="badge badge-info"><i class="fa-solid fa-clock"></i> Đang mượn</span>`;
        if (loan.status === 'Đã trả') statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Đã trả</span>`;
        if (loan.status === 'Quá hạn') statusBadge = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Quá hạn</span>`;

        return `
            <tr>
                <td><strong>${loan.borrow_code}</strong></td>
                <td><strong>${loan.book_title}</strong> (${loan.book_code})</td>
                <td>${loan.borrow_date}</td>
                <td><strong>${loan.due_date}</strong></td>
                <td>${loan.return_date || '<em class="text-muted">Chưa trả</em>'}</td>
                <td>${statusBadge}</td>
                <td>
                    ${loan.fine_amount > 0 ? `<strong class="text-danger">${loan.fine_amount.toLocaleString()} VNĐ</strong>` : '0 VNĐ'}
                </td>
                <td>
                    ${loan.status !== 'Đã trả' ? `
                        <button onclick="processRenew(${loan.id})" class="btn btn-sm btn-outline">
                            <i class="fa-solid fa-calendar-plus"></i> Xin Gia hạn (+7d)
                        </button>
                    ` : '<span class="text-muted">Hoàn tất</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

function filterLoans() {
    const q = document.getElementById('loanSearchInput').value.trim().toLowerCase();
    const status = document.getElementById('loanStatusFilter').value;

    const filtered = state.loans.filter(l => {
        const matchesQ = !q || (
            l.borrow_code.toLowerCase().includes(q) ||
            l.reader_name.toLowerCase().includes(q) ||
            l.book_title.toLowerCase().includes(q) ||
            l.reader_code.toLowerCase().includes(q)
        );
        const matchesStatus = (status === 'all' || l.status === status);
        return matchesQ && matchesStatus;
    });

    renderLoansTable(filtered);
}

function renderLoansTable(loansList) {
    const tbody = document.getElementById('loansTableBody');
    if (!loansList || loansList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-muted">Không tìm thấy phiếu mượn nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = loansList.map(loan => {
        let statusBadge = `<span class="badge badge-info">${loan.status}</span>`;
        if (loan.status === 'Đang mượn') statusBadge = `<span class="badge badge-info"><i class="fa-solid fa-clock"></i> Đang mượn</span>`;
        if (loan.status === 'Đã trả') statusBadge = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Đã trả</span>`;
        if (loan.status === 'Quá hạn') statusBadge = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Quá hạn</span>`;

        return `
            <tr>
                <td><strong>${loan.borrow_code}</strong></td>
                <td>
                    <div><strong>${loan.reader_name}</strong></div>
                    <small class="text-muted">${loan.reader_code}</small>
                </td>
                <td>
                    <div><strong>${loan.book_title}</strong></div>
                    <small class="text-muted">Mã: ${loan.book_code}</small>
                </td>
                <td>${loan.borrow_date}</td>
                <td><strong>${loan.due_date}</strong></td>
                <td>${loan.return_date || '<em class="text-muted">Chưa trả</em>'}</td>
                <td>${statusBadge}</td>
                <td><span class="badge badge-secondary">${loan.renewal_count}/2 lần</span></td>
                <td>
                    ${loan.fine_amount > 0 ? `
                        <div class="text-danger"><strong>${loan.fine_amount.toLocaleString()} VNĐ</strong></div>
                        <small class="badge ${loan.fine_status === 'Đã nộp' ? 'badge-success' : 'badge-danger'}">${loan.fine_status}</small>
                    ` : '<span class="text-muted">0 VNĐ</span>'}
                </td>
                <td>
                    ${loan.status !== 'Đã trả' ? `
                        <button onclick="processReturn(${loan.id})" class="btn btn-sm btn-success" title="Trả sách">
                            <i class="fa-solid fa-rotate-left"></i> Trả sách
                        </button>
                        <button onclick="processRenew(${loan.id})" class="btn btn-sm btn-outline" title="Gia hạn +7 ngày">
                            <i class="fa-solid fa-calendar-plus"></i> Gia hạn
                        </button>
                    ` : `
                        <button onclick="openPrintTicket(${loan.id})" class="btn btn-sm btn-outline" title="In phiếu mượn">
                            <i class="fa-solid fa-print"></i> In phiếu
                        </button>
                    `}
                    ${loan.fine_amount > 0 && loan.fine_status === 'Chưa nộp' ? `
                        <button onclick="processPayFine(${loan.id})" class="btn btn-sm btn-warning" title="Nộp tiền phạt">
                            <i class="fa-solid fa-money-bill"></i> Nộp phạt
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

async function openLoanModal() {
    await loadReaders();
    await loadBooks();

    const readerSelect = document.getElementById('loanFormReader');
    const bookSelect = document.getElementById('loanFormBook');

    const activeReaders = state.readers.filter(r => r.status === 'Hoạt động');
    readerSelect.innerHTML = activeReaders.map(r => `<option value="${r.id}">${r.full_name} (${r.reader_code} - ${r.card_type})</option>`).join('');

    const availBooks = state.books.filter(b => b.available_qty > 0);
    bookSelect.innerHTML = availBooks.map(b => `<option value="${b.id}">${b.title} (${b.book_code} - Tồn: ${b.available_qty})</option>`).join('');

    openModal('loanModal');
}

function quickBorrowBook(bookId) {
    openLoanModal().then(() => {
        document.getElementById('loanFormBook').value = bookId;
    });
}

async function handleLoanSubmit(e) {
    e.preventDefault();
    const data = {
        reader_id: parseInt(document.getElementById('loanFormReader').value),
        book_id: parseInt(document.getElementById('loanFormBook').value),
        borrow_days: parseInt(document.getElementById('loanFormDays').value),
        notes: document.getElementById('loanFormNotes').value.trim()
    };

    try {
        const res = await fetchAPI('/loans', 'POST', data);
        showToast(res.message, 'success');
        closeModal('loanModal');
        await loadLoans();
        await loadBooks();
    } catch (err) {}
}

async function processReturn(loanId) {
    if (!confirm("Xác nhận hoàn tất thủ tục TRẢ SÁCH cho phiếu mượn này?")) return;
    try {
        const res = await fetchAPI(`/loans/${loanId}/return`, 'POST');
        showToast(res.message, 'success');
        await loadLoans();
        await loadBooks();
        await loadDashboardData();
    } catch (err) {}
}

async function processRenew(loanId) {
    try {
        const res = await fetchAPI(`/loans/${loanId}/renew`, 'POST');
        showToast(res.message, 'success');
        await loadLoans();
        if (state.activeTab === 'my-loans') await loadMyLoans();
    } catch (err) {}
}

async function processPayFine(loanId) {
    if (!confirm("Xác nhận đã thu đủ số tiền phạt trễ hạn của độc giả?")) return;
    try {
        const res = await fetchAPI(`/loans/${loanId}/pay-fine`, 'POST');
        showToast(res.message, 'success');
        await loadLoans();
        await loadDashboardData();
    } catch (err) {}
}

// --- BOOK RESERVATIONS ---
async function loadReservations() {
    if (!state.currentUser) return;
    const isReader = (state.currentUser.role === 'reader');
    try {
        if (isReader) {
            const readerId = state.currentUser.reader_id;
            if (!readerId) {
                state.reservations = [];
            } else {
                state.reservations = await fetchAPI(`/reservations?reader_id=${readerId}`);
            }
        } else {
            state.reservations = await fetchAPI('/reservations');
        }
        renderReservationsTable();
    } catch (err) {
        console.error("Failed loading reservations", err);
    }
}

function renderReservationsTable() {
    const tbody = document.getElementById('reservationsTableBody');
    const isReader = state.currentUser && (state.currentUser.role === 'reader');

    if (!state.reservations || state.reservations.length === 0) {
        const emptyText = isReader 
            ? "Bạn chưa đặt trước cuốn sách nào. Dữ liệu của bạn hoàn toàn mới!" 
            : "Hiện tại không có yêu cầu đặt trước nào trong hệ thống.";
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">${emptyText}</td></tr>`;
        return;
    }

    tbody.innerHTML = state.reservations.map(res => `
        <tr>
            <td><span class="badge badge-warning">Hàng chờ #${res.queue_order}</span></td>
            <td><strong>${res.book_title}</strong></td>
            <td>${res.book_code}</td>
            <td><strong>${res.reader_name}</strong></td>
            <td>${res.reader_code}</td>
            <td>${res.request_date}</td>
            <td><span class="badge ${res.status === 'Đang chờ' ? 'badge-info' : 'badge-secondary'}">${res.status}</span></td>
            <td>
                ${res.status === 'Đang chờ' ? `
                    <button onclick="cancelReservation(${res.id})" class="btn btn-sm btn-outline text-danger"><i class="fa-solid fa-xmark"></i> Hủy đặt</button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}


async function reserveBook(bookId) {
    if (!state.currentUser) return;
    const readerId = state.currentUser.reader_id;
    if (!readerId) {
        showToast("Tài khoản độc giả này chưa có thẻ thư viện để thực hiện đặt trước!", "error");
        return;
    }

    try {
        const res = await fetchAPI('/reservations', 'POST', { book_id: bookId, reader_id: readerId });
        showToast(res.message, 'success');
        await loadReservations();
    } catch (err) {}
}

async function cancelReservation(resId) {
    if (!confirm("Hủy lượt đặt trước này?")) return;
    try {
        const res = await fetchAPI(`/reservations/${resId}`, 'DELETE');
        showToast(res.message, 'success');
        await loadReservations();
    } catch (err) {}
}

// --- AI ASSISTANT & RECOMMENDATIONS STUDIO ---
async function handleAiSearch() {
    const input = document.getElementById('aiChatInput');
    const prompt = input.value.trim();
    if (!prompt) return;

    const chatContainer = document.getElementById('aiChatMessages');

    // Render User Message
    chatContainer.innerHTML += `
        <div class="chat-message user">
            <div class="avatar"><i class="fa-solid fa-user"></i></div>
            <div class="bubble">${escapeHtml(prompt)}</div>
        </div>
    `;
    input.value = '';
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Render AI Thinking Placeholder
    const loadingId = 'ai-loading-' + Date.now();
    chatContainer.innerHTML += `
        <div class="chat-message ai" id="${loadingId}">
            <div class="avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="bubble"><i class="fa-solid fa-spinner fa-spin"></i> Trợ lý AI đang suy nghĩ và tìm kiếm dữ liệu...</div>
        </div>
    `;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        const res = await fetchAPI('/ai/search', 'POST', { prompt });
        document.getElementById(loadingId).remove();

        let booksHTML = '';
        if (res.books && res.books.length > 0) {
            booksHTML = `
                <div style="margin-top: 10px; display: grid; gap: 8px;">
                    ${res.books.map(b => `
                        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong>📖 ${b.title}</strong> — <small>${b.author} (${b.category_name})</small>
                                <div style="font-size:0.75rem; color:var(--text-muted);">Trạng thái: Tồn ${b.available_qty}/${b.total_qty} bản</div>
                            </div>
                            <button onclick="triggerAiSummarize(${b.id})" class="btn btn-sm btn-ai"><i class="fa-solid fa-sparkles"></i> Tóm tắt</button>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        chatContainer.innerHTML += `
            <div class="chat-message ai">
                <div class="avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="bubble">
                    ${res.ai_response}
                    ${booksHTML}
                </div>
            </div>
        `;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (err) {
        document.getElementById(loadingId).remove();
    }
}

async function loadAiRecommendations() {
    try {
        const readerId = state.currentUser ? state.currentUser.reader_id : null;
        const res = await fetchAPI('/ai/recommend', 'POST', { reader_id: readerId });
        document.getElementById('aiRecExplanation').innerHTML = `<i class="fa-solid fa-lightbulb text-warning"></i> ${res.ai_explanation}`;

        const container = document.getElementById('aiRecommendationsGrid');
        container.innerHTML = res.recommendations.map(b => `
            <div class="book-card" style="font-size:0.85rem;">
                <img src="${b.cover_url}" class="book-cover" style="height:140px;" onerror="this.src='https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80'">
                <div class="book-card-body" style="padding:10px;">
                    <div class="book-category">${b.category_name}</div>
                    <strong style="font-size:0.95rem; line-height:1.2;">${b.title}</strong>
                    <small class="text-muted" style="margin-bottom:6px;">${b.author}</small>
                    <button onclick="triggerAiSummarize(${b.id})" class="btn btn-sm btn-ai full-width" style="margin-top:auto;">
                        <i class="fa-solid fa-sparkles"></i> Xem tóm tắt AI
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {}
}

async function triggerAiSummarize(bookId) {
    openModal('aiSummaryModal');
    const modalBody = document.getElementById('aiSummaryModalBody');
    modalBody.innerHTML = `<div class="loading-spinner py-5 text-center"><i class="fa-solid fa-circle-notch fa-spin text-ai" style="font-size:2rem;"></i><br><br>Đang gọi Trí tuệ Nhân tạo để phân tích nội dung cuốn sách...</div>`;

    try {
        const summary = await fetchAPI('/ai/summarize', 'POST', { book_id: bookId });
        modalBody.innerHTML = `
            <div class="ai-summary-container">
                <div style="display:flex; gap:1.5rem; margin-bottom:1.5rem;">
                    <div style="flex:1;">
                        <h3 style="color:var(--accent-indigo); font-size:1.4rem;">${summary.title}</h3>
                        <p><strong>Tác giả:</strong> ${summary.author} | <strong>Thể loại:</strong> <span class="badge badge-info">${summary.category}</span></p>
                    </div>
                </div>

                <div class="glass-panel" style="background:rgba(99, 102, 241, 0.08); border-color:rgba(99, 102, 241, 0.25); padding:1rem; margin-bottom:1rem;">
                    <h4 style="color:#c084fc; margin-bottom:0.5rem;"><i class="fa-solid fa-lightbulb"></i> Tóm tắt Điều hành (Executive Summary)</h4>
                    <p style="font-size:0.95rem;">${summary.executive_summary}</p>
                </div>

                <div class="glass-panel" style="padding:1rem; margin-bottom:1rem;">
                    <h4 style="margin-bottom:0.5rem;"><i class="fa-solid fa-key text-warning"></i> Giá trị & Bài học Cốt lõi (Key Takeaways)</h4>
                    <ul style="padding-left:1.2rem; display:flex; flex-direction:column; gap:0.4rem;">
                        ${summary.key_takeaways.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>

                <div class="glass-panel" style="padding:1rem;">
                    <h4 style="margin-bottom:0.3rem;"><i class="fa-solid fa-bullseye text-success"></i> Đối tượng Khuyên đọc</h4>
                    <p style="font-size:0.9rem; color:var(--text-secondary);">${summary.target_audience}</p>
                </div>
            </div>
        `;
    } catch (err) {
        modalBody.innerHTML = `<div class="text-danger py-4">Không thể lấy tóm tắt AI. Vui lòng thử lại sau.</div>`;
    }
}

// --- EXPORT FUNCTIONS (CSV/EXCEL & PRINT) ---
function exportBooksCSV() {
    if (!state.books || state.books.length === 0) { showToast('Không có dữ liệu sách để xuất', 'warning'); return; }
    let csv = '\uFEFFMã Sách,Tên Sách,Tác Giả,Thể Loại,Nhà Xuất Bản,Năm XB,Tổng Số,Còn Lại,Vị Trí Kệ\n';
    state.books.forEach(b => {
        csv += `"${b.book_code}","${b.title.replace(/"/g, '""')}","${b.author}","${b.category_name}","${b.publisher}",${b.publish_year},${b.total_qty},${b.available_qty},"${b.rack_location}"\n`;
    });
    downloadFile(csv, `Danh_sach_Sach_Thuvien_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportReadersCSV() {
    if (!state.readers || state.readers.length === 0) { showToast('Không có dữ liệu độc giả để xuất', 'warning'); return; }
    let csv = '\uFEFFMã Thẻ,Họ Và Tên,Email,Số Điện Thoại,Loại Độc Giả,Trạng Thái,Ngày Cấp,Ngày Hết Hạn\n';
    state.readers.forEach(r => {
        csv += `"${r.reader_code}","${r.full_name}","${r.email}","${r.phone}","${r.card_type}","${r.status}","${r.issue_date}","${r.expiry_date}"\n`;
    });
    downloadFile(csv, `Danh_sach_Doc_Gia_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportLoansCSV() {
    if (!state.loans || state.loans.length === 0) { showToast('Không có dữ liệu phiếu mượn để xuất', 'warning'); return; }
    let csv = '\uFEFFMã Phiếu,Tên Độc Giả,Mã Độc Giả,Tên Sách,Ngày Mượn,Hạn Trả,Ngày Trả Thực Tế,Trạng Thái,Tiền Phạt\n';
    state.loans.forEach(l => {
        csv += `"${l.borrow_code}","${l.reader_name}","${l.reader_code}","${l.book_title.replace(/"/g, '""')}","${l.borrow_date}","${l.due_date}","${l.return_date || ''}","${l.status}",${l.fine_amount || 0}\n`;
    });
    downloadFile(csv, `Bao_Cao_Muon_Tra_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Đã xuất dữ liệu thành công: ${filename}`, 'success');
}

async function openPrintTicket(loanId) {
    const loan = state.loans.find(l => l.id === loanId);
    if (!loan) return;

    const printBody = document.getElementById('printAreaContent');
    printBody.innerHTML = `
        <div class="print-header">
            <h2>THƯ VIỆN TRƯỜNG HỌC / THƯ VIỆN THÔNG MINH AI</h2>
            <p>Địa chỉ: Đường Đại Học, Q. Cầu Giấy, Hà Nội | Hotline: 024.3838.9999</p>
            <h3 style="margin-top:15px; text-transform:uppercase;">PHIẾU XÁC NHẬN MƯỢN / TRẢ SÁCH</h3>
            <p><em>Mã phiếu: ${loan.borrow_code}</em></p>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr><td><strong>Độc giả:</strong> ${loan.reader_name} (${loan.reader_code})</td> <td><strong>Ngày mượn:</strong> ${loan.borrow_date}</td></tr>
            <tr><td><strong>SĐT:</strong> ${loan.reader_phone || '0901234567'}</td> <td><strong>Hạn trả sách:</strong> ${loan.due_date}</td></tr>
            <tr><td><strong>Tên sách mượn:</strong> ${loan.book_title}</td> <td><strong>Trạng thái:</strong> ${loan.status}</td></tr>
            <tr><td><strong>Vị trí kệ:</strong> Kệ A1-01</td> <td><strong>Tiền phạt (nếu quá hạn):</strong> ${(loan.fine_amount || 0).toLocaleString()} VNĐ</td></tr>
        </table>

        <p style="font-style:italic; font-size:0.9rem;">* Quy định: Độc giả giữ gìn sách cẩn thận, không làm rách hay đánh dấu vào sách. Trả sách quá hạn chịu phạt 5.000 VNĐ/ngày.</p>

        <div class="print-signatures">
            <div>
                <p><strong>NGƯỜI MƯỢN SÁCH</strong></p>
                <br><br><br>
                <p>${loan.reader_name}</p>
            </div>
            <div>
                <p><strong>THỦ THƯ XÁC NHẬN</strong></p>
                <br><br><br>
                <p>Thủ thư Mai</p>
            </div>
        </div>
    `;
    openModal('printModal');
}

async function openFullReportPrint() {
    await loadDashboardData();
    const printBody = document.getElementById('printAreaContent');
    const today = new Date().toLocaleDateString('vi-VN');

    printBody.innerHTML = `
        <div class="print-header">
            <h2>BÁO CÁO TỔNG QUAN HOẠT ĐỘNG THƯ VIỆN</h2>
            <p>Ngày lập báo cáo: ${today}</p>
        </div>

        <h3>1. Chỉ số Tổng quan</h3>
        <table class="print-table">
            <tr><th>Chỉ số</th><th>Số lượng</th></tr>
            <tr><td>Tổng số đầu sách trong kho</td><td>${document.getElementById('statTotalBooks').textContent}</td></tr>
            <tr><td>Tổng số độc giả đăng ký</td><td>${document.getElementById('statTotalReaders').textContent}</td></tr>
            <tr><td>Số phiếu mượn đang lưu hành</td><td>${document.getElementById('statActiveLoans').textContent}</td></tr>
            <tr><td>Số phiếu mượn quá hạn</td><td>${document.getElementById('statOverdueLoans').textContent}</td></tr>
            <tr><td>Tổng tiền phạt trễ hạn</td><td>${document.getElementById('statTotalFines').textContent}</td></tr>
        </table>

        <h3 style="margin-top:20px;">2. Danh sách Phiếu mượn Quá hạn cần xử lý</h3>
        ${document.getElementById('overdueTable').outerHTML}

        <div class="print-signatures">
            <div>
                <p><strong>NGƯỜI LẬP BÁO CÁO</strong></p>
                <br><br><br>
                <p>${state.currentUser ? state.currentUser.full_name : ''}</p>
            </div>
            <div>
                <p><strong>BAN GIÁM HIỆU / QUẢN LÝ</strong></p>
                <br><br><br>
                <p>(Ký & đóng dấu)</p>
            </div>
        </div>
    `;
    openModal('printModal');
}

// --- MODAL UTILS ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
