require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { google } = require("googleapis");

const { GOOGLE_CLIENT_ID, SHEET_ID, SESSION_SECRET, SA_JSON_B64, CONTACT_EMAIL = "", PORT = 3000 } = process.env;
const TAB = process.env.SHEET_TAB || "reports";
const PROD = process.env.NODE_ENV === "production";
for (const k of ["GOOGLE_CLIENT_ID", "SHEET_ID", "SESSION_SECRET", "SA_JSON_B64"]) {
  if (!process.env[k]) { console.error(`Thiếu biến môi trường ${k}`); process.exit(1); }
}

const oauth = new OAuth2Client(GOOGLE_CLIENT_ID);
const sheets = google.sheets({
  version: "v4",
  auth: new google.auth.GoogleAuth({
    credentials: JSON.parse(Buffer.from(SA_JSON_B64, "base64").toString()),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  }),
});

// Thứ tự cột phải khớp hàng 1 của tab "reports" trong Google Sheet
const COLS = ["id","ten","mat_hang","quan","dia_chi","lat","lng","gio_ban","ghi_chu","xac_minh","duyet","nguoi_gui","thoi_gian","image"];
const PUBLIC = COLS.filter(c => !["nguoi_gui", "thoi_gian", "duyet"].includes(c));

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

function requireAuth(req, res, next) {
  try { req.user = jwt.verify(req.cookies.sid, SESSION_SECRET); next(); }
  catch { res.status(401).json({ error: "Cần đăng nhập" }); }
}

app.get("/api/config", (_req, res) => res.json({ clientId: GOOGLE_CLIENT_ID }));

app.post("/api/login", rateLimit({ windowMs: 15 * 60e3, max: 30 }), async (req, res) => {
  try {
    const t = await oauth.verifyIdToken({ idToken: req.body.credential, audience: GOOGLE_CLIENT_ID });
    const p = t.getPayload();
    if (!p.email_verified) return res.status(403).json({ error: "Email chưa xác minh" });
    const sid = jwt.sign({ email: p.email, name: p.name || "" }, SESSION_SECRET, { expiresIn: "7d" });
    res.cookie("sid", sid, { httpOnly: true, sameSite: "lax", secure: PROD, maxAge: 7 * 864e5 });
    res.json({ email: p.email, name: p.name });
  } catch { res.status(401).json({ error: "Đăng nhập không hợp lệ" }); }
});

app.post("/api/logout", (_req, res) => { res.clearCookie("sid"); res.json({ ok: true }); });
app.get("/api/me", requireAuth, (req, res) => res.json({ email: req.user.email, name: req.user.name }));

// Bản đồ: trả các dòng đã duyệt (duyet = x), cộng với các dòng do chính tài khoản này gửi (đang chờ duyệt)
let cache = { at: 0, rows: [] };
app.get("/api/points", async (req, res) => {
  try {
    let currentUserEmail = null;
    try {
      if (req.cookies.sid) {
        const u = jwt.verify(req.cookies.sid, SESSION_SECRET);
        currentUserEmail = u.email;
      }
    } catch {}

    if (Date.now() - cache.at > 20e3) {
      const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:N` });
      cache = {
        at: Date.now(),
        rows: (r.data.values || []).map(v => Object.fromEntries(COLS.map((c, i) => [c, v[i] || ""]))),
      };
    }

    const data = cache.rows
      .filter(o => {
        const hasCoords = !isNaN(parseFloat(o.lat)) && !isNaN(parseFloat(o.lng));
        if (!hasCoords) return false;
        const isApproved = o.duyet.toLowerCase() === "x";
        const isMine = currentUserEmail && o.nguoi_gui === currentUserEmail;
        return isApproved || isMine;
      })
      .map(o => ({
        ...Object.fromEntries(PUBLIC.map(c => [c, o[c]])),
        cho_duyet: o.duyet.toLowerCase() !== "x",
      }));

    res.json(data);
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Không đọc được dữ liệu" }); }
});

// Đổi toạ độ → địa chỉ chữ (OpenStreetMap Nominatim, ~1 request/giây). Kết quả chỉ để tham khảo, người duyệt sẽ sửa lại.
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=vi&zoom=18&lat=${lat}&lon=${lng}`,
      { headers: { "User-Agent": `ganh-muu-sinh-hanoi/1.0 (${CONTACT_EMAIL})` } }
    );
    const a = (await r.json()).address || {};
    return {
      dia_chi: [a.house_number, a.road, a.suburb || a.quarter].filter(Boolean).join(", "),
      quan: a.city_district || a.district || a.county || "",
    };
  } catch { return { dia_chi: "", quan: "" }; }
}

const HANOI_DISTRICTS = {
  "hoàn kiếm": { lat: "21.028500", lng: "105.854200", quan: "Hoàn Kiếm" },
  "ba đình": { lat: "21.034100", lng: "105.823900", quan: "Ba Đình" },
  "đống đa": { lat: "21.018100", lng: "105.829900", quan: "Đống Đa" },
  "hai bà trưng": { lat: "21.006900", lng: "105.852400", quan: "Hai Bà Trưng" },
  "cầu giấy": { lat: "21.033300", lng: "105.793900", quan: "Cầu Giấy" },
  "tây hồ": { lat: "21.071900", lng: "105.819400", quan: "Tây Hồ" },
  "thanh xuân": { lat: "20.993700", lng: "105.811400", quan: "Thanh Xuân" },
  "hoàng mai": { lat: "20.976500", lng: "105.856000", quan: "Hoàng Mai" },
  "long biên": { lat: "21.036500", lng: "105.892400", quan: "Long Biên" },
  "nam từ liêm": { lat: "21.015200", lng: "105.765400", quan: "Nam Từ Liêm" },
  "bắc từ liêm": { lat: "21.064500", lng: "105.756200", quan: "Bắc Từ Liêm" },
  "hà đông": { lat: "20.971500", lng: "105.776600", quan: "Hà Đông" },
};

// Đổi địa chỉ chữ → toạ độ (forward geocoding OpenStreetMap Nominatim)
async function forwardGeocode(query) {
  try {
    const q = encodeURIComponent(query.toLowerCase().includes("hà nội") ? query : `${query}, Hà Nội, Việt Nam`);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=vi&q=${q}&limit=1`,
      { headers: { "User-Agent": `ganh-muu-sinh-hanoi/1.0 (${CONTACT_EMAIL})` } }
    );
    const list = await r.json();
    if (Array.isArray(list) && list.length > 0) {
      const item = list[0];
      const flat = parseFloat(item.lat), flng = parseFloat(item.lon);
      if (flat > 20.5 && flat < 21.45 && flng > 105.2 && flng < 106.1) {
        return { lat: flat.toFixed(6), lng: flng.toFixed(6) };
      }
    }
  } catch (e) { console.error("Lỗi forward geocode:", e.message); }

  // Fallback: Tìm theo tên quận trong chuỗi địa chỉ
  const lower = query.toLowerCase();
  for (const [distName, data] of Object.entries(HANOI_DISTRICTS)) {
    if (lower.includes(distName)) {
      return { lat: data.lat, lng: data.lng, quan: data.quan };
    }
  }

  // Fallback cuối cùng: Tâm Hà Nội
  return { lat: "21.028500", lng: "105.854200", quan: "Hà Nội" };
}

app.post("/api/report", requireAuth, rateLimit({ windowMs: 3600e3, max: 10 }), async (req, res) => {
  const b = req.body || {};
  let lat = Number(b.lat), lng = Number(b.lng);
  const ten = clean(b.ten, 80), mat_hang = clean(b.mat_hang, 120);
  const dia_chi_nhap = clean(b.dia_chi, 150);

  if (!ten || !mat_hang) return res.status(400).json({ error: "Cần tên gánh và món bán" });
  if (b.consent !== true) return res.status(400).json({ error: "Cần xác nhận người bán đồng ý đăng thông tin" });

  const hasValidGps = !isNaN(lat) && !isNaN(lng) && lat > 20.5 && lat < 21.45 && lng > 105.2 && lng < 106.1;

  if (!hasValidGps && !dia_chi_nhap) {
    return res.status(400).json({ error: "Cần lấy vị trí GPS hoặc nhập địa chỉ gánh hàng" });
  }

  let finalLat = "", finalLng = "", finalDiaChi = dia_chi_nhap, finalQuan = "";

  if (hasValidGps) {
    finalLat = lat.toFixed(6);
    finalLng = lng.toFixed(6);
    const geo = await reverseGeocode(lat, lng);
    finalQuan = geo.quan || "";
    finalDiaChi = dia_chi_nhap || geo.dia_chi || "";
  } else {
    // Không có GPS: tìm toạ độ từ địa chỉ chữ (có fallback quận và trung tâm Hà Nội)
    const fgeo = await forwardGeocode(dia_chi_nhap);
    if (fgeo) {
      finalLat = fgeo.lat;
      finalLng = fgeo.lng;
      finalQuan = fgeo.quan || "";
    }
  }

  const image = typeof b.image === "string" && b.image.startsWith("data:image/") ? b.image.slice(0, 48000) : "";

  const o = {
    id: crypto.randomBytes(4).toString("hex"),
    ten,
    mat_hang,
    quan: finalQuan,
    dia_chi: finalDiaChi,
    lat: finalLat,
    lng: finalLng,
    gio_ban: clean(b.gio_ban, 40),
    ghi_chu: clean(b.ghi_chu, 300),
    xac_minh: new Date().toISOString().slice(0, 10),
    duyet: "",
    nguoi_gui: req.user.email,
    thoi_gian: new Date().toISOString(),
    image,
  };

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${TAB}!A1`,
      valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [COLS.map(c => o[c])] },
    });
    // Xoá cache để dữ liệu mới cập nhật tức thì
    cache.at = 0;
    res.json({
      ok: true,
      id: o.id,
      ten: o.ten,
      mat_hang: o.mat_hang,
      quan: o.quan,
      dia_chi: o.dia_chi,
      lat: o.lat,
      lng: o.lng,
      gio_ban: o.gio_ban,
      ghi_chu: o.ghi_chu,
      xac_minh: o.xac_minh,
      image: o.image,
      cho_duyet: true
    });
  } catch (e) { console.error(e.message); res.status(500).json({ error: "Không ghi được vào Google Sheet" }); }
});

app.listen(PORT, () => console.log(`Chạy tại cổng ${PORT}`));
