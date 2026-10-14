# Baskı Masası

Kırtasiyeler için sürükle-bırak çıktı hazırlama uygulaması (Windows masaüstü).

Kapak görseli, kareli, çizgili vb. sayfaları sürükleyip bırakarak bir defter/kitapçık dizilir.
Program arkalı önlü baskıda hangi sayfanın hangi kağıdın önüne ya da arkasına düşeceğini
kendisi hesaplar. Sonra tek tuşla **PDF olarak kaydeder** ve **yazıcıya gönderir**.

## Neler yapılabilir?

- **Cilt türü:** Yeni bir iş başlarken program defterin nasıl ciltleneceğini sorar. Seçime göre baskı yönü ve boşluklar kendiliğinden ayarlanır.
  - *Yandan spiral:* Arka yüzler uzun kenardan çevrilir. Spiral payı ön yüzlerde solda, arka yüzlerde sağda bırakılır.
  - *Üstten spiral:* Bloknot gibi yukarı açılır. Arka yüzler kısa kenardan çevrilir ki ters çıkmasın. Spiral payı ön yüzlerde üstte, arka yüzlerde altta bırakılır.
  - *Kitapçık (ortadan zımba):* Bir kağıda yan yana 2 sayfa basılır (A5 kitapçık için A4, A4 kitapçık için A3 kağıt). Sayfa sırası otomatik dizilir (8 sayfada 8|1, 2|7, 6|3, 4|5). Sayfa sayısı 4'ün katına tamamlanır; boş sayfalar arka kapaktan önceye konur. Kalın kitapçıklar formalara bölünebilir.
  - *Ciltsiz:* Sayfalar ayrı ayrı kullanılır.
- **Defter görünümü (Önizle / Boşluk tuşu):** Defter, PDF'e çevrilmeden cilt türüne göre açılmış halde görünür: yandan spiralde yan yana, üstten spiralde alt alta, kitapçıkta ortadan katlanmış.
  Sayfalar animasyonla çevrilir (tıklayarak, ←/→ tuşlarıyla ya da kaydırma çubuğuyla). Alttaki şablon ve görsel şeritinden bir sayfanın üstüne sürüklenen öğe yalnızca o sayfayı değiştirir; 45 sayfalık kareli bloğun ortasındaki tek bir sayfa çizgili yapılabilir.
  ↻ düğmesi görsel ve PDF sayfalarını 90° döndürür.
- **Yazı ve logo:** Bir sayfa kartına çift tıklayın, Enter'a basın ya da soldaki "Yazı ekle" / "Logo ekle" kutusunu kartın üstüne sürükleyin. Sayfa düzenleyici açılır.
  - Yazı ve logo fareyle sürüklenir, köşesindeki noktadan büyütülür. Sayfanın ortasına yaklaşınca kendiliğinden ortaya oturur.
  - **Ok tuşları** 1 mm kaydırır (Shift: 5 mm, Alt: 0,2 mm). Delete siler, Ctrl+D çoğaltır. Konum milimetre olarak da girilebilir, hizalama düğmeleri (sola, ortala, sağa, üste, alta) var.
  - Yazı tipi, boyut, renk, kalın/italik, hizalama, döndürme ve saydamlık ayarlanır.
  - **Logo için "Arkasını şeffaf yap":** Logonun etrafındaki düz renkli (genelde beyaz) zemin kaldırılır. Hassasiyet ayarlanabilir; "İç boşlukları da sil" seçeneği vardır; "Orijinale dön" ile geri alınır.
  - **Diğer sayfalara uygula:** Öğe başka kartlara kopyalanır ("Tümü", "Kapaklar hariç", "Aynı türdekiler" ya da tek tek seçerek). Bağlantılı kopyalarda birinde yapılan değişiklik hepsine geçer.
  - Bir karttaki öğe o karttaki tüm sayfalara (örneğin 45 kareli sayfanın hepsine) basılır. "Sadece ilk sayfa için ayır" ile tek sayfaya özel yapılabilir.
  - Yazıda `{s}` sayfa numarasına, `{t}` toplam sayfa sayısına dönüşür. **"Sayfa numarası ekle"** tek tıkla kapaklar hariç tüm sayfalara numara koyar. Arka yüzlerde numara dış kenara geçer ("Arka yüzlerde sağ-sol yansıt").
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
- **Yazdırma:** Cilt türüne göre önerilen çevirme yönü işaretli gelir. Yazıcı seçimi, kopya sayısı, arkalı önlü (uzun ya da kısa kenar), tek yüz ve **elle arkalı önlü** (çift yüz basamayan yazıcılar için 2 turda, yönlendirmeli; üstten spiral ve kitapçıkta arka yüzler gerekiyorsa 180° çevrilir).
  İsterseniz yazdırmadan önce PDF de kaydedilir.
- **PDF kaydet:** Seçilen boyutta (A4, A5, B5, Letter; dikey ya da yatay) kenar boşluksuz PDF üretir.
- **İşi kaydet / aç:** Hazırlanan düzen `.baski` dosyası olarak saklanır ve sonra tekrar açılabilir.
- **Kısayollar:** Boşluk (defter görünümü), Ctrl+Z / Ctrl+Y (geri al / yinele), Ctrl+P (yazdır), Ctrl+S (PDF), Ctrl+D (çoğalt), Enter (yazı/logo düzenle), Delete (sil), ←/→ (sayfalar arasında gezin).

## Çalıştırma (geliştirme)

[Node.js](https://nodejs.org) 18 veya üzeri gerekir.

```bash
cd baski-masasi
npm install
npm start
```

Programı kurmadan denemek için `renderer/index.html` dosyasını Chrome ya da Edge'de açabilirsiniz.
Bu modda PDF ve yazdırma işlemi tarayıcının yazdırma penceresi üzerinden yapılır ve arkalı önlü ayarını o pencereden seçmeniz gerekir.

## Windows kurulum dosyası

Kırtasiyeye gönderilecek dosya **`BaskiMasasi-Kurulum-1.0.0.exe`**. Programın çalışması için gereken her şey bu dosyanın içindedir; karşı bilgisayara Node.js veya başka bir şey kurmak gerekmez.

- **Kurulum:** Çift tıklanınca soru sormadan kurulur ve program açılır. Yönetici izni istemez. Masaüstüne ve Başlat menüsüne "Baskı Masası" kısayolu ekler. Kaldırmak için Ayarlar → Uygulamalar menüsü kullanılır.
- **`BaskiMasasi-Tasinabilir-1.0.0.exe`:** Kurulum yapmadan doğrudan çalışır (USB bellekten de olur).
- **Gereken sistem:** Windows 10 veya 11, 64 bit. Windows 7/8'de çalışmaz.
- **İlk açılışta "Windows bilgisayarınızı korudu" uyarısı:** Program dijital imzalı olmadığı için çıkar. **Ek bilgi → Yine de çalıştır** ile açılır.

### Exe dosyasını üretmek

- **Kolay yol (GitHub):** Kod GitHub'a her gönderildiğinde `.github/workflows/baski-masasi-windows.yml` gerçek bir Windows makinede exe dosyalarını üretir. GitHub → **Actions** → **Baskı Masası Windows** → son çalıştırma → **Artifacts** → `BaskiMasasi-Windows` zip'ini indirin. Elle başlatmak için **Run workflow** düğmesi vardır.
- **Kendi bilgisayarınızda:** [Node.js](https://nodejs.org) LTS kurulu bir Windows'ta `npm install` ve ardından `npm run dist` çalıştırın; dosyalar `dist/` klasörüne çıkar.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `main.js` | Electron ana süreç: pencere, PDF'e çevirme, yazıcıya gönderme, dosya diyalogları |
| `preload.js` | Arayüze güvenli masaüstü köprüsü (`window.desktop`) |
| `renderer/index.html` | Ekran düzeni |
| `renderer/app.js` | Sürükle-bırak, sayfa listesi, baskı planı, yazdırma akışı |
| `build/icon.png` | Program ve kurulum simgesi |
| `renderer/editor.js` | Sayfa düzenleyici: yazı ve logo katmanları, şeffaf arka plan, diğer sayfalara uygulama |
| `renderer/preview.js` | Defter görünümü: açılmış defter, sayfa çevirme, tek sayfa değiştirme |
| `renderer/templates.js` | Kareli, çizgili vb. şablonların SVG üretimi |
| `renderer/styles.css` | Görünüm |
| `renderer/vendor/` | PDF okumak için [pdf.js](https://mozilla.github.io/pdf.js/) 3.11 (Apache 2.0). `npm run vendor` ile yeniden kopyalanır |
