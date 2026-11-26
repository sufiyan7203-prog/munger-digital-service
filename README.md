# Munger Digital Services — Restaurant QR Ordering System

Restaurant ke liye QR based ordering app. Customer table ka QR scan karta hai, menu se dishes
cart me daalta hai aur order place karta hai. Order seedha owner dashboard par live aata hai,
jahan se status update hota hai (Naya → Ban raha → Served → Paid) aur aaj ki sale dikhti hai.

## Features

**Customer (`/`)**
- Table QR link: `/?table=01` — table khud detect ho jata hai (ya manually chunein / takeaway)
- Category filter + dish search, veg/non-veg mark, sold-out items disabled
- Cart bottom bar, quantity +/-, name/phone/note ke saath order place
- Order tracking page jo har 8 second me status refresh karta hai

**Owner (`/owner`)**
- PIN gate (default `1234`, `OWNER_PIN` env se badlein)
- Aaj ke orders live list (6s auto refresh) + status buttons
- Stats: aaj ke orders, active orders, sale, collected, average order value
- Menu management: dish on/off, price update, naya dish add
- Har table ka printable QR code

## Tech

- Node.js + Express 5, koi build step nahi (plain ES modules + static frontend)
- Data: `data/db.json` (atomic writes, koi native module nahi) — container restart par bhi bacha rehta hai
- QR codes server par `qrcode` se SVG ke roop me banti hain

## Run locally

```bash
npm install
npm start          # http://localhost:3000  |  owner: http://localhost:3000/owner
```

Optional env:

| Variable | Default | Use |
| --- | --- | --- |
| `PORT` | `3000` | Server port |
| `OWNER_PIN` | `1234` | Owner dashboard PIN — production me badlein |
| `DATA_DIR` | `./data` | JSON data file ka folder |
| `PUBLIC_URL` | request host | QR codes me jo URL daalna hai |
| `TZ` | `Asia/Kolkata` | "Aaj" ka hisaab |

## API

| Method | Path | Kaam |
| --- | --- | --- |
| `GET` | `/api/menu` | Menu + categories + restaurant settings |
| `POST` | `/api/orders` | Order place (server hi total calculate karta hai) |
| `GET` | `/api/orders/:code` | Customer ke liye order status |
| `GET` | `/api/qr/:table.svg` | Table ka QR (SVG) |
| `GET` | `/api/owner/orders` | Owner list (`?today=1`, `?status=new`) |
| `PATCH` | `/api/owner/orders/:id` | Status update (allowed transitions hi) |
| `GET` | `/api/owner/stats` | Aaj ke numbers + top items |
| `GET` | `/api/owner/tables` | Tables + QR links |
| `POST` / `PATCH` | `/api/owner/menu[/:id]` | Dish add / on-off / price |

Owner routes par `x-owner-pin` header chahiye.

## Docker

```bash
docker build -t munger-digital-service .
docker run -p 3000:3000 -e OWNER_PIN=4321 -v "$PWD/data:/app/data" munger-digital-service
```

## Notes

- Order history `data/db.json` me rehti hai (max 2000 orders). Hosting par persistent disk na ho to
  redeploy ke baad data reset ho jayega — menu `lib/seed.js` se wapas ban jata hai.
- Order placement rate-limited hai (per IP 15 orders / 5 min).
