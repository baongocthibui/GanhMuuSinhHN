# Gánh Mưu Sinh Hà Nội

Bản đồ cộng đồng ghi nhận và chia sẻ vị trí các gánh hàng rong, quán ăn của những người lớn tuổi, người có hoàn cảnh khó khăn trên địa bàn Hà Nội nhằm giúp mọi người dễ dàng ghé thăm và ủng hộ.

---

## 🎯 Cách hoạt động

1. **Xác thực an toàn:** Người dùng đăng nhập bằng tài khoản Google (OAuth 2.0). Backend xác minh và cấp phiên đăng nhập qua cookie HTTP-Only với hạn 7 ngày. Người dùng không cần đăng ký tài khoản hay lưu mật khẩu.
2. **Định vị chính xác:** 
   - Trên điện thoại / trình duyệt, người dùng đứng cạnh gánh hàng và nhấn **"Lấy vị trí của tôi"**.
   - Ứng dụng hiển thị độ chính xác (sai số GPS tính bằng mét) và hiển thị cảnh báo nếu sai số vượt quá 50 m.
3. **Gửi thông tin:** 
   - Nhập tên gánh, món bán, giờ bán (tùy chọn), ghi chú (tùy chọn).
   - Bắt buộc tích xác nhận người bán đã đồng ý chia sẻ thông tin.
4. **Xử lý phía Backend:**
   - Kiểm tra toạ độ nằm trong phạm vi địa lý Hà Nội.
   - Tự động chuyển đổi toạ độ (lat/lng) sang địa chỉ và quận tương ứng thông qua OpenStreetMap Nominatim.
   - Ghi dữ liệu trực tiếp vào một dòng mới trong Google Sheet. Địa chỉ này chỉ mang tính tham khảo và người quản trị có thể hiệu chỉnh lại.
5. **Cơ chế duyệt & bảo mật thông tin:**
   - Bản đồ công khai chỉ hiển thị những gánh hàng đã có chữ `x` ở cột `duyet` trong Google Sheet. Các báo cáo mới gửi sẽ ở trạng thái chờ duyệt, ngăn chặn việc ghim bừa bãi.
   - Email người gửi được lưu lại trong Sheet để kiểm soát nhưng **tuyệt đối không trả về** cho người xem bản đồ.

---

## 📁 Cấu trúc dự án

```text
gánh mưu sinh Hà Nội/
├── public/               # Chứa giao diện web tĩnh
│   └── index.html        # Giao diện người dùng & Bản đồ Leaflet
├── .env.example          # Mẫu khai báo các biến môi trường
├── .gitignore            # Bỏ qua node_modules, .env, file khoá JSON
├── package.json          # Danh sách thư viện và script
├── README.md             # Tài liệu hướng dẫn sử dụng và cài đặt
└── server.js             # Backend Express & tích hợp Google APIs
```

---

## 🛠️ Hướng dẫn cài đặt từng bước

### Bước 1: Tạo Google Sheet
1. Tạo một bảng tính mới trên Google Sheets.
2. Đổi tên tab (sheet) đầu tiên thành: `reports` (viết thường).
3. Tại **Hàng 1**, điền chính xác 14 tên cột sau từ cột `A` đến cột `N`:
   ```text
   id | ten | mat_hang | quan | dia_chi | lat | lng | gio_ban | ghi_chu | xac_minh | duyet | nguoi_gui | thoi_gian | image
   ```
4. Lấy `SHEET_ID`: Nhìn vào đường dẫn trên thanh trình duyệt:
   `https://docs.google.com/spreadsheets/d/`**`[SHEET_ID_Ở_ĐÂY]`**`/edit`
https://docs.google.com/spreadsheets/d/1AXVvn44bKfXc4bvbdS29_BHMx9B-BJEJyCphAqtXVQ0/edit?gid=0#gid=0
---

### Bước 2: Thiết lập Google Cloud & Service Account
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một Project mới (hoặc chọn project có sẵn).
3. Vào **APIs & Services** > **Library**, tìm kiếm **Google Sheets API** và bấm **Enable** (Bật).
4. Vào **APIs & Services** > **Credentials** > **Create Credentials** > chọn **Service Account**:
   - Đặt tên (ví dụ: `sheets-writer`), bấm **Create and Continue**, sau đó chọn **Done**.
5. Nhấp vào Service Account vừa tạo, chuyển sang tab **Keys** > **Add Key** > **Create new key** > chọn định dạng **JSON** rồi tải file về máy (ví dụ lưu tên `key.json`).
6. **Cấp quyền truy cập Google Sheet:**
   - Mở file Google Sheet vừa tạo ở Bước 1.
   - Bấm nút **Chia sẻ** (Share) ở góc trên bên phải.
   - Dán địa chỉ email của Service Account (dạng `...@...iam.gserviceaccount.com`).
   - Chọn quyền **Editor** (Người chỉnh sửa) và lưu lại.

---

### Bước 3: Tạo Google OAuth Client ID
1. Trong Google Cloud Console, vào mục **OAuth consent screen**:
   - Chọn loại **External**, điền tên ứng dụng và email liên hệ, sau đó hoàn tất lưu.
2. Vào **Credentials** > **Create Credentials** > chọn **OAuth Client ID**:
   - **Application type:** chọn **Web application**.
   - **Name:** Đặt tên tuỳ ý (ví dụ: `Ganh Muu Sinh Client`).
   - **Authorized JavaScript origins:**
     - Khi chạy trên máy cá nhân: `http://localhost:3000`
     - Khi deploy: `https://ten-ung-dung.onrender.com` (hoặc domain riêng của bạn).
3. Bấm **Create** và sao chép mã **Client ID** (có đuôi `.apps.googleusercontent.com`).

---

### Bước 4: Cấu hình biến môi trường (`.env`)
Sao chép file mẫu:
```bash
cp .env.example .env
```
*(Trên Windows PowerShell: `Copy-Item .env.example .env`)*

Chỉnh sửa file `.env` với các giá trị thực tế:

```env
# Mã OAuth Client ID lấy từ Bước 3
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com

# ID của Google Sheet lấy từ Bước 1
SHEET_ID=xxxxxxxxxxxxxxxxxxxxxxxxx

# Tên tab chứa dữ liệu
SHEET_TAB=reports

# Chuỗi ngẫu nhiên dài dùng để mã hoá cookie phiên đăng nhập
SESSION_SECRET=chuoi_bi_mat_ngau_nhien_dai_32_ky_tu

# File JSON của service account mã hoá Base64 thành 1 dòng duy nhất
SA_JSON_B64=

# Email liên hệ của bạn (gửi kèm header khi gọi OpenStreetMap Nominatim)
CONTACT_EMAIL=email_cua_ban@example.com
```

> 💡 **Mẹo lấy chuỗi `SESSION_SECRET`:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

> 💡 **Mẹo mã hoá file `key.json` thành chuỗi Base64 (`SA_JSON_B64`):**
> - **Cách chạy được trên mọi hệ điều hành (Windows, Mac, Linux):**
>   ```bash
>   node -e "console.log(require('fs').readFileSync('key.json').toString('base64'))"
>   ```
> - **Trên Linux / macOS terminal:**
>   ```bash
>   base64 -w0 key.json
>   ```

---

### Bước 5: Cài đặt và khởi chạy dự án

1. **Cài đặt dependencies:**
   ```bash
   npm install
   ```
   *(Trên Windows nếu gặp lỗi ExecutionPolicy với npm, chạy `npm.cmd install`)*

2. **Chạy server phát triển:**
   ```bash
   npm start
   ```

3. Mở trình duyệt và truy cập: [http://localhost:3000](http://localhost:3000)

---

## 🚀 Triển khai lên Production (Render / Railway)

Do dự án cần chạy backend Node.js để tương tác bảo mật với Google Sheets API và OpenStreetMap, **không thể deploy trực tiếp qua GitHub Pages**. Bạn có thể deploy miễn phí hoặc giá rẻ lên **Render** hoặc **Railway**:

1. Đẩy code lên GitHub (chú ý: `.env` và file `key.json` đã được `.gitignore` bảo vệ, không bao giờ đẩy lên repo công khai).
2. Tạo Web Service mới trên Render/Railway kết nối với repo GitHub.
3. Cấu hình lệnh:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Trong phần **Environment Variables**, khai báo đầy đủ các biến:
   - `NODE_ENV`: `production`
   - `GOOGLE_CLIENT_ID`: `<Client ID của bạn>`
   - `SHEET_ID`: `<Sheet ID>`
   - `SHEET_TAB`: `reports`
   - `SESSION_SECRET`: `<Chuỗi secret ngẫu nhiên>`
   - `SA_JSON_B64`: `<Chuỗi base64 của key.json>`
   - `CONTACT_EMAIL`: `<Email liên hệ>`
5. Sau khi có domain dạng `https://ten-ung-dung.onrender.com`, vào lại **Google Cloud Console > Credentials > OAuth Client ID** và thêm domain này vào **Authorized JavaScript origins**.

---

## 📋 Quy trình duyệt thông tin gánh hàng

1. Người dùng gửi báo cáo từ trang web. Dữ liệu lập tức xuất hiện ở hàng mới nhất trên Google Sheet với cột `duyet` đang để trống.
2. Quản trị viên mở Google Sheet, kiểm tra:
   - Tên gánh, món bán, giờ bán.
   - Xem địa chỉ chữ được tự động nhận diện từ OpenStreetMap, sửa lại cho chuẩn xác nếu cần (ví dụ: bổ sung số nhà, ngõ ngách).
3. Khi thông tin đã chuẩn và xác nhận hợp lệ: **Điền chữ `x` vào cột `duyet`**.
4. Trong vòng tối đa 60 giây (do cơ chế cache giảm tải API), gánh hàng sẽ xuất hiện trực tiếp trên bản đồ công khai.
