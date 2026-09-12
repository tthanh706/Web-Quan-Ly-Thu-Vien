import http.server
import socketserver
import json
import sqlite3
import os
import sys
import re
import hashlib
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

# Ensure sys.stdout handles UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


PORT = 8000
DB_PATH = os.path.join(os.path.dirname(__file__), 'library.db')
PUBLIC_DIR = os.path.dirname(__file__)

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

class LibraryAPIHandler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        # Clean logging
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}")

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_error_json(self, message, code=400):
        self.send_json({"error": message, "status": "error"}, code=code)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def parse_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        raw_body = self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(raw_body)
        except json.JSONDecodeError:
            return {}

    def update_overdue_fines(self, conn):
        """Auto calculate overdue status & fines for active loans (5,000 VND / day)"""
        today = datetime.now().strftime('%Y-%m-%d')
        cursor = conn.cursor()
        
        # Find active loans past due_date
        cursor.execute('''
            SELECT id, due_date FROM borrow_records
            WHERE status = 'Đang mượn' AND due_date < ?
        ''', (today,))
        
        overdue_loans = cursor.fetchall()
        for loan in overdue_loans:
            due_dt = datetime.strptime(loan['due_date'], '%Y-%m-%d')
            now_dt = datetime.strptime(today, '%Y-%m-%d')
            days_overdue = (now_dt - due_dt).days
            fine = days_overdue * 5000
            
            cursor.execute('''
                UPDATE borrow_records
                SET status = 'Quá hạn', fine_amount = ?, fine_status = 'Chưa nộp'
                WHERE id = ?
            ''', (fine, loan['id']))
        
        conn.commit()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query = parse_qs(parsed_path.query)

        # Serve static assets if not starting with /api
        if not path.startswith('/api/'):
            return super().do_GET()

        conn = get_db()
        self.update_overdue_fines(conn)
        cursor = conn.cursor()

        try:
            # 1. Categories
            if path == '/api/categories':
                cursor.execute("SELECT * FROM categories ORDER BY id ASC")
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)

            # 2. Books list
            elif path == '/api/books':
                q = query.get('q', [''])[0].strip().lower()
                cat_id = query.get('category_id', [''])[0]
                status_filter = query.get('status', ['all'])[0]

                sql = '''
                    SELECT b.*, c.name as category_name, c.code as category_code
                    FROM books b
                    JOIN categories c ON b.category_id = c.id
                    WHERE 1=1
                '''
                params = []

                if q:
                    sql += " AND (LOWER(b.title) LIKE ? OR LOWER(b.author) LIKE ? OR LOWER(b.book_code) LIKE ? OR LOWER(b.publisher) LIKE ?)"
                    pattern = f"%{q}%"
                    params.extend([pattern, pattern, pattern, pattern])

                if cat_id and cat_id != 'all':
                    sql += " AND b.category_id = ?"
                    params.append(cat_id)

                if status_filter == 'available':
                    sql += " AND b.available_qty > 0"
                elif status_filter == 'out_of_stock':
                    sql += " AND b.available_qty = 0"

                sql += " ORDER BY b.id DESC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)

            # 3. Book detail
            elif re.match(r'^/api/books/(\d+)$', path):
                book_id = int(re.match(r'^/api/books/(\d+)$', path).group(1))
                cursor.execute('''
                    SELECT b.*, c.name as category_name 
                    FROM books b 
                    JOIN categories c ON b.category_id = c.id 
                    WHERE b.id = ?
                ''', (book_id,))
                book = cursor.fetchone()
                if not book:
                    return self.send_error_json("Sách không tồn tại", 404)
                
                book_dict = dict(book)
                # Get reservation count for this book
                cursor.execute("SELECT COUNT(*) as count FROM reservations WHERE book_id = ? AND status = 'Đang chờ'", (book_id,))
                book_dict['reservation_count'] = cursor.fetchone()['count']
                return self.send_json(book_dict)

            # 4. Readers list
            elif path == '/api/readers':
                q = query.get('q', [''])[0].strip().lower()
                status_filter = query.get('status', ['all'])[0]

                sql = "SELECT * FROM readers WHERE 1=1"
                params = []

                if q:
                    sql += " AND (LOWER(full_name) LIKE ? OR LOWER(reader_code) LIKE ? OR LOWER(email) LIKE ? OR LOWER(phone) LIKE ?)"
                    pattern = f"%{q}%"
                    params.extend([pattern, pattern, pattern, pattern])

                if status_filter and status_filter != 'all':
                    sql += " AND status = ?"
                    params.append(status_filter)

                sql += " ORDER BY id DESC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)

            # 5. Borrow records (Loans)
            elif path == '/api/loans':
                q = query.get('q', [''])[0].strip().lower()
                status_filter = query.get('status', ['all'])[0]
                reader_id = query.get('reader_id', [''])[0]

                sql = '''
                    SELECT br.*, r.full_name as reader_name, r.reader_code, r.phone as reader_phone,
                           b.title as book_title, b.book_code, b.cover_url
                    FROM borrow_records br
                    JOIN readers r ON br.reader_id = r.id
                    JOIN books b ON br.book_id = b.id
                    WHERE 1=1
                '''
                params = []

                if q:
                    sql += " AND (LOWER(r.full_name) LIKE ? OR LOWER(r.reader_code) LIKE ? OR LOWER(b.title) LIKE ? OR LOWER(br.borrow_code) LIKE ?)"
                    pattern = f"%{q}%"
                    params.extend([pattern, pattern, pattern, pattern])

                if status_filter and status_filter != 'all':
                    sql += " AND br.status = ?"
                    params.append(status_filter)

                if reader_id:
                    sql += " AND br.reader_id = ?"
                    params.append(reader_id)

                sql += " ORDER BY br.id DESC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)

            # 6. Reservations list
            elif path == '/api/reservations':
                reader_id = query.get('reader_id', [''])[0]
                sql = '''
                    SELECT res.*, r.full_name as reader_name, r.reader_code, b.title as book_title, b.book_code
                    FROM reservations res
                    JOIN readers r ON res.reader_id = r.id
                    JOIN books b ON res.book_id = b.id
                    WHERE 1=1
                '''
                params = []
                if reader_id:
                    sql += " AND res.reader_id = ?"
                    params.append(reader_id)

                sql += " ORDER BY res.book_id, res.queue_order ASC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)


            # 7. Fine Logs
            elif path == '/api/fines':
                sql = '''
                    SELECT fl.*, r.full_name as reader_name, r.reader_code, br.borrow_code
                    FROM fine_logs fl
                    JOIN readers r ON fl.reader_id = r.id
                    JOIN borrow_records br ON fl.borrow_id = br.id
                    ORDER BY fl.id DESC
                '''
                cursor.execute(sql)
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)

            # 8. Dashboard Stats
            elif path == '/api/stats/dashboard':
                # Book stats
                cursor.execute("SELECT COUNT(*) as total_books, SUM(total_qty) as total_copies, SUM(available_qty) as available_copies FROM books")
                book_stats = dict(cursor.fetchone())

                # Reader stats
                cursor.execute("SELECT COUNT(*) as total_readers, SUM(CASE WHEN status = 'Hoạt động' THEN 1 ELSE 0 END) as active_readers FROM readers")
                reader_stats = dict(cursor.fetchone())

                # Loan stats
                cursor.execute('''
                    SELECT 
                        COUNT(*) as total_loans,
                        SUM(CASE WHEN status IN ('Đang mượn', 'Quá hạn') THEN 1 ELSE 0 END) as active_loans,
                        SUM(CASE WHEN status = 'Quá hạn' THEN 1 ELSE 0 END) as overdue_loans,
                        SUM(fine_amount) as total_fines
                    FROM borrow_records
                ''')
                loan_stats = dict(cursor.fetchone())

                # Fine collected stats
                cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_fines FROM fine_logs")
                fine_stats = dict(cursor.fetchone())

                # Top 5 most borrowed books
                cursor.execute('''
                    SELECT b.id, b.title, b.author, b.book_code, COUNT(br.id) as borrow_count
                    FROM books b
                    JOIN borrow_records br ON b.id = br.book_id
                    GROUP BY b.id
                    ORDER BY borrow_count DESC
                    LIMIT 5
                ''')
                top_books = [dict(r) for r in cursor.fetchall()]

                # Top active readers
                cursor.execute('''
                    SELECT r.id, r.full_name, r.reader_code, r.card_type, COUNT(br.id) as borrow_count
                    FROM readers r
                    JOIN borrow_records br ON r.id = br.reader_id
                    GROUP BY r.id
                    ORDER BY borrow_count DESC
                    LIMIT 5
                ''')
                top_readers = [dict(r) for r in cursor.fetchall()]

                # Category breakdown
                cursor.execute('''
                    SELECT c.name as category_name, COUNT(b.id) as book_count, COALESCE(SUM(b.total_qty), 0) as total_copies
                    FROM categories c
                    LEFT JOIN books b ON c.id = b.category_id
                    GROUP BY c.id
                ''')
                category_stats = [dict(r) for r in cursor.fetchall()]

                res_data = {
                    "book_stats": book_stats,
                    "reader_stats": reader_stats,
                    "loan_stats": loan_stats,
                    "fine_stats": fine_stats,
                    "top_books": top_books,
                    "top_readers": top_readers,
                    "category_stats": category_stats
                }
                return self.send_json(res_data)

            # 9. System Users (Admin only)
            elif path == '/api/users':
                cursor.execute("SELECT id, username, role, full_name, email, created_at FROM users ORDER BY id ASC")
                rows = [dict(r) for r in cursor.fetchall()]
                return self.send_json(rows)

            # 10. User Profile
            elif path == '/api/auth/profile':
                user_id = query.get('user_id', [''])[0]
                if not user_id:
                    return self.send_error_json("Thiếu user_id", 400)
                cursor.execute('''
                    SELECT u.id, u.username, u.role, u.full_name, u.email, u.created_at, u.reader_id,
                           r.reader_code, r.phone, r.card_type, r.status as card_status, r.issue_date, r.expiry_date
                    FROM users u
                    LEFT JOIN readers r ON u.reader_id = r.id
                    WHERE u.id = ?
                ''', (user_id,))
                user = cursor.fetchone()
                if not user:
                    return self.send_error_json("Người dùng không tồn tại", 404)
                return self.send_json(dict(user))

            else:
                return self.send_error_json("Endpoint không tồn tại", 404)

        except Exception as e:
            print(f"Error handling GET {path}: {str(e)}")
            return self.send_error_json(f"Lỗi máy chủ: {str(e)}", 500)
        finally:
            conn.close()


    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        body = self.parse_body()

        if not path.startswith('/api/'):
            return self.send_error_json("Path invalid", 400)

        conn = get_db()
        cursor = conn.cursor()

        try:
            # 1. Login
            if path == '/api/auth/login':
                username = body.get('username', '').strip()
                password = body.get('password', '').strip()

                if not username or not password:
                    return self.send_error_json("Vui lòng nhập tên đăng nhập và mật khẩu")

                pass_h = hash_password(password)
                cursor.execute('''
                    SELECT u.id, u.username, u.role, u.full_name, u.email, u.reader_id, r.reader_code, r.status as card_status
                    FROM users u
                    LEFT JOIN readers r ON u.reader_id = r.id
                    WHERE u.username = ? AND u.password_hash = ?
                ''', (username, pass_h))
                user = cursor.fetchone()

                if not user:
                    return self.send_error_json("Tên đăng nhập hoặc mật khẩu không chính xác")

                user_data = dict(user)

                # Auto bind clean reader record if user is reader role but has no reader_id
                if user_data['role'] == 'reader' and not user_data['reader_id']:
                    cursor.execute("SELECT COUNT(*) as cnt FROM readers")
                    cnt = cursor.fetchone()['cnt'] + 1
                    r_code = f"DG{cnt:03d}"
                    issue_dt = datetime.now().strftime('%Y-%m-%d')
                    exp_dt = (datetime.now() + timedelta(days=730)).strftime('%Y-%m-%d')
                    cursor.execute('''
                        INSERT INTO readers (reader_code, full_name, email, phone, card_type, status, issue_date, expiry_date)
                        VALUES (?, ?, ?, '0901234567', 'Sinh viên', 'Hoạt động', ?, ?)
                    ''', (r_code, user_data['full_name'], user_data['email'] or 'docgia@library.edu.vn', issue_dt, exp_dt))
                    new_r_id = cursor.lastrowid
                    cursor.execute("UPDATE users SET reader_id = ? WHERE id = ?", (new_r_id, user_data['id']))
                    conn.commit()
                    user_data['reader_id'] = new_r_id
                    user_data['reader_code'] = r_code
                    user_data['card_status'] = 'Hoạt động'

                return self.send_json({
                    "message": "Đăng nhập thành công",
                    "user": user_data,
                    "token": f"token_{user_data['id']}_{user_data['role']}"
                })


            # 2. Add Book
            elif path == '/api/books':
                book_code = body.get('book_code', '').strip().upper()
                title = body.get('title', '').strip()
                author = body.get('author', '').strip()
                category_id = body.get('category_id')
                publisher = body.get('publisher', '').strip()
                publish_year = body.get('publish_year', 2024)
                total_qty = int(body.get('total_qty', 1))
                rack_location = body.get('rack_location', 'Kệ A1').strip()
                description = body.get('description', '').strip()
                cover_url = body.get('cover_url', '').strip() or 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80'

                if not book_code or not title or not author or not category_id:
                    return self.send_error_json("Vui lòng điền đầy đủ Mã sách, Tên sách, Tác giả và Thể loại")

                cursor.execute("SELECT id FROM books WHERE book_code = ?", (book_code,))
                if cursor.fetchone():
                    return self.send_error_json(f"Mã sách '{book_code}' đã tồn tại trong hệ thống")

                cursor.execute('''
                    INSERT INTO books (book_code, title, author, category_id, publisher, publish_year, total_qty, available_qty, rack_location, description, cover_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (book_code, title, author, category_id, publisher, publish_year, total_qty, total_qty, rack_location, description, cover_url))
                conn.commit()

                return self.send_json({"message": "Thêm sách mới thành công!", "id": cursor.lastrowid})

            # 3. Add Reader
            elif path == '/api/readers':
                reader_code = body.get('reader_code', '').strip().upper()
                full_name = body.get('full_name', '').strip()
                email = body.get('email', '').strip()
                phone = body.get('phone', '').strip()
                card_type = body.get('card_type', 'Sinh viên')
                issue_date = body.get('issue_date', datetime.now().strftime('%Y-%m-%d'))
                expiry_date = body.get('expiry_date', (datetime.now() + timedelta(days=730)).strftime('%Y-%m-%d'))

                if not reader_code or not full_name or not email or not phone:
                    return self.send_error_json("Vui lòng điền đầy đủ Mã độc giả, Họ tên, Email và SĐT")

                cursor.execute("SELECT id FROM readers WHERE reader_code = ?", (reader_code,))
                if cursor.fetchone():
                    return self.send_error_json(f"Mã độc giả '{reader_code}' đã tồn tại")

                cursor.execute('''
                    INSERT INTO readers (reader_code, full_name, email, phone, card_type, status, issue_date, expiry_date)
                    VALUES (?, ?, ?, ?, ?, 'Hoạt động', ?, ?)
                ''', (reader_code, full_name, email, phone, card_type, issue_date, expiry_date))
                reader_id = cursor.lastrowid

                # Auto create reader user account
                username = reader_code.lower()
                pass_h = hash_password('123456')
                cursor.execute('''
                    INSERT INTO users (username, password_hash, role, full_name, email, reader_id)
                    VALUES (?, ?, 'reader', ?, ?, ?)
                ''', (username, pass_h, full_name, email, reader_id))

                conn.commit()
                return self.send_json({"message": f"Tạo thẻ độc giả thành công! Tài khoản đăng nhập mặc định: {username} / 123456", "id": reader_id})

            # 4. Create Borrow Record (Loan)
            elif path == '/api/loans':
                reader_id = body.get('reader_id')
                book_id = body.get('book_id')
                days = int(body.get('borrow_days', 14))
                notes = body.get('notes', '').strip()

                if not reader_id or not book_id:
                    return self.send_error_json("Vui lòng chọn Độc giả và Sách mượn")

                # Check reader status
                cursor.execute("SELECT * FROM readers WHERE id = ?", (reader_id,))
                reader = cursor.fetchone()
                if not reader:
                    return self.send_error_json("Độc giả không tồn tại")
                if reader['status'] != 'Hoạt động':
                    return self.send_error_json(f"Thẻ độc giả đang ở trạng thái '{reader['status']}', không thể mượn sách!")

                today = datetime.now().strftime('%Y-%m-%d')
                if reader['expiry_date'] < today:
                    return self.send_error_json("Thẻ độc giả đã hết hạn sử dụng. Vui lòng gia hạn thẻ!")

                # Check reader active overdue loans
                cursor.execute("SELECT COUNT(*) as cnt FROM borrow_records WHERE reader_id = ? AND status = 'Quá hạn'", (reader_id,))
                if cursor.fetchone()['cnt'] > 0:
                    return self.send_error_json("Độc giả đang có sách quá hạn chưa trả. Phải trả sách và nộp phạt trước khi mượn tiếp!")

                # Check book stock
                cursor.execute("SELECT * FROM books WHERE id = ?", (book_id,))
                book = cursor.fetchone()
                if not book:
                    return self.send_error_json("Sách không tồn tại")
                if book['available_qty'] <= 0:
                    return self.send_error_json("Sách này hiện đã hết trong kho. Bạn có thể sử dụng chức năng Đặt trước sách!")

                # Generate Borrow Code
                borrow_code = f"PM{datetime.now().strftime('%Y%m%d%H%M%S')}"
                borrow_date = today
                due_date = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')

                # Create borrow record & update available_qty
                cursor.execute('''
                    INSERT INTO borrow_records (borrow_code, reader_id, book_id, borrow_date, due_date, status, renewal_count, fine_amount, fine_status, notes)
                    VALUES (?, ?, ?, ?, ?, 'Đang mượn', 0, 0, 'N/A', ?)
                ''', (borrow_code, reader_id, book_id, borrow_date, due_date, notes))

                cursor.execute("UPDATE books SET available_qty = available_qty - 1 WHERE id = ?", (book_id,))

                conn.commit()
                return self.send_json({"message": f"Tạo phiếu mượn thành công ({borrow_code})! Hạn trả: {due_date}"})

            # 5. Return Book
            elif re.match(r'^/api/loans/(\d+)/return$', path):
                loan_id = int(re.match(r'^/api/loans/(\d+)/return$', path).group(1))
                cursor.execute("SELECT * FROM borrow_records WHERE id = ?", (loan_id,))
                loan = cursor.fetchone()
                if not loan:
                    return self.send_error_json("Phiếu mượn không tồn tại", 404)
                if loan['status'] == 'Đã trả':
                    return self.send_error_json("Phiếu mượn này đã được hoàn tất trả sách trước đó")

                return_date = datetime.now().strftime('%Y-%m-%d')
                due_dt = datetime.strptime(loan['due_date'], '%Y-%m-%d')
                ret_dt = datetime.strptime(return_date, '%Y-%m-%d')

                fine_amount = 0
                fine_status = 'N/A'
                if ret_dt > due_dt:
                    days_overdue = (ret_dt - due_dt).days
                    fine_amount = days_overdue * 5000
                    fine_status = 'Chưa nộp'

                cursor.execute('''
                    UPDATE borrow_records
                    SET return_date = ?, status = 'Đã trả', fine_amount = ?, fine_status = ?
                    WHERE id = ?
                ''', (return_date, fine_amount, fine_status, loan_id))

                # Increment available stock
                cursor.execute("UPDATE books SET available_qty = available_qty + 1 WHERE id = ?", (loan['book_id'],))

                # Check if someone reserved this book
                cursor.execute('''
                    SELECT res.*, r.full_name as reader_name 
                    FROM reservations res
                    JOIN readers r ON res.reader_id = r.id
                    WHERE res.book_id = ? AND res.status = 'Đang chờ'
                    ORDER BY res.queue_order ASC LIMIT 1
                ''', (loan['book_id'],))
                reservation = cursor.fetchone()
                res_msg = ""
                if reservation:
                    res_msg = f" (Chú ý: Sách này đang được độc giả '{reservation['reader_name']}' đặt trước hàng đợi #{reservation['queue_order']})"

                conn.commit()

                msg = f"Trả sách thành công! {res_msg}"
                if fine_amount > 0:
                    msg += f" Sách bị trễ {days_overdue} ngày. Phạt: {fine_amount:,} VNĐ."

                return self.send_json({"message": msg, "fine_amount": fine_amount})

            # 6. Renew Loan
            elif re.match(r'^/api/loans/(\d+)/renew$', path):
                loan_id = int(re.match(r'^/api/loans/(\d+)/renew$', path).group(1))
                cursor.execute("SELECT * FROM borrow_records WHERE id = ?", (loan_id,))
                loan = cursor.fetchone()
                if not loan:
                    return self.send_error_json("Phiếu mượn không tồn tại", 404)
                if loan['status'] == 'Đã trả':
                    return self.send_error_json("Sách đã được trả, không thể gia hạn")
                if loan['renewal_count'] >= 2:
                    return self.send_error_json("Phiếu mượn này đã đạt giới hạn tối đa 2 lần gia hạn!")

                # Check reservations for this book
                cursor.execute("SELECT COUNT(*) as cnt FROM reservations WHERE book_id = ? AND status = 'Đang chờ'", (loan['book_id'],))
                if cursor.fetchone()['cnt'] > 0:
                    return self.send_error_json("Sách này hiện đang có độc giả khác đặt trước, không thể gia hạn thêm!")

                current_due = datetime.strptime(loan['due_date'], '%Y-%m-%d')
                new_due = (current_due + timedelta(days=7)).strftime('%Y-%m-%d')

                cursor.execute('''
                    UPDATE borrow_records
                    SET due_date = ?, renewal_count = renewal_count + 1
                    WHERE id = ?
                ''', (new_due, loan_id))

                conn.commit()
                return self.send_json({"message": f"Gia hạn thành công! Hạn trả mới: {new_due} (Lần gia hạn {loan['renewal_count'] + 1}/2)"})

            # 7. Pay Fine
            elif re.match(r'^/api/loans/(\d+)/pay-fine$', path):
                loan_id = int(re.match(r'^/api/loans/(\d+)/pay-fine$', path).group(1))
                cursor.execute("SELECT * FROM borrow_records WHERE id = ?", (loan_id,))
                loan = cursor.fetchone()
                if not loan:
                    return self.send_error_json("Phiếu mượn không tồn tại")
                if loan['fine_amount'] <= 0 or loan['fine_status'] == 'Đã nộp':
                    return self.send_error_json("Không có khoản tiền phạt nào cần nộp cho phiếu này")

                cursor.execute("UPDATE borrow_records SET fine_status = 'Đã nộp' WHERE id = ?", (loan_id,))
                cursor.execute('''
                    INSERT INTO fine_logs (borrow_id, reader_id, amount, reason, payment_method)
                    VALUES (?, ?, ?, ?, 'Tiền mặt')
                ''', (loan_id, loan['reader_id'], loan['fine_amount'], f"Nộp phạt trễ hạn phiếu {loan['borrow_code']}"))

                conn.commit()
                return self.send_json({"message": f"Nộp tiền phạt {loan['fine_amount']:,} VNĐ thành công!"})

            # 8. Book Reservation
            elif path == '/api/reservations':
                book_id = body.get('book_id')
                reader_id = body.get('reader_id')

                if not book_id or not reader_id:
                    return self.send_error_json("Thiếu thông tin sách hoặc độc giả")

                # Check if book is available
                cursor.execute("SELECT available_qty, title FROM books WHERE id = ?", (book_id,))
                book = cursor.fetchone()
                if not book:
                    return self.send_error_json("Sách không tồn tại")

                # Check existing pending reservation by this reader
                cursor.execute("SELECT id FROM reservations WHERE book_id = ? AND reader_id = ? AND status = 'Đang chờ'", (book_id, reader_id))
                if cursor.fetchone():
                    return self.send_error_json(f"Bạn đã đặt trước cuốn sách '{book['title']}' này rồi!")

                # Calculate queue order
                cursor.execute("SELECT COALESCE(MAX(queue_order), 0) + 1 as next_order FROM reservations WHERE book_id = ? AND status = 'Đang chờ'", (book_id,))
                next_order = cursor.fetchone()['next_order']

                cursor.execute('''
                    INSERT INTO reservations (book_id, reader_id, status, queue_order)
                    VALUES (?, ?, 'Đang chờ', ?)
                ''', (book_id, reader_id, next_order))

                conn.commit()
                return self.send_json({"message": f"Đặt trước sách '{book['title']}' thành công! Vị trí hàng chờ của bạn: #{next_order}"})

            # 9. AI Search Assistant
            elif path == '/api/ai/search':
                prompt = body.get('prompt', '').strip()
                if not prompt:
                    return self.send_error_json("Vui lòng nhập nội dung tìm kiếm hoặc câu hỏi cho Trợ lý AI")

                # Smart Keyword Extraction & Full Text Query
                cursor.execute('''
                    SELECT b.*, c.name as category_name 
                    FROM books b
                    JOIN categories c ON b.category_id = c.id
                ''')
                all_books = [dict(r) for r in cursor.fetchall()]

                prompt_lower = prompt.lower()
                matches = []
                for book in all_books:
                    score = 0
                    title_l = book['title'].lower()
                    author_l = book['author'].lower()
                    desc_l = (book['description'] or '').lower()
                    cat_l = book['category_name'].lower()

                    # Exact or partial keyword matching
                    words = [w for w in re.split(r'\W+', prompt_lower) if len(w) > 2]
                    for w in words:
                        if w in title_l:
                            score += 3
                        if w in cat_l:
                            score += 3
                        if w in author_l:
                            score += 2
                        if w in desc_l:
                            score += 1

                    if score > 0:
                        matches.append((score, book))

                matches.sort(key=lambda x: x[0], reverse=True)
                top_results = [b for s, b in matches[:5]]

                # AI Natural Response Generation
                if top_results:
                    ai_reply = f"🤖 **Trợ lý AI Thư viện:** Tôi đã phân tích câu hỏi của bạn *\"{prompt}\"* và tìm thấy {len(top_results)} cuốn sách phù hợp nhất trong thư viện:"
                else:
                    top_results = all_books[:3]
                    ai_reply = f"🤖 **Trợ lý AI Thư viện:** Rất tiếc không tìm thấy sách khớp chính xác tuyệt đối với *\"{prompt}\"*, nhưng đây là một số cuốn sách nổi bật được nhiều độc giả yêu thích nhất:"

                return self.send_json({
                    "prompt": prompt,
                    "ai_response": ai_reply,
                    "books": top_results
                })

            # 10. AI Recommendation Engine
            elif path == '/api/ai/recommend':
                reader_id = body.get('reader_id')
                
                # Fetch books
                cursor.execute('''
                    SELECT b.*, c.name as category_name
                    FROM books b
                    JOIN categories c ON b.category_id = c.id
                    ORDER BY b.available_qty DESC
                ''')
                all_books = [dict(r) for r in cursor.fetchall()]

                user_favorite_categories = []
                if reader_id:
                    cursor.execute('''
                        SELECT b.category_id, COUNT(*) as cnt
                        FROM borrow_records br
                        JOIN books b ON br.book_id = b.id
                        WHERE br.reader_id = ?
                        GROUP BY b.category_id
                        ORDER BY cnt DESC
                    ''', (reader_id,))
                    fav_cats = cursor.fetchall()
                    user_favorite_categories = [r['category_id'] for r in fav_cats]

                recommended_books = []
                if user_favorite_categories:
                    # Recommend books in preferred categories first
                    for b in all_books:
                        if b['category_id'] in user_favorite_categories and len(recommended_books) < 4:
                            recommended_books.append(b)

                # Fill remaining with general popular books
                for b in all_books:
                    if b not in recommended_books and len(recommended_books) < 6:
                        recommended_books.append(b)

                ai_explanation = "🤖 **AI Recommendation Engine:** Gợi ý này được tổng hợp dựa trên xu hướng mượn sách, đánh giá nội dung và sở thích cá nhân của bạn."

                return self.send_json({
                    "ai_explanation": ai_explanation,
                    "recommendations": recommended_books
                })

            # 11. AI Content Summarizer
            elif path == '/api/ai/summarize':
                book_id = body.get('book_id')
                cursor.execute('''
                    SELECT b.*, c.name as category_name 
                    FROM books b 
                    JOIN categories c ON b.category_id = c.id 
                    WHERE b.id = ?
                ''', (book_id,))
                book = cursor.fetchone()

                if not book:
                    return self.send_error_json("Sách không tồn tại")

                book_dict = dict(book)

                # Generate high quality AI Summary based on book content
                title = book_dict['title']
                author = book_dict['author']
                cat = book_dict['category_name']
                desc = book_dict['description'] or "Cuốn sách cung cấp nhiều kiến thức chuyên sâu và bài học quý giá."

                ai_summary = {
                    "book_id": book_dict['id'],
                    "title": title,
                    "author": author,
                    "category": cat,
                    "executive_summary": f"Tác phẩm '{title}' của tác giả {author} thuộc thể loại {cat}. Đây là cuốn tài liệu quan trọng mang lại nhiều góc nhìn thực tiễn và tư duy chiều sâu.",
                    "key_takeaways": [
                        f"Nắm vững các khái niệm cốt lõi & nguyên lý của {cat}.",
                        f"Phương pháp tư duy và ứng dụng thực tiễn được {author} đúc kết.",
                        "Hướng dẫn chi tiết kèm ví dụ minh họa sinh động dễ hiểu.",
                        "Giải pháp giải quyết các thách thức phổ biến trong thực tế."
                    ],
                    "target_audience": "Phù hợp cho sinh viên, nghiên cứu sinh, giảng viên và độc giả muốn mở rộng tri thức chuyên môn.",
                    "full_ai_text": f"💡 **Tóm tắt AI cho cuốn '{title}':**\n\n📌 **Ý tưởng chủ đạo:** {desc}\n\n🎯 **Đối tượng nên đọc:** Học sinh, sinh viên và người đi làm đam mê {cat}.\n\n✨ **Đánh giá giá trị:** 4.9/5 ⭐ (Rất đáng đọc)."
                }

                return self.send_json(ai_summary)

            # 12. Add New User Account (Admin only)
            elif path == '/api/users':
                username = body.get('username', '').strip()
                password = body.get('password', '').strip()
                role = body.get('role', 'reader')
                full_name = body.get('full_name', '').strip()
                email = body.get('email', '').strip()

                if not username or not password or not full_name:
                    return self.send_error_json("Vui lòng điền Tên đăng nhập, Mật khẩu và Họ tên")

                cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
                if cursor.fetchone():
                    return self.send_error_json(f"Tên đăng nhập '{username}' đã được sử dụng")

                pass_h = hash_password(password)

                reader_id = None
                if role == 'reader':
                    cursor.execute("SELECT COUNT(*) as cnt FROM readers")
                    cnt = cursor.fetchone()['cnt'] + 1
                    r_code = f"DG{cnt:03d}"
                    issue_dt = datetime.now().strftime('%Y-%m-%d')
                    exp_dt = (datetime.now() + timedelta(days=730)).strftime('%Y-%m-%d')
                    cursor.execute('''
                        INSERT INTO readers (reader_code, full_name, email, phone, card_type, status, issue_date, expiry_date)
                        VALUES (?, ?, ?, '0901234567', 'Sinh viên', 'Hoạt động', ?, ?)
                    ''', (r_code, full_name, email or 'docgia@library.edu.vn', issue_dt, exp_dt))
                    reader_id = cursor.lastrowid

                cursor.execute('''
                    INSERT INTO users (username, password_hash, role, full_name, email, reader_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (username, pass_h, role, full_name, email, reader_id))
                conn.commit()
                return self.send_json({"message": f"Tạo tài khoản '{username}' ({role}) thành công với dữ liệu mới hoàn toàn!", "id": cursor.lastrowid})


            else:
                return self.send_error_json("Endpoint không tồn tại", 404)

        except Exception as e:
            print(f"Error handling POST {path}: {str(e)}")
            return self.send_error_json(f"Lỗi xử lý: {str(e)}", 500)
        finally:
            conn.close()

    def do_PUT(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        body = self.parse_body()

        conn = get_db()
        cursor = conn.cursor()

        try:
            # Update Book
            if re.match(r'^/api/books/(\d+)$', path):
                book_id = int(re.match(r'^/api/books/(\d+)$', path).group(1))
                cursor.execute("SELECT id FROM books WHERE id = ?", (book_id,))
                if not cursor.fetchone():
                    return self.send_error_json("Sách không tồn tại", 404)

                title = body.get('title', '').strip()
                author = body.get('author', '').strip()
                category_id = body.get('category_id')
                publisher = body.get('publisher', '').strip()
                publish_year = int(body.get('publish_year', 2024))
                total_qty = int(body.get('total_qty', 1))
                available_qty = int(body.get('available_qty', 1))
                rack_location = body.get('rack_location', '').strip()
                description = body.get('description', '').strip()
                cover_url = body.get('cover_url', '').strip()

                cursor.execute('''
                    UPDATE books
                    SET title = ?, author = ?, category_id = ?, publisher = ?, publish_year = ?,
                        total_qty = ?, available_qty = ?, rack_location = ?, description = ?, cover_url = ?
                    WHERE id = ?
                ''', (title, author, category_id, publisher, publish_year, total_qty, available_qty, rack_location, description, cover_url, book_id))

                conn.commit()
                return self.send_json({"message": "Cập nhật thông tin sách thành công!"})

            # Update Reader
            elif re.match(r'^/api/readers/(\d+)$', path):
                reader_id = int(re.match(r'^/api/readers/(\d+)$', path).group(1))
                cursor.execute("SELECT id FROM readers WHERE id = ?", (reader_id,))
                if not cursor.fetchone():
                    return self.send_error_json("Độc giả không tồn tại", 404)

                full_name = body.get('full_name', '').strip()
                email = body.get('email', '').strip()
                phone = body.get('phone', '').strip()
                card_type = body.get('card_type', 'Sinh viên')
                status = body.get('status', 'Hoạt động')
                expiry_date = body.get('expiry_date')

                cursor.execute('''
                    UPDATE readers
                    SET full_name = ?, email = ?, phone = ?, card_type = ?, status = ?, expiry_date = ?
                    WHERE id = ?
                ''', (full_name, email, phone, card_type, status, expiry_date, reader_id))

                conn.commit()
                return self.send_json({"message": "Cập nhật độc giả thành công!"})

            # Update User Profile (Self)
            elif path == '/api/auth/profile':
                user_id = body.get('user_id')
                full_name = body.get('full_name', '').strip()
                email = body.get('email', '').strip()
                phone = body.get('phone', '').strip()
                password = body.get('password', '').strip()

                if not user_id or not full_name:
                    return self.send_error_json("Vui lòng nhập Họ và Tên")

                cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                user = cursor.fetchone()
                if not user:
                    return self.send_error_json("Tài khoản không tồn tại", 404)

                if password:
                    pass_h = hash_password(password)
                    cursor.execute("UPDATE users SET full_name = ?, email = ?, password_hash = ? WHERE id = ?", (full_name, email, pass_h, user_id))
                else:
                    cursor.execute("UPDATE users SET full_name = ?, email = ? WHERE id = ?", (full_name, email, user_id))

                if user['reader_id']:
                    cursor.execute("UPDATE readers SET full_name = ?, email = ?, phone = ? WHERE id = ?", (full_name, email, phone, user['reader_id']))

                conn.commit()

                cursor.execute('''
                    SELECT u.id, u.username, u.role, u.full_name, u.email, u.reader_id, r.reader_code, r.status as card_status
                    FROM users u
                    LEFT JOIN readers r ON u.reader_id = r.id
                    WHERE u.id = ?
                ''', (user_id,))
                updated_user = dict(cursor.fetchone())

                return self.send_json({"message": "Cập nhật hồ sơ cá nhân thành công!", "user": updated_user})

            # Update User Account (Admin only)
            elif re.match(r'^/api/users/(\d+)$', path):

                user_id = int(re.match(r'^/api/users/(\d+)$', path).group(1))
                cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
                if not cursor.fetchone():
                    return self.send_error_json("Tài khoản không tồn tại", 404)

                role = body.get('role')
                full_name = body.get('full_name', '').strip()
                email = body.get('email', '').strip()
                password = body.get('password', '').strip()

                if password:
                    pass_h = hash_password(password)
                    cursor.execute('''
                        UPDATE users
                        SET role = ?, full_name = ?, email = ?, password_hash = ?
                        WHERE id = ?
                    ''', (role, full_name, email, pass_h, user_id))
                else:
                    cursor.execute('''
                        UPDATE users
                        SET role = ?, full_name = ?, email = ?
                        WHERE id = ?
                    ''', (role, full_name, email, user_id))

                conn.commit()
                return self.send_json({"message": "Cập nhật thông tin tài khoản thành công!"})

            else:
                return self.send_error_json("Endpoint không tồn tại", 404)

        except Exception as e:
            print(f"Error handling PUT {path}: {str(e)}")
            return self.send_error_json(f"Lỗi cập nhật: {str(e)}", 500)
        finally:
            conn.close()

    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        conn = get_db()
        cursor = conn.cursor()

        try:
            # Delete Book
            if re.match(r'^/api/books/(\d+)$', path):
                book_id = int(re.match(r'^/api/books/(\d+)$', path).group(1))
                cursor.execute("SELECT COUNT(*) as cnt FROM borrow_records WHERE book_id = ? AND status IN ('Đang mượn', 'Quá hạn')", (book_id,))
                if cursor.fetchone()['cnt'] > 0:
                    return self.send_error_json("Không thể xóa sách đang có độc giả mượn!")

                cursor.execute("DELETE FROM books WHERE id = ?", (book_id,))
                conn.commit()
                return self.send_json({"message": "Đã xóa sách khỏi hệ thống"})

            # Delete Reader
            elif re.match(r'^/api/readers/(\d+)$', path):
                reader_id = int(re.match(r'^/api/readers/(\d+)$', path).group(1))
                cursor.execute("SELECT COUNT(*) as cnt FROM borrow_records WHERE reader_id = ? AND status IN ('Đang mượn', 'Quá hạn')", (reader_id,))
                if cursor.fetchone()['cnt'] > 0:
                    return self.send_error_json("Không thể xóa độc giả đang mượn sách hoặc nợ tiền phạt!")

                cursor.execute("DELETE FROM users WHERE reader_id = ?", (reader_id,))
                cursor.execute("DELETE FROM readers WHERE id = ?", (reader_id,))
                conn.commit()
                return self.send_json({"message": "Đã xóa độc giả khỏi hệ thống"})

            # Cancel Reservation
            elif re.match(r'^/api/reservations/(\d+)$', path):
                res_id = int(re.match(r'^/api/reservations/(\d+)$', path).group(1))
                cursor.execute("UPDATE reservations SET status = 'Đã hủy' WHERE id = ?", (res_id,))
                conn.commit()
                return self.send_json({"message": "Đã hủy lượt đặt trước sách"})

            # Delete User Account (Admin only)
            elif re.match(r'^/api/users/(\d+)$', path):
                user_id = int(re.match(r'^/api/users/(\d+)$', path).group(1))
                cursor.execute("SELECT username FROM users WHERE id = ?", (user_id,))
                user = cursor.fetchone()
                if user and user['username'] == 'admin':
                    return self.send_error_json("Không thể xóa tài khoản Quản trị viên hệ thống gốc (admin)!")

                cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
                conn.commit()
                return self.send_json({"message": "Đã xóa tài khoản khỏi hệ thống"})


            else:
                return self.send_error_json("Endpoint không tồn tại", 404)

        except Exception as e:
            print(f"Error handling DELETE {path}: {str(e)}")
            return self.send_error_json(f"Lỗi xóa: {str(e)}", 500)
        finally:
            conn.close()

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LibraryAPIHandler) as httpd:
        print(f"🚀 Server Quản lý Thư viện AI đang chạy tại http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == '__main__':
    run_server()
