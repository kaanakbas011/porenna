'use strict';
/*
  Varsayılan şablonlar ve ilk kullanıcılar.
  Alan tipleri: section, text, textarea, number, date, time, select, checkbox, checklist, signature
*/

const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

const ortakBaslik = [
  f('sec_genel', 'Genel Bilgiler', 'section'),
  f('is_emri_no', 'İş Emri / Servis No', 'text', { placeholder: 'Örn. SR-2026-0142' }),
  f('ekip', 'Çalışan Ekip', 'text', { placeholder: 'İsimler' }),
  f('baslangic', 'Başlangıç Saati', 'time'),
  f('bitis', 'Bitiş Saati', 'time'),
];

const ortakSon = [
  f('sec_sonuc', 'Sonuç', 'section'),
  f('is_durumu', 'İş Durumu', 'select', { options: ['Tamamlandı', 'Kısmen tamamlandı', 'Ek çalışma gerekli', 'İptal'], required: true }),
  f('kullanilan_malzeme', 'Kullanılan Malzemeler', 'textarea', { placeholder: 'Malzeme adı, miktar, birim' }),
  f('aciklama', 'Yapılan İşin Açıklaması', 'textarea', { required: true, placeholder: 'Ne yapıldı, nasıl yapıldı, varsa karşılaşılan sorunlar' }),
  f('oneriler', 'Öneriler / Sonraki Adımlar', 'textarea'),
  f('musteri_adi', 'Teslim Alan Müşteri Yetkilisi', 'text'),
  f('musteri_imza', 'Müşteri İmzası', 'signature'),
];

const TEMPLATES = [
  {
    name: 'Elektrik Tesisatı Kurulum Raporu',
    category: 'Kurulum',
    description: 'Yeni tesisat çekimi, priz/anahtar/hat montajı ve devreye alma işleri için.',
    fields: [
      ...ortakBaslik,
      f('sec_tesisat', 'Tesisat Bilgileri', 'section'),
      f('tesisat_tipi', 'Tesisat Tipi', 'select', { options: ['Konut', 'İşyeri', 'Sanayi', 'Şantiye geçici'], required: true }),
      f('kablo_kesit', 'Kullanılan Kablo Kesitleri', 'text', { placeholder: 'Örn. 3x2.5 NYM, 3x4 NYM' }),
      f('hat_sayisi', 'Çekilen Hat / Sigorta Sayısı', 'number' ),
      f('kontroller', 'Yapılan Kontroller', 'checklist', { options: ['İzolasyon ölçümü yapıldı', 'Topraklama sürekliliği kontrol edildi', 'Kaçak akım rölesi test edildi', 'Faz sırası kontrol edildi', 'Etiketleme yapıldı'] }),
      f('izolasyon_degeri', 'İzolasyon Direnci (MΩ)', 'number'),
      f('kacak_akim_ms', 'Kaçak Akım Rölesi Açma Süresi (ms)', 'number'),
      ...ortakSon,
    ],
  },
  {
    name: 'Arıza Tespit ve Onarım Raporu',
    category: 'Arıza',
    description: 'Müşteri arıza çağrısı sonrası yapılan tespit ve onarım işleri için.',
    fields: [
      ...ortakBaslik,
      f('sec_ariza', 'Arıza Bilgileri', 'section'),
      f('sikayet', 'Müşteri Şikayeti', 'textarea', { required: true }),
      f('ariza_tipi', 'Arıza Tipi', 'select', { options: ['Kısa devre', 'Kaçak akım', 'Gevşek bağlantı', 'Sigorta atması', 'Faz kaybı', 'Aydınlatma arızası', 'Priz/Anahtar arızası', 'Diğer'], required: true }),
      f('tespit', 'Tespit Edilen Neden', 'textarea', { required: true }),
      f('acil', 'Acil müdahale gerektirdi', 'checkbox'),
      f('yapilan_onarim', 'Yapılan Onarım', 'checklist', { options: ['Kablo değişimi', 'Sigorta değişimi', 'Kaçak akım rölesi değişimi', 'Bağlantı sıkma/yenileme', 'Priz/anahtar değişimi', 'Armatür değişimi', 'Pano düzenleme'] }),
      f('olcum_oncesi', 'Ölçüm (Önce)', 'text', { placeholder: 'V / A / MΩ' }),
      f('olcum_sonrasi', 'Ölçüm (Sonra)', 'text', { placeholder: 'V / A / MΩ' }),
      ...ortakSon,
    ],
  },
  {
    name: 'Periyodik Bakım ve Kontrol Raporu',
    category: 'Bakım',
    description: 'Sözleşmeli müşterilerde yapılan düzenli bakım ve kontrol ziyaretleri için.',
    fields: [
      ...ortakBaslik,
      f('sec_bakim', 'Bakım Kontrol Listesi', 'section'),
      f('bakim_periyodu', 'Bakım Periyodu', 'select', { options: ['Aylık', '3 Aylık', '6 Aylık', 'Yıllık'] }),
      f('pano_kontrol', 'Pano Kontrolleri', 'checklist', { options: ['Bağlantı terminalleri sıkıldı', 'Termal kamera / sıcaklık kontrolü', 'Sigorta ve şalter işlevleri test edildi', 'Kaçak akım röleleri test edildi', 'Pano içi temizlik yapıldı', 'Etiketler kontrol edildi'] }),
      f('aydinlatma_kontrol', 'Aydınlatma Kontrolleri', 'checklist', { options: ['Arızalı armatürler değiştirildi', 'Acil aydınlatma test edildi', 'Sensörler kontrol edildi'] }),
      f('topraklama_kontrol', 'Topraklama Kontrolü', 'checklist', { options: ['Topraklama direnci ölçüldü', 'Eş potansiyel bara kontrol edildi', 'Paratoner kontrol edildi'] }),
      f('topraklama_ohm', 'Topraklama Direnci (Ω)', 'number'),
      f('bulgular', 'Bulgular / Uygunsuzluklar', 'textarea'),
      f('risk', 'Risk Seviyesi', 'select', { options: ['Yok', 'Düşük', 'Orta', 'Yüksek – acil müdahale'] }),
      ...ortakSon,
    ],
  },
  {
    name: 'Pano Montaj ve Devreye Alma Raporu',
    category: 'Kurulum',
    description: 'Ana / tali pano montajı, kompanzasyon ve devreye alma işleri için.',
    fields: [
      ...ortakBaslik,
      f('sec_pano', 'Pano Bilgileri', 'section'),
      f('pano_tipi', 'Pano Tipi', 'select', { options: ['Ana dağıtım panosu', 'Tali pano', 'Kompanzasyon panosu', 'Sayaç panosu', 'Otomasyon panosu'] , required: true }),
      f('ana_salter', 'Ana Şalter Değeri (A)', 'number'),
      f('kacak_akim', 'Kaçak Akım Rölesi', 'select', { options: ['30 mA', '300 mA', 'Yok'] }),
      f('devreye_alma', 'Devreye Alma Kontrolleri', 'checklist', { options: ['Faz sırası doğru', 'Gerilim değerleri ölçüldü', 'Nötr-toprak ayrımı kontrol edildi', 'Etiketleme ve şema panoya konuldu', 'Kompanzasyon ayarı yapıldı', 'Müşteriye teslim edildi'] }),
      f('gerilim_l1', 'L1-N (V)', 'number'),
      f('gerilim_l2', 'L2-N (V)', 'number'),
      f('gerilim_l3', 'L3-N (V)', 'number'),
      ...ortakSon,
    ],
  },
  {
    name: 'Topraklama Ölçüm Raporu',
    category: 'Ölçüm',
    description: 'Topraklama direnci ölçümleri ve uygunluk değerlendirmesi için.',
    fields: [
      ...ortakBaslik,
      f('sec_olcum', 'Ölçüm Bilgileri', 'section'),
      f('cihaz', 'Ölçüm Cihazı (Marka / Model / Seri No)', 'text', { required: true }),
      f('kalibrasyon', 'Kalibrasyon Tarihi', 'date'),
      f('yontem', 'Ölçüm Yöntemi', 'select', { options: ['3 kazıklı (62%)', 'Pens (klamp) yöntemi', 'Çevrim empedansı'] }),
      f('hava', 'Hava / Zemin Durumu', 'text', { placeholder: 'Kuru, nemli, yağışlı…' }),
      f('olcum1', 'Ölçüm Noktası 1 (Ω)', 'number'),
      f('olcum2', 'Ölçüm Noktası 2 (Ω)', 'number'),
      f('olcum3', 'Ölçüm Noktası 3 (Ω)', 'number'),
      f('uygunluk', 'Sonuç', 'select', { options: ['Uygun', 'Uygun değil – iyileştirme gerekli'], required: true }),
      ...ortakSon,
    ],
  },
  {
    name: 'Aydınlatma Montaj Raporu',
    category: 'Kurulum',
    description: 'İç/dış mekan aydınlatma armatür montajı ve otomasyon işleri için.',
    fields: [
      ...ortakBaslik,
      f('sec_aydinlatma', 'Montaj Bilgileri', 'section'),
      f('alan', 'Montaj Alanı', 'text', { placeholder: 'Örn. Depo, otopark, ofis katı' }),
      f('armatur', 'Armatür Tipi ve Adedi', 'textarea', { placeholder: 'Örn. 60W LED panel x 24' }),
      f('kontrol_tipi', 'Kontrol Tipi', 'select', { options: ['Anahtar', 'Hareket sensörü', 'Zaman rölesi', 'DALI / Otomasyon'] }),
      f('kontrol_listesi', 'Kontroller', 'checklist', { options: ['Tüm armatürler çalışıyor', 'Acil aydınlatma test edildi', 'Montaj sağlamlığı kontrol edildi', 'Kablolama kanal içine alındı'] }),
      ...ortakSon,
    ],
  },
  {
    name: 'Günlük Şantiye İş Raporu',
    category: 'Şantiye',
    description: 'Uzun süreli şantiye işlerinde günlük ilerleme ve ekip raporu.',
    fields: [
      f('sec_gun', 'Gün Bilgileri', 'section'),
      f('santiye', 'Şantiye / Proje Adı', 'text', { required: true }),
      f('hava_durumu', 'Hava Durumu', 'select', { options: ['Açık', 'Bulutlu', 'Yağmurlu', 'Karlı', 'Rüzgarlı'] }),
      f('personel_sayisi', 'Sahadaki Personel Sayısı', 'number'),
      f('calisma_saati', 'Toplam Çalışma Saati', 'number'),
      f('sec_ilerleme', 'İlerleme', 'section'),
      f('yapilan_isler', 'Bugün Yapılan İşler', 'textarea', { required: true }),
      f('ilerleme_yuzde', 'Genel İlerleme (%)', 'number'),
      f('malzeme_giris', 'Sahaya Gelen Malzeme', 'textarea'),
      f('sorunlar', 'Sorunlar / Gecikmeler', 'textarea'),
      f('isg', 'İSG Kontrolleri', 'checklist', { options: ['KKD kullanımı kontrol edildi', 'Enerji kesme/kilitleme (LOTO) uygulandı', 'Çalışma alanı güvenliği sağlandı', 'Olay / ramak kala yok'] }),
      f('yarin_plan', 'Yarının Planı', 'textarea'),
    ],
  },
  {
    name: 'Serbest Rapor',
    category: 'Genel',
    description: 'Boş şablon. Sadece başlık ve serbest metin; istediğiniz alanları kendiniz ekleyin.',
    fields: [
      f('icerik', 'Rapor İçeriği', 'textarea', { required: true, placeholder: 'Raporunuzu buraya yazın…' }),
    ],
  },
];

const USERS = [
  { username: 'mudur', name: 'Firma Müdürü', role: 'mudur', password: '1234' },
  { username: 'ahmet', name: 'Ahmet Yılmaz', role: 'teknisyen', password: '1234' },
  { username: 'mehmet', name: 'Mehmet Kaya', role: 'teknisyen', password: '1234' },
];

module.exports = { TEMPLATES, USERS };
