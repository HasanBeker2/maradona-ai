# Maradona — Tam Kurulum ve Production Kılavuzu

> Bu belge: yeni bir müşteri için sıfırdan kurulum, bilinen tuzaklar ve çözümleri,
> Hostinger VPS'e production deploy ve maliyet tahmini.

---

## 1. SİSTEM MİMARİSİ (Özet)

```
Müşteri WhatsApp'ı  →  Meta Cloud API  →  Webhook (bu sunucu)
                                                ↓
                                         Claude AI (intent/task extraction)
                                                ↓
                                         Basecamp API (todo oluştur)
                                                ↓
                                    WhatsApp'a onay mesajı gönder
```

**Tetikleyici kelime:** "Maradona" (mesajın herhangi bir yerinde geçmeli)

**Komutlar:**
- `Maradona, görev aç: [başlık], [kişi], [tarih]` → Basecamp'te todo oluştur
- `Maradona, toparla ve kaydet` → Son 5 mesajı özetle, Basecamp'e kaydet
- `Maradona, üstteki mesajı kaydet` → Bir önceki mesajı Basecamp'e kaydet

---

## 2. HER MÜŞTERİ İÇİN GEREKLİ HESAPLAR VE BİLGİLER

Her müşteri kurulumunda şu bilgileri topla:

| Bilgi | Nereden Alınır | .env Değişkeni |
|---|---|---|
| WhatsApp token | Meta Business Suite → Permanent Token | `WHATSAPP_TOKEN` |
| WhatsApp Phone Number ID | Meta for Developers → WhatsApp → API Setup | `WHATSAPP_PHONE_NUMBER_ID` |
| WhatsApp Verify Token | Sen belirle (rastgele string) | `WHATSAPP_VERIFY_TOKEN` |
| Basecamp Access Token | OAuth flow (aşağıda açıklandı) | `BASECAMP_ACCESS_TOKEN` |
| Basecamp Account ID | Basecamp URL'inden: `3.basecamp.com/{ACCOUNT_ID}` | `BASECAMP_ACCOUNT_ID` |
| Basecamp Project ID | Proje URL'inden: `/projects/{PROJECT_ID}` | `BASECAMP_PROJECT_ID` |
| Basecamp Todolist ID | Todolist URL'inden (aşağıda açıklandı) | `BASECAMP_TODOLIST_ID` |
| Anthropic API Key | console.anthropic.com | `ANTHROPIC_API_KEY` |

---

## 3. ADIM ADIM KURULUM

### 3A. Meta (WhatsApp) Kurulumu

**1. Meta Business hesabı ve App oluştur**
- https://developers.facebook.com → My Apps → Create App
- App type: Business
- WhatsApp ürününü app'e ekle

**2. Test numarasını production numarasıyla değiştir**
- WhatsApp → API Setup → "Add phone number" ile müşterinin numarasını ekle
- Numara doğrulama (SMS/arama) gerekebilir

**3. Permanent Token oluştur (KRİTİK)**
- Meta Business Suite → Settings → System Users → Add System User
- Admin yetkisi ver
- "Generate Token" → App'i seç → tüm WhatsApp permission'larını işaretle
- Bu token süresiz geçerli. 24 saatlik test tokenı KULLANMA.
- ⚠️ Token bir kez gösterilir, kaydet.

**4. Webhook Kur**
- Meta for Developers → WhatsApp → Configuration → Webhook
- Callback URL: `https://{SUNUCU_DOMAIN}/webhook`
- Verify Token: .env'deki `WHATSAPP_VERIFY_TOKEN` ile aynı şeyi yaz
- Webhook Fields: `messages` → Subscribe

**5. WABA Subscription (EN SIK ATLANAN ADIM)**
- Bu adım yapılmazsa webhook doğrulanır ama hiçbir mesaj gelmez.
- WhatsApp Business Account (WABA) ID'yi bul:
  - Meta Business Suite → Sol menü altı → Business Settings → WhatsApp Accounts
  - Veya: `GET https://graph.facebook.com/v19.0/me/businesses?access_token={TOKEN}`
- Şu API çağrısını yap (bir kez yeterli):
```
POST https://graph.facebook.com/v19.0/{WABA_ID}/subscribed_apps
Authorization: Bearer {WHATSAPP_TOKEN}
```
- PowerShell ile:
```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://graph.facebook.com/v19.0/{WABA_ID}/subscribed_apps" `
  -Headers @{ Authorization = "Bearer {TOKEN}" }
```

### 3B. Basecamp Kurulumu

**1. OAuth App oluştur (bir kez, tüm müşteriler için aynı app kullanılabilir)**
- https://launchpad.37signals.com/integrations → New Application
- Redirect URI: `https://{SUNUCU_DOMAIN}/auth/basecamp/callback`
- `BASECAMP_CLIENT_ID` ve `BASECAMP_CLIENT_SECRET` al

**2. Access Token al**
- Sunucu çalışirken: `https://{SUNUCU_DOMAIN}/auth/basecamp` adresine git
- Müşterinin Basecamp hesabıyla giriş yap → izin ver
- Token otomatik olarak terminale/log'a yazar
- `.env` dosyasına `BASECAMP_ACCESS_TOKEN` olarak ekle

**3. Account ID, Project ID, Todolist ID bul**
- Basecamp'e gir, doğru projeye git
- URL: `https://3.basecamp.com/{ACCOUNT_ID}/projects/{PROJECT_ID}`
- Todolist'e tıkla, URL: `.../todolists/{TODOLIST_ID}`
- ⚠️ Todolist ID ≠ Todoset ID. Todoset bir kapsayıcıdır. İçindeki listeye tıkla, URL'deki ID'yi al.
- Eğer liste yoksa: Basecamp'te manuel olarak bir todo listesi oluştur (örn. "Görevler"), sonra URL'den ID'yi al.

**4. Basecamp kullanıcı mapping'lerini ekle**
- Botun kişileri tanıması için `user_mappings` tablosuna kayıt ekle:
```sql
INSERT INTO user_mappings (nickname, basecamp_user_id, active)
VALUES ('Ahmet', '12345678', true);
```
- Basecamp user ID'yi bulmak için:
```
GET https://3.basecampapi.com/{ACCOUNT_ID}/people.json
Authorization: Bearer {ACCESS_TOKEN}
```
- Her kişi için `id` alanını al, nickname ile birlikte kaydet.

### 3C. Geliştirme Ortamında Sunucu ve ngrok Başlatma

**⚠️ ngrok, Windows Store üzerinden kurulu — `ngrok` komutu doğrudan çalışmaz, `.\ngrok` kullanılmalı.**

İki ayrı PowerShell penceresi aç:

**Pencere 1 — Node sunucusu:**
```powershell
cd "C:\Users\hasan\OneDrive\Desktop\claude_projects\whatsapp-task-automation-ai"
npm run dev
```

**Pencere 2 — ngrok (kalıcı URL ile):**
```powershell
cd C:\Users\hasan
.\ngrok http --url=valid-postal-grafted.ngrok-free.dev 3000
```

ngrok ekranında `Forwarding https://valid-postal-grafted.ngrok-free.dev -> http://localhost:3000` satırı görünürse sistem hazır.

---

### 3D. Sunucu Kurulumu (.env)

```env
PORT=3000
NODE_ENV=production

WHATSAPP_TOKEN=...           # Permanent system user token
WHATSAPP_VERIFY_TOKEN=...    # Kendin belirle, rastgele string
WHATSAPP_PHONE_NUMBER_ID=... # API Setup sayfasından

ANTHROPIC_API_KEY=...        # console.anthropic.com

BASECAMP_ACCESS_TOKEN=...    # OAuth flow'dan
BASECAMP_ACCOUNT_ID=...      # URL'den
BASECAMP_PROJECT_ID=...      # URL'den
BASECAMP_TODOLIST_ID=...     # URL'den (todolist, todoset değil!)
BASECAMP_CLIENT_ID=...
BASECAMP_CLIENT_SECRET=...

DATABASE_URL=postgresql://user:password@localhost:5432/maradona
REDIS_URL=redis://localhost:6379
```

---

## 4. HOSTİNGER VPS — PRODUCTION DEPLOY

### Sunucu Gereksinimleri
- Ubuntu 22.04, en küçük plan (KVM 1: 1 vCPU, 4GB RAM) yeterli
- Bir domain veya subdomain (örn. `maradona.sirketnin.com`)

### 4A. Sunucu İlk Kurulum

SSH ile bağlan, sonra sırayla çalıştır:

```bash
# Sistem güncelle
apt update && apt upgrade -y

# Node.js 20 kur
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PM2 kur (process manager)
npm install -g pm2

# Nginx kur
apt install -y nginx

# Certbot kur (HTTPS için)
apt install -y certbot python3-certbot-nginx

# PostgreSQL kur
apt install -y postgresql postgresql-contrib

# Redis kur
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
```

### 4B. PostgreSQL Kur

```bash
sudo -u postgres psql
```
```sql
CREATE USER maradona WITH PASSWORD 'güçlü_şifre_yaz';
CREATE DATABASE maradona OWNER maradona;
\q
```
```bash
# Migration çalıştır
psql -U maradona -d maradona -h localhost -f migrations/001_initial.sql
```

### 4C. Kodu Sunucuya Taşı

**Seçenek 1 — GitHub (tavsiye):**
```bash
git clone https://github.com/{kullanıcı}/maradona.git /var/www/maradona
cd /var/www/maradona
npm install --include=dev
npm run build
```

**Seçenek 2 — SCP ile direkt kopyala:**
```powershell
# Windows'tan çalıştır:
scp -r "C:\Users\hasan\OneDrive\Desktop\claude_projects\whatsapp-task-automation-ai\*" root@{SUNUCU_IP}:/var/www/maradona/
```

### 4D. .env Dosyası

```bash
nano /var/www/maradona/.env
# Tüm değerleri yapıştır, kaydet
```

### 4E. PM2 ile Başlat

```bash
cd /var/www/maradona
npm run build   # TypeScript derle

# PM2 ile başlat
pm2 start dist/server.js --name maradona

# Reboot'ta otomatik başlasın
pm2 startup
pm2 save
```

### 4F. Nginx Reverse Proxy

```bash
nano /etc/nginx/sites-available/maradona
```
```nginx
server {
    server_name maradona.sirketnin.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```bash
ln -s /etc/nginx/sites-available/maradona /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 4G. HTTPS (Let's Encrypt)

```bash
certbot --nginx -d maradona.sirketnin.com
# Soruları cevapla, otomatik HTTPS yapılandırır
```

### 4H. Meta Webhook URL'ini Güncelle

- Meta for Developers → WhatsApp → Configuration
- Webhook URL'ini ngrok adresinden `https://maradona.sirketnin.com/webhook` olarak değiştir
- Verify Token aynı kalır
- "Verify and Save" tıkla → başarılı olmalı

---

## 5. BİLİNEN SORUNLAR VE ÇÖZÜMLER

### S1: Webhook doğrulandı ama mesaj gelmiyor
**Belirti:** GET /webhook 200 OK, ama telefonda mesaj yazınca ngrok/server'da hiçbir POST yok.
**Sebep:** WABA (WhatsApp Business Account) sunucuya subscribe edilmemiş. Meta bunu dashboard'da göstermiyor.
**Çözüm:**
```
POST https://graph.facebook.com/v19.0/{WABA_ID}/subscribed_apps
Authorization: Bearer {TOKEN}
```
WABA_ID'yi Meta Business Suite → Business Settings → WhatsApp Accounts'tan bul.

---

### S2: 401 Unauthorized — WhatsApp token geçersiz
**Belirti:** `sendMessage` veya webhook call'larında 401 hatası.
**Sebep:** 24 saatlik geçici test tokeni kullanılıyor.
**Çözüm:** Meta Business Suite → System Users → kalıcı token oluştur. Adımlar yukarıda (3A.3).

---

### S3: Basecamp 404 — Todo oluşturmuyor
**Belirti:** `POST /todos.json` 404 döndürüyor.
**Sebep A:** `BASECAMP_TODOLIST_ID` yanlış — todoset ID verilmiş, todolist ID değil.
**Çözüm A:** Basecamp'te bir todo listesine tıkla. URL'deki `/todolists/{ID}` kısmındaki ID'yi al.
**Sebep B:** Proje veya liste silinmiş/arşivlenmiş.
**Çözüm B:** Aktif liste ID'sini tekrar kontrol et.

---

### S4: Tarih yanlış parse ediliyor
**Belirti:** "03.05.2026" yazdı, Basecamp'te Mart 4 çıktı.
**Sebep:** JavaScript'in `new Date()` fonksiyonu DD.MM.YYYY formatını anlayamıyor, MM.DD gibi yorumluyor.
**Çözüm:** `src/utils/date.ts`'de özel regex handler eklendi (kod zaten düzeltildi):
```typescript
const dotMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
if (dotMatch) return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
```

---

### S5: "Maradona" ismi görev sahibi olarak atanıyor
**Belirti:** Claude, tetikleyici kelimeyi kişi ismi olarak çıkarıyor.
**Sebep:** Prompt'ta "Maradona"nın tetikleyici kelime olduğu belirtilmemişti.
**Çözüm:** `src/prompts/taskExtraction.ts`'e kural eklendi (kod zaten düzeltildi).

---

### S6: Redis hata logları sürekli ekrana doluyor
**Belirti:** Her 2 saniyede bir Redis bağlantı hatası logu.
**Sebep:** Redis yokken ioredis sürekli yeniden bağlanmaya çalışıyor.
**Çözüm:** `src/services/context.ts`'de `retryStrategy: () => null` (kod zaten düzeltildi). Redis yoksa in-memory fallback çalışır.

---

### S7: npm install devDependencies eksik
**Belirti:** `ts-node-dev: command not found` veya TypeScript derleme hatası.
**Sebep:** `npm config` içinde `omit=dev` ayarı var.
**Çözüm:** `npm install --include=dev`

---

### S8: Port 3000 zaten kullanımda (EADDRINUSE)
**Belirti:** Sunucu başlarken `Error: listen EADDRINUSE :::3000`
**Çözüm (Windows):** `Stop-Process -Name node -Force`
**Çözüm (Linux):** `fuser -k 3000/tcp` veya `pm2 restart maradona`

---

### S9: Basecamp Access Token süresi doluyor
**Belirti:** Basecamp API 401 döndürüyor (WhatsApp'ta değil).
**Sebep:** Basecamp token 2 hafta sonra expire oluyor (refresh token ile yenilenmesi gerekiyor).
**Çözüm:** `GET /auth/basecamp` endpoint'ine git, tekrar OAuth flow yap.
**Kalıcı çözüm:** Refresh token logic ekle (henüz kodda yok — gerekirse eklenebilir).

---

## 6. YENİ MÜŞTERİ İÇİN KONTROL LİSTESİ

```
[ ] Meta Business hesabı var mı?
[ ] WhatsApp Cloud API app oluşturuldu mu?
[ ] Müşterinin numarası app'e eklendi mi?
[ ] Permanent system user token oluşturuldu mu?
[ ] .env'e WHATSAPP_TOKEN ve PHONE_NUMBER_ID girildi mi?
[ ] Sunucu başlatıldı ve /webhook GET 200 döndürüyor mu?
[ ] Meta'da webhook URL girildi, messages subscribe edildi mi?
[ ] WABA subscribed_apps API çağrısı yapıldı mı? (S1 — en sık atlanan)
[ ] Basecamp OAuth flow tamamlandı mı? (BASECAMP_ACCESS_TOKEN alındı mı?)
[ ] Doğru ACCOUNT_ID / PROJECT_ID / TODOLIST_ID girildi mi?
[ ] Todolist ID, todoset değil gerçek liste ID'si mi?
[ ] Test mesajı gönderildi ve Basecamp'te todo oluştu mu?
[ ] user_mappings tablosuna ekip üyeleri eklendi mi?
```

---

## 7. MALİYET TAHMİNİ

### Sabit Aylık Maliyetler

| Servis | Plan | Aylık Maliyet |
|---|---|---|
| Hostinger VPS KVM 1 | 1 vCPU, 4GB RAM, 50GB SSD | ~$5-8 |
| Domain (opsiyonel) | .com | ~$1 (yıllık ~$12) |
| **Altyapı toplamı** | | **~$6-9/ay** |

### Kullanıma Göre Değişen Maliyetler

**Anthropic (Claude API):**
- Model: claude-sonnet-4-6
- Her tetikleyici mesaj: ~1 API çağrısı, ~500-800 token giriş + ~100 token çıkış
- Fiyat: ~$3/1M giriş token, ~$15/1M çıkış token
- 1000 görev/ay ≈ ~$2-3/ay
- 10.000 görev/ay ≈ ~$20-30/ay

**WhatsApp Business API:**
- İlk 1000 konuşma/ay ücretsiz (Meta politikası)
- Sonrası: ~$0.005-0.08/konuşma (ülkeye göre değişir, Türkiye ~$0.05)
- 1000 konuşma/ay = ücretsiz
- 5000 konuşma/ay ≈ ~$200/ay

**Basecamp:**
- Mevcut Basecamp aboneliğine ek maliyet yok (API kullanımı ücretsiz)

**Redis / PostgreSQL:**
- Sunucuda kurulu, ayrı ücret yok

### Tipik Kullanım Senaryoları

| Senaryo | WhatsApp | Claude API | VPS | Toplam/Ay |
|---|---|---|---|---|
| Küçük ekip (100 görev/ay) | Ücretsiz | ~$0.3 | $7 | ~$7-8 |
| Orta ekip (1000 görev/ay) | Ücretsiz | ~$3 | $7 | ~$10 |
| Büyük ekip (5000 görev/ay) | ~$200 | ~$15 | $7 | ~$220 |

> WhatsApp maliyeti, konuşma başına hesaplanıyor. Bot her tetiklendiğinde bir konuşma sayılır.
> Büyük hacimlerde WhatsApp dominant maliyet oluyor.

---

## 8. CLAUDE'A VERİLECEK ÖZET (Hızlı Referans)

Bir sonraki Claude oturumunda şunu söyle:

> "Maradona projesini kuruyoruz. TypeScript + Fastify + WhatsApp Cloud API + Claude AI + Basecamp.
> Tetikleyici 'Maradona' kelimesi. src/routes/webhook.ts ana akış.
> Bilinen sorunlar: WABA subscribed_apps (S1), permanent token (S2), todolist vs todoset ID (S3).
> Kontrol listesi ve tüm detaylar KURULUM.md dosyasında."
