# Saha Rapor

Elektrik işi yapan firmalar için **iş bitirme / saha raporu** uygulaması.
Teknisyen işi bitirince telefonundan raporu yazar, fotoğraf ve video ekler,
"Müdüre Gönder" der; rapor anında müdürün ekranına düşer. Müdür onaylar ya da
revizyon ister.

Tek bir Node.js dosyasıyla çalışır, ek paket kurulumu gerektirmez.

## Özellikler

- **Hazır şablonlar** (elektrik işlerine özel, 8 adet):
  Tesisat Kurulum, Arıza Tespit ve Onarım, Periyodik Bakım, Pano Montaj ve
  Devreye Alma, Topraklama Ölçüm, Aydınlatma Montaj, Günlük Şantiye Raporu,
  Serbest Rapor.
- **Şablon düzenleme**: Müdür firma şablonlarını düzenler. Teknisyen bir
  şablonu kopyalayıp kendine göre değiştirebilir ya da sıfırdan kendi
  şablonunu yazabilir. Alan tipleri: kısa metin, uzun metin, sayı, tarih,
  saat, seçim listesi, onay kutusu, çoklu seçim, imza, bölüm başlığı.
- **Rapor içinde alan düzenleme**: Teknisyen tek bir rapor için alanları
  değiştirebilir, isterse bunu yeni şablon olarak kaydedebilir.
- **Fotoğraf ve video**: Telefonda doğrudan kamera ile çekme, galeriden
  seçme, sürükle-bırak. Her eke açıklama yazılabilir ("Pano önce / sonra").
  Videolar tarayıcıda oynatılır (Range desteği), fotoğraflar büyütülür.
- **Müşteri imzası**: Parmakla imza alanı.
- **Müdür ekranı**: Yeni raporlar canlı olarak düşer (sayfa yenilemeden),
  sekme arka plandayken tarayıcı bildirimi. İncelendi / Onayla / Revizyon
  iste; revizyon notu teknisyene anında iletilir ve rapor yeniden açılır.
- **Otomatik taslak kaydı**: Yazarken 1,5 saniyede bir kaydedilir.
- **Zorunlu alan kontrolü**: Eksik alanla gönderilemez.
- **Yazdır / PDF**: Rapor görünümü yazıcı dostu; tarayıcıdan PDF alınır.
- **Ekip yönetimi**: Müdür kullanıcı ekler, pasife alır, şifre sıfırlar.
- **Arama ve filtreler**, günlük/haftalık istatistik, teknisyen bazında özet.
- Mobil öncelikli arayüz, açık/koyu tema, "Ana ekrana ekle" ile uygulama gibi
  kullanım.

## Kurulum ve çalıştırma

Gereksinim: **Node.js 22.5 veya üstü** (yerleşik SQLite kullanılır, başka
bağımlılık yok).

```bash
cd saha-rapor
npm start            # http://localhost:3000
```

Farklı port veya yükleme limiti:

```bash
PORT=8080 MAX_UPLOAD_MB=500 npm start
```

İlk açılışta otomatik oluşturulan hesaplar:

| Kullanıcı | Şifre | Rol       |
|-----------|-------|-----------|
| mudur     | 1234  | Müdür     |
| ahmet     | 1234  | Teknisyen |
| mehmet    | 1234  | Teknisyen |

Giriş yaptıktan sonra **Ayarlar → Şifre değiştir** ile şifreleri değiştirin;
**Ekip** sayfasından gerçek personeli ekleyin.

Veriler `data/saha-rapor.db` dosyasında, ekler `uploads/` klasöründe tutulur.
Yedek almak için bu iki yeri kopyalamak yeterlidir.

## Sahada kullanım

Teknisyenlerin telefonundan ulaşabilmesi için sunucunun ofis ağında ya da
internette erişilebilir olması gerekir. En basit yol: ofisteki bir
bilgisayarda çalıştırıp yerel ağ IP'si ile (`http://192.168.1.20:3000` gibi)
açmak. İnternet üzerinden kullanım için bir VPS'e kurup önüne HTTPS veren bir
ters vekil (Caddy, nginx) koymanız önerilir; kamera erişimi ve tarayıcı
bildirimleri HTTPS ister.

## Dosya yapısı

```
saha-rapor/
├── server.js          # HTTP sunucu + API + SQLite şeması + dosya yükleme + SSE
├── seed.js            # Hazır şablonlar ve ilk kullanıcılar
├── public/
│   ├── index.html
│   ├── app.js         # Tek sayfa uygulama (teknisyen + müdür ekranları)
│   ├── style.css
│   └── icon.svg
├── data/              # SQLite veritabanı (git'e girmez)
└── uploads/           # Fotoğraf / video ekleri (git'e girmez)
```

## API özeti

| Yöntem | Yol | Açıklama |
|--------|-----|----------|
| POST | /api/login, /api/logout | Oturum |
| GET | /api/me · POST /api/me/password | Profil, şifre |
| GET/POST | /api/users · PATCH /api/users/:id | Ekip (müdür) |
| GET/POST | /api/templates · PUT/DELETE /api/templates/:id | Şablonlar |
| GET/POST | /api/reports · GET/PUT/DELETE /api/reports/:id | Raporlar |
| POST | /api/reports/:id/submit | Müdüre gönder |
| POST | /api/reports/:id/review | İncelendi / onayla / revizyon (müdür) |
| POST | /api/reports/:id/attachments | Ek yükle (ham gövde, `X-Filename` başlığı) |
| PATCH/DELETE | /api/attachments/:id | Ek açıklaması / silme |
| GET | /api/stats | Sayaçlar |
| GET | /api/events | Canlı olaylar (SSE) |

Rapor durumları: `taslak → gonderildi → incelendi / onaylandi / revizyon`.
Revizyon istenen rapor teknisyene geri açılır, düzeltip yeniden gönderir.

## Benzer uygulamalar (araştırma özeti)

Program tasarlanırken şu ürünlerin yaklaşımı incelendi:

- **SafetyCulture (iAuditor)** – şablon kütüphanesi, mobil form, fotoğraflı
  kontrol listeleri, PDF/Word rapor paylaşımı. 10 kişiye kadar ücretsiz.
- **GoCanvas / Jotform** – elektrikçi iş emri ve servis raporu şablonları;
  sürükle-bırak form düzenleyici, otomatik PDF.
- **Fieldwire (Hilti)** – şantiye günlük raporları, fotoğraf/video ekleri,
  özel formlar üst paketlerde.
- **Jobber, Simpro, Tradify** – saha servis yönetimi; iş emri, özel kontrol
  listeleri, müşteri onayı.
- **JobShot / SnapReport** – "önce / sonra" fotoğraf odaklı iş bitirme raporu.

Bu uygulamaların ortak noktaları (şablon kütüphanesi + özelleştirme, önce/
sonra fotoğraf, ofise anlık düşen rapor, onay akışı, PDF çıktısı) bu projede
sade ve Türkçe olarak, aylık abonelik olmadan bir araya getirildi.
