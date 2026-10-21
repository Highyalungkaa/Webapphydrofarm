# 🥬 ระบบบริหารจัดการการปลูกผักไฮโดรโปนิกส์ + จองผักก่อนเก็บเกี่ยว (HydroFarm Pre-order)

เว็บแอปพลิเคชันสำหรับฟาร์มผักไฮโดรโปนิกส์แบบ **"ปลูกก่อน แล้วเปิดให้ลูกค้าสั่งจองล่วงหน้าก่อนเก็บเกี่ยว"** ลูกค้าสั่งจองผักสดได้หลายชนิดในออเดอร์เดียว เลือกมารับเองที่ฟาร์มหรือเลือกจัดส่งปกติ ชำระเงินเมื่อได้รับสินค้าสดใหม่เท่านั้น

---

## 🏗️ สถาปัตยกรรมระบบ (Tech Stack)

- **Frontend:** React 18 + Vite + Tailwind CSS + TypeScript (ออกแบบสไตล์ Mobile-first)
- **Backend API:** Node.js + Express + Zod + TypeScript
- **Database & Auth:** Supabase (PostgreSQL พร้อม Row Level Security (RLS) และ Google OAuth)
- **Timezone:** Asia/Bangkok
- **หน่วยสินค้า:** กิโลกรัม (ทศนิยมได้ ขั้นต่ำ 0.5 กก.)

---

## 📁 โครงสร้างโปรเจค (Project Structure)

```
WEBAPPHYDROFARM/
├── backend/                  # RESTful API (Express + TypeScript)
│   ├── src/
│   │   ├── config/           # Supabase Service Role client
│   │   ├── middlewares/      # JWT Auth, requireAdmin, RateLimiter
│   │   ├── routes/           # Customer & Admin API Endpoints
│   │   ├── services/         # Audit logging service
│   │   └── index.ts          # Server entry point
│   ├── .env.example
│   └── package.json
├── frontend/                 # Web Application (React + Vite + Tailwind)
│   ├── src/
│   │   ├── components/       # Layouts, Navbar, BottomNav, Badges
│   │   ├── context/          # AuthContext (Google OAuth), CartContext
│   │   ├── pages/
│   │   │   ├── customer/     # หน้าลูกค้า: หน้าร้าน, ตะกร้า, จอง, ออเดอร์, โปรไฟล์
│   │   │   └── admin/        # หลังบ้าน: แดชบอร์ด, รอบปลูก, ออเดอร์, แคตตาล็อก, ตั้งค่า
│   │   ├── lib/              # API Client & Supabase Client
│   │   └── types/            # TypeScript Interface definitions
│   ├── .env.example
│   └── package.json
└── supabase/
    └── migrations/           # SQL Migration Files
        ├── 001_initial_schema.sql         # ตารางทั้งหมด (UUID, timestamptz)
        ├── 002_functions_and_triggers.sql # create_order (Transaction), cancel_order, is_admin()
        ├── 003_rls_policies.sql          # Row Level Security ทุกตาราง
        └── 004_seed_data.sql             # ข้อมูลตัวอย่าง (อำเภอ, ผัก, รอบที่เปิดจอง)
```

---

## 🚀 ขั้นตอนการติดตั้งและรันระบบ

### 1. การตั้งค่า Supabase Database

1. ไปที่ [Supabase Dashboard](https://supabase.com) และสร้างโปรเจคใหม่
2. เปิดเมนู **SQL Editor** ใน Supabase แล้วรันไฟล์ Migration ตามลำดับ:
   1. `supabase/migrations/001_initial_schema.sql`
   2. `supabase/migrations/002_functions_and_triggers.sql`
   3. `supabase/migrations/003_rls_policies.sql`
   4. `supabase/migrations/004_seed_data.sql`
   5. `supabase/migrations/005_remove_districts_use_profile_address.sql` (สำหรับอัปเดตการจัดส่งโดยใช้ที่อยู่โปรไฟล์)
   - หากเป็นฐานข้อมูลเดิมที่รัน migration 001–010 แล้ว ให้รัน `supabase/migrations/011_manual_booking_close_time.sql` ด้วย เพื่อให้รอบจองไม่ต้องมีเวลาปิดล่วงหน้า
   - สำหรับร้านอุปกรณ์ปลูก ให้รัน `supabase/migrations/016_equipment_store.sql` หลัง migration เดิมทั้งหมด เพื่อสร้างตารางสินค้า สต็อก ประวัติ และคำสั่งซื้อ
   - ก่อนใช้วงจรการปลูก 8 ขั้นตอน ให้รัน `supabase/migrations/024_planting_start_step.sql` ใน SQL Editor เพื่อเพิ่ม “วันเริ่มปลูก” ระหว่างวันใส่ปุ๋ยกับวันปลูกจริง และปรับเลขขั้นตอนของรอบเดิม โดยวันเก็บเกี่ยวยังคำนวณจากวันปลูกจริง
   - รัน `supabase/migrations/025_remove_pickup_times.sql` เพื่อนำเวลารับเองออกจากฐานข้อมูล ลูกค้ายังเลือกมารับเองตามวันส่งมอบได้ โดยเส้นตายยกเลิกออเดอร์จะนับย้อนหลังจากเวลา 00:00 น. ของวันส่งมอบตามเวลาไทย
   - รัน `supabase/migrations/026_plot_multiple_crops.sql` เพื่อให้แต่ละแปลงกำหนดชนิดผักได้หลายชนิด โดยเก็บผักเดิมไว้ และใช้ความจุช่องปลูกร่วมกัน
   - รัน `supabase/migrations/027_round_item_plant_count.sql` ก่อนสร้างรอบปลูกด้วยจำนวนต้น ระบบเก็บจำนวนต้นจริงเพื่อคำนวณความจุ และคำนวณน้ำหนักเป็นจำนวนเต็มด้วยสูตรปัดลงจากจำนวนต้น ÷ จำนวนต้นต่อกิโลกรัม
   - รัน `supabase/migrations/028_equipment_transfer_payment.sql` เพื่อเพิ่มวิธีโอนเงินพร้อมสลิปสำหรับร้านอุปกรณ์ จากนั้นอัปโหลด QR Code หรือกรอกเลขบัญชี / เบอร์พร้อมเพย์ที่ **หลังบ้านอุปกรณ์ → ค่าส่ง / การชำระเงิน** ลูกค้าต้องแนบสลิปก่อนยืนยันออเดอร์ ร้านตรวจสอบแล้วจึงเปลี่ยนสถานะเป็นชำระแล้ว สลิปเก็บใน private bucket และเปิดผ่านลิงก์ชั่วคราวเฉพาะเจ้าของออเดอร์หรือแอดมิน
   - รัน `supabase/migrations/029_crop_images_svg_bucket.sql` เพื่อเตรียม bucket รูปภาพผักและรองรับไฟล์ SVG (หากยังไม่ได้รัน migration 023 ไฟล์นี้จะสร้าง bucket ให้)
   - รัน `supabase/migrations/030_protect_orders_and_payment_completion.sql` เพื่อปิด RPC จอง/ยกเลิกออเดอร์จากการเรียกตรงของผู้ใช้ ป้องกันผักซ้ำในออเดอร์ และกำหนดให้รับชำระก่อนปิดออเดอร์เป็นสำเร็จ (ออเดอร์เก่าไม่ถูกเปลี่ยนข้อมูล)
3. เปิดใช้งาน **Google OAuth** ใน Supabase:
   - ไปที่ `Authentication` → `Providers` → `Google` → เปิด Enabled
   - กรอก Google Client ID และ Secret (จาก Google Cloud Console)
   - เพิ่ม Redirect URL: `http://localhost:5173` ใน Site URL / Redirect URLs
4. **กำหนดสิทธิ์แอดมิน:**
   - เพิ่มอีเมล Google ของคุณในตาราง `admin_users` เพื่อให้สามารถเข้าหน้า `/admin` ได้:
     ```sql
     INSERT INTO admin_users (email) VALUES ('your-email@gmail.com');
     ```

---

### 2. การตั้งค่าและรัน Backend

1. เข้าโฟลเดอร์ `backend`:
   ```bash
   cd backend
   ```
2. คัดลอกไฟล์ Environment:
   ```bash
   cp .env.example .env
   ```
3. แก้ไขค่าใน `.env`:
   ```env
   PORT=4000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   CLIENT_ORIGIN=http://localhost:5173
   ```
4. ติดตั้งแพ็กเกจ (หากยังไม่ได้ติดตั้ง):
   ```bash
   npm install
   ```
5. รันเซิร์ฟเวอร์โหมด Development:
   ```bash
   npm run dev
   ```
   *(Backend จะเปิดทำงานที่ `http://localhost:4000`)*

---

### 3. การตั้งค่าและรัน Frontend

1. เข้าโฟลเดอร์ `frontend`:
   ```bash
   cd frontend
   ```
2. คัดลอกไฟล์ Environment:
   ```bash
   cp .env.example .env
   ```
3. แก้ไขค่าใน `.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_API_URL=http://localhost:4000/api
   ```
4. ติดตั้งแพ็กเกจ (หากยังไม่ได้ติดตั้ง):
   ```bash
   npm install
   ```
5. รันเซิร์ฟเวอร์ Vite:
   ```bash
   npm run dev
   ```
   *(เปิดเบราว์เซอร์เข้าใช้งานที่ `http://localhost:5173`)*

---

## 🧪 การทดสอบเกณฑ์ผ่านของเฟส 1 (Phase 1 Acceptance Criteria)

| การทดสอบ | ผลการทำงาน |
|---|---|
| **1. ป้องกันการขายเกิน (Atomic Transaction)** | ฟังก์ชัน PostgreSQL `create_order` ทำการล็อกแถว `round_items` ด้วยคำสั่ง `SELECT ... FOR UPDATE` คำนวณสต็อกคงเหลือแบบเรียลไทม์ และ reject ทันทีหากยอดจองเกิน `bookable_qty_kg` |
| **2. ความปลอดภัยและการเข้าถึงข้อมูล (RLS)** | มี Row Level Security ครบทุกตาราง ลูกค้าทั่วไปเข้าดูได้เฉพาะโปรไฟล์และออเดอร์ของตนเอง |
| **3. สิทธิ์ผู้ดูแลระบบ (Admin Role)** | ฟังก์ชัน `is_admin()` ตรวจสอบอีเมลจากตาราง `admin_users` ทั้งใน PostgreSQL และ API Middleware (`requireAdmin`) ผู้ที่ไม่มีสิทธิ์จะไม่สามารถเข้า `/admin` หรือเรียก API แอดมินได้ |
| **4. ข้อมูลการจัดส่งและที่อยู่ลูกค้า** | ใช้ข้อมูลที่อยู่จัดส่งจากหน้าข้อมูลส่วนตัว (Profile) อัตโนมัติ พร้อมรองรับการแก้ไขที่อยู่เฉพาะออเดอร์และการบันทึกกลับลงโปรไฟล์ |
| **5. การบันทึกประวัติ (Audit Logs)** | ทุกการแก้ไขรอบการปลูก, ราคา, สต็อก, สถานะออเดอร์, การชำระเงิน, และการตั้งค่า จะถูกบันทึกลงตาราง `audit_logs` พร้อมข้อมูลเดิมและข้อมูลใหม่ |

---

## 📌 แผนการพัฒนาในเฟสถัดไป

- **เฟส 2 (ปฏิบัติการจริง):** บันทึกผลผลิตจริงหลังเก็บเกี่ยว (`actual_qty_kg`), คำนวณรายการที่ขาด, ระบบบันทึกการซื้อผักจากเจ้าอื่นมาทดแทนต่อรายการ (`order_items.fulfillment_source`), คำนวณต้นทุนการทดแทน, และระบบจัดการออเดอร์ใหญ่/การเลื่อนวันเก็บเกี่ยว
- **เฟส 3 (ปรับแต่ง):** โควตารายใหญ่, รายงานสรุปยอดขาย, และระบบแจ้งเตือนทางอีเมล
