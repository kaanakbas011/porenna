# Baskı Masası

Kırtasiyeler için sürükle-bırak çıktı hazırlama uygulaması (Windows masaüstü).

Kapak görseli, kareli, çizgili vb. sayfaları sürükleyip bırakarak bir defter/kitapçık dizilir.
Program arkalı önlü baskıda hangi sayfanın hangi kağıdın önüne ya da arkasına düşeceğini
kendisi hesaplar. Sonra tek tuşla **PDF olarak kaydeder** ve **yazıcıya gönderir**.

## Neler yapılabilir?

- **Temsili sayfa yerleri:** Açılışta "Ön kapak / İç sayfalar / Arka kapak" yerleri hazır gelir. Soldan şablon ya da görsel sürükleyip bu yerlere bırakın.
- **Hazır şablonlar:** Boş, Kareli 5 mm, Kareli 1 cm, Çizgili 8 mm (sol kenar çizgili), Geniş çizgili, Noktalı, Milimetrik, Güzel yazı, Nota defteri, Cornell not.
  Aralık, renk, çizgi kalınlığı, kenar boşluğu ve "Ad Soyad / Tarih" satırı ayarlanabilir. Şablonlar vektör olarak üretildiği için baskıda keskin çıkar.
- **Görseller:** Masaüstünden görselleri sürükleyip doğrudan bir sayfanın üstüne veya sol taraftaki görsel alanına bırakın. Yerleşim seçenekleri: Doldur, Sığdır, Esnet.
- **PDF içe aktarma:** Hazır PDF'leri (ödev, fotokopi, föy) masaüstünden sürükleyip bir sayfa yerine ya da sol alana bırakın. Her sayfa 300 dpi kalitede alınır.
  PDF tek kart olarak durur. Sayfa aralığı (örneğin 2–5) ve kaç kez basılacağı seçilebilir. "Sayfalara böl" düğmesi her sayfayı ayrı kart yapar, böylece araya kareli/çizgili sayfa eklenebilir.
  Yatay PDF sayfaları dikey kağıda (ya da tersi) otomatik döndürülerek yerleştirilir. Şifreli PDF'ler açılamaz.
- **Sayfa adedi:** Bir sayfayı seçip adet girin. Örneğin kareliyi 45 sayfaya çıkarın. Kart üst üste binmiş görünür ve "×45" rozeti taşır.
- **Araya ekleme / sıralama:** Bir kartın ortasına bırakmak içeriğini değiştirir, kenarına bırakmak araya yeni sayfa ekler. Kartları sürükleyerek sıralayabilir, çöp alanına bırakarak silebilirsiniz.
- **Baskı planı:** Toplam sayfa ve kağıt sayısını, her yaprağın ön ve arka yüzünü gösterir. Örneğin arka kapak son kağıdın ön yüzüne düşüyorsa uyarır ve tek tıkla düzeltir.
  "Bu sayfanın arkası boş kalsın" seçeneği kapakların arkasına otomatik boş sayfa koyar.
- **Yazdırma:** Yazıcı seçimi, kopya sayısı, arkalı önlü (uzun ya da kısa kenar), tek yüz ve **elle arkalı önlü** (çift yüz basamayan yazıcılar için 2 turda, yönlendirmeli).
  İsterseniz yazdırmadan önce PDF de kaydedilir.
- **PDF kaydet:** Seçilen boyutta (A4, A5, B5, Letter; dikey ya da yatay) kenar boşluksuz PDF üretir.
- **İşi kaydet / aç:** Hazırlanan düzen `.baski` dosyası olarak saklanır ve sonra tekrar açılabilir.
- **Kısayollar:** Ctrl+Z / Ctrl+Y (geri al / yinele), Ctrl+P (yazdır), Ctrl+S (PDF), Ctrl+D (çoğalt), Delete (sil), ←/→ (sayfalar arasında gezin).

## Çalıştırma (geliştirme)

[Node.js](https://nodejs.org) 18 veya üzeri gerekir.

```bash
cd baski-masasi
npm install
npm start
```

Programı kurmadan denemek için `renderer/index.html` dosyasını Chrome ya da Edge'de açabilirsiniz.
Bu modda PDF ve yazdırma işlemi tarayıcının yazdırma penceresi üzerinden yapılır ve arkalı önlü ayarını o pencereden seçmeniz gerekir.

## Windows kurulum dosyası üretme

Bir Windows bilgisayarda:

```bash
npm install
npm run dist
```

`dist/` klasöründe bir kurulum dosyası (`Baskı Masası Setup 1.0.0.exe`) ve kurulum gerektirmeyen taşınabilir bir `.exe` oluşur.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `main.js` | Electron ana süreç: pencere, PDF'e çevirme, yazıcıya gönderme, dosya diyalogları |
| `preload.js` | Arayüze güvenli masaüstü köprüsü (`window.desktop`) |
| `renderer/index.html` | Ekran düzeni |
| `renderer/app.js` | Sürükle-bırak, sayfa listesi, baskı planı, yazdırma akışı |
| `renderer/templates.js` | Kareli, çizgili vb. şablonların SVG üretimi |
| `renderer/styles.css` | Görünüm |
| `renderer/vendor/` | PDF okumak için [pdf.js](https://mozilla.github.io/pdf.js/) 3.11 (Apache 2.0). `npm run vendor` ile yeniden kopyalanır |
